import base64
import json
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

import cv2
import numpy as np
from fastapi.testclient import TestClient

from backend.app import app
from backend.modulos.prediccion import analisis_experimental as experimental
from backend.modulos.prediccion.seguimiento import analizar_estudiantes


def imagen_b64():
    _, jpg = cv2.imencode(".jpg", np.zeros((120, 120, 3), dtype=np.uint8))
    return base64.b64encode(jpg).decode("ascii")


class ExperimentalTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def enviar(self, **fuentes):
        return self.client.post("/api/prediccion/analisis-experimental", json={"schema_version": 1, **fuentes})

    def test_imagen_sin_rostro_y_audio_ausente(self):
        respuesta = self.enviar(imagen={"imagen_b64": imagen_b64()})
        self.assertEqual(respuesta.status_code, 200)
        salida = respuesta.json()
        self.assertEqual(salida["fuentes"]["imagen"]["rostros_detectados"], 0)
        self.assertEqual(salida["fuentes"]["audio"]["estado"], "sin_entrada")
        self.assertEqual(salida["sincronizacion"]["estado"], "fuentes_insuficientes")

    def test_foto_corrupta_registra_tiempos_sin_cargar_modelos(self):
        corrupta = base64.b64encode(b"No es una imagen").decode("ascii")
        with patch.object(experimental.modelos_fase7, "obtener_modelo") as cargar:
            respuesta = self.enviar(imagen={"imagen_b64": corrupta, "modelo_facial": "real"})
        cargar.assert_not_called()
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.json()["fuentes"]["imagen"]["estado"], "imagen_invalida")
        self.assertRegex(respuesta.headers["Server-Timing"], r"^entrada;dur=\d+\.\d, evaluacion;dur=\d+\.\d, serializacion;dur=\d+\.\d{3}$")

    def test_deteccion_pequena_y_multiple_no_carga_clasificador(self):
        casos = (
            ([(5, 10, 49, 49)], "rostro_pequeno"),
            ([(5, 10, 49, 49), (60, 30, 55, 55)], "multiples_rostros"),
        )
        for cajas, estado in casos:
            with (self.subTest(estado=estado),
                  patch.object(experimental.predictor, "detectar_rostros", return_value=cajas) as detectar,
                  patch.object(experimental.modelos_fase7, "obtener_modelo") as cargar):
                fuente = self.enviar(imagen={"imagen_b64": imagen_b64(), "modelo_facial": "real"}).json()["fuentes"]["imagen"]
                self.assertEqual(detectar.call_args.args[1], (30, 30))
                self.assertEqual(fuente["deteccion_facial"], estado)
                self.assertEqual(fuente["estado"], "evidencia_insuficiente")
                self.assertEqual(fuente["rostros_detectados"], len(cajas))
                self.assertEqual(fuente["rostros"][0], {"x": 5, "y": 10, "ancho": 49, "alto": 49})
                cargar.assert_not_called()

    def test_detector_real_con_foto_publica_por_http(self):
        ruta = Path(__file__).resolve().parents[1] / "_archivo/fase7/datos/astronaut.png"
        if not ruta.is_file():
            self.skipTest("Requiere la fotografía pública de los artefactos locales")
        foto = cv2.imdecode(np.frombuffer(ruta.read_bytes(), np.uint8), cv2.IMREAD_COLOR)
        pequena = cv2.resize(foto, (256, 256), interpolation=cv2.INTER_AREA)
        doble = np.hstack([foto, foto])
        with patch.object(experimental.modelos_fase7, "obtener_modelo", return_value=None):
            for imagen, extension, cantidad, deteccion in (
                (foto, ".png", 1, "rostro_detectado"),
                (pequena, ".webp", 1, "rostro_pequeno"),
                (doble, ".jpg", 2, "multiples_rostros"),
            ):
                with self.subTest(deteccion=deteccion):
                    _, archivo = cv2.imencode(extension, imagen)
                    contenido = base64.b64encode(archivo).decode("ascii")
                    respuesta = self.enviar(imagen={"imagen_b64": contenido, "modelo_facial": "real"})
                    self.assertEqual(respuesta.status_code, 200)
                    fuente = respuesta.json()["fuentes"]["imagen"]
                    self.assertEqual(fuente["deteccion_facial"], deteccion)
                    self.assertEqual(fuente["rostros_detectados"], cantidad)
                    self.assertEqual(fuente["estado"], "modelo_no_disponible" if deteccion == "rostro_detectado" else "evidencia_insuficiente")
                    alto, ancho = imagen.shape[:2]
                    for caja in fuente["rostros"]:
                        self.assertLessEqual(caja["x"] + caja["ancho"], ancho)
                        self.assertLessEqual(caja["y"] + caja["alto"], alto)

    def test_audio_declarado_independiente_y_errores_de_formato(self):
        salida = self.enviar(audio={"duracion_segundos": 4, "f0_hz": 150, "rms_normalizado": .2},
                             imagen={"imagen_b64": "!!!"}).json()["fuentes"]
        self.assertEqual(salida["imagen"]["estado"], "imagen_invalida")
        self.assertEqual(salida["audio"]["caracteristicas"]["f0_hz"], 150)
        self.assertEqual(salida["audio"]["clasificador"], "modelo_no_disponible")
        self.assertFalse(salida["audio"]["identidad_verificada"])
        self.assertEqual(self.enviar(audio={"duracion_segundos": 2, "pausas_segundos": 3}).status_code, 422)
        self.assertEqual(self.enviar(audio={"archivo": "no-aceptado"}).status_code, 422)

    def test_audio_insuficiente_o_de_baja_calidad(self):
        for audio in ({"duracion_segundos": 0}, {"duracion_segundos": 1, "rms_normalizado": 0},
                      {"duracion_segundos": 5, "f0_hz": 150, "calidad": .1}):
            with self.subTest(audio=audio):
                salida = self.enviar(audio=audio).json()["fuentes"]["audio"]
                self.assertEqual(salida["estado"], "evidencia_insuficiente")

    def test_abstencion_y_modelo_ausente(self):
        cara = Mock()
        cara.detectMultiScale.return_value = [(10, 10, 80, 80)]
        modelo = Mock()
        modelo.classes_ = list(range(7))
        modelo.predict_proba.return_value = [[.4, .35, .1, .05, .04, .03, .03]]
        with (patch.object(experimental.predictor, "_obtener_face_cascade", return_value=cara),
              patch.object(experimental.modelos_fase7, "obtener_modelo", return_value=None)):
            with patch.object(experimental.predictor, "obtener_modelo_facial", return_value=modelo):
                salida = self.enviar(imagen={"imagen_b64": imagen_b64()}).json()["fuentes"]["imagen"]
                self.assertEqual(salida["estado"], "abstencion")
                self.assertIsNone(salida["expresion"])
                self.assertAlmostEqual(sum(salida["puntajes_no_calibrados"].values()), 1)
            with patch.object(experimental.predictor, "obtener_modelo_facial", return_value=None):
                salida = self.enviar(video={"imagen_b64": imagen_b64()}).json()["fuentes"]["video"]
                self.assertEqual(salida["estado"], "modelo_no_disponible")

    def test_sincronizacion_sin_fusion_y_evento_visual_compartido(self):
        ref = dict(sesion_id="s1", fecha_hora="2026-11-09T10:00:00-05:00", naturaleza="sintetica")
        imagen = dict(ref, imagen_b64=imagen_b64(), evento_id="v1")
        audio = dict(ref, duracion_segundos=4, f0_hz=150)
        with patch.object(experimental, "analizar_expresion", return_value={"estado": "estimacion_experimental"}):
            salida = self.enviar(imagen=imagen, video=imagen, audio=audio).json()
            sincronizacion = salida["sincronizacion"]
            self.assertEqual(sincronizacion["estado"], "sincronizadas")
            self.assertTrue(sincronizacion["evento_visual_compartido"])
            self.assertEqual(sincronizacion["fuentes_elegibles"], ["imagen", "audio"])
            self.assertEqual(sincronizacion["fusion_estadistica"], "pendiente")
            for otro_audio in (dict(audio, sesion_id="s2"), dict(audio, fecha_hora="2026-11-09T10:00:02-05:00")):
                salida = self.enviar(imagen=imagen, audio=otro_audio).json()
                self.assertEqual(salida["sincronizacion"]["estado"], "referencias_incompatibles")

    def test_modelo_fase8_cuatro_expresiones_con_abstencion(self):
        cara = Mock()
        cara.detectMultiScale.return_value = [(10, 10, 80, 80)]
        modelo_svm = Mock()
        modelo_svm.classes_ = ["alegria", "enojo", "neutral", "tristeza"]
        modelo_svm.predict_proba.return_value = [[.312, .236, .313, .139]]
        artefacto = {
            "modelo": modelo_svm, "tipo": "facial", "version": "fase8-1.0",
            "algoritmo": "hog_svm", "dataset": "cmu-face-images", "sklearn": "1.5.0"
        }
        with (patch.object(experimental.predictor, "_obtener_face_cascade", return_value=cara),
              patch.object(experimental.modelos_fase7, "obtener_modelo", return_value=artefacto)):
            salida = self.enviar(imagen={"imagen_b64": imagen_b64(), "modelo_facial": "real"}).json()["fuentes"]["imagen"]
            self.assertEqual(salida["estado"], "abstencion")
            self.assertIsNone(salida["expresion"])
            self.assertEqual(list(salida["puntajes_calibrados"].keys()), ["alegria", "enojo", "neutral", "tristeza"])
            self.assertEqual(salida["criterio_abstencion"]["motivos"], ["probabilidad_insuficiente", "margen_insuficiente"])
            self.assertEqual(salida["modelo"]["algoritmo"], "hog_svm")

    def test_analisis_academico_independiente_con_notas(self):
        modelo_acad = Mock()
        modelo_acad.classes_ = ["aprueba", "no_aprueba"]
        modelo_acad.predict_proba.return_value = [[.15, .85]]
        artefacto = {
            "modelo": modelo_acad, "tipo": "academico", "version": "fase7-1.0",
            "algoritmo": "logistic_regression", "dataset": "UCI Student Performance", "sklearn": "1.5.0"
        }
        with patch.object(experimental.modelos_fase7, "obtener_modelo", return_value=artefacto):
            salida = self.enviar(academico={"G1": 8, "G2": 7, "corte": "despues_g2", "escala": "0-20"}).json()
            acad = salida["academico"]
            self.assertEqual(acad["estado"], "estimacion_experimental")
            self.assertEqual(acad["desenlace_estimado"], "no_aprueba")
            self.assertAlmostEqual(acad["probabilidad_no_aprueba"], .85)
            self.assertEqual(salida["fuentes"]["imagen"]["estado"], "sin_entrada")

    def test_analisis_facial_sin_notas_conserva_academico_sin_entrada(self):
        with patch.object(experimental, "analizar_expresion", return_value={"estado": "abstencion"}):
            salida = self.enviar(imagen={"imagen_b64": imagen_b64()}).json()
            self.assertEqual(salida["fuentes"]["imagen"]["estado"], "abstencion")
            self.assertEqual(salida["academico"]["estado"], "sin_entrada")

    def test_academico_datos_insuficientes_y_escala_0_20(self):
        parcial = self.enviar(academico={"G1": 14, "corte": "despues_g2", "escala": "0-20"}).json()["academico"]
        self.assertEqual(parcial["estado"], "evidencia_insuficiente")
        self.assertIn("G2", parcial["campos_faltantes"])
        self.assertEqual(self.enviar(academico={"G1": 21, "G2": 10}).status_code, 422)
        self.assertEqual(self.enviar(academico={"G1": -1, "G2": 10}).status_code, 422)

    def test_fallo_audio_y_sin_rostro_conservan_academico_valido(self):
        modelo_acad = Mock()
        modelo_acad.classes_ = ["aprueba", "no_aprueba"]
        modelo_acad.predict_proba.return_value = [[.82, .18]]
        artefacto = {
            "modelo": modelo_acad, "tipo": "academico", "version": "fase7-1.0",
            "algoritmo": "logistic_regression", "dataset": "UCI Student Performance", "sklearn": "1.5.0"
        }
        with patch.object(experimental.modelos_fase7, "obtener_modelo", return_value=artefacto):
            salida = self.enviar(
                imagen={"imagen_b64": imagen_b64()},
                audio={"wav_b64": "no-es-wav-valido"},
                academico={"G1": 15, "G2": 16, "corte": "despues_g2", "escala": "0-20"},
            ).json()
            self.assertEqual(salida["fuentes"]["imagen"]["estado"], "evidencia_insuficiente")
            self.assertEqual(salida["fuentes"]["audio"]["estado"], "audio_invalido")
            self.assertEqual(salida["academico"]["estado"], "estimacion_experimental")
            self.assertEqual(salida["academico"]["desenlace_estimado"], "aprueba")

    def test_entrega3_hipotesis_e_inferencia_audio_wav_y_academico_independientes(self):
        import io
        import wave

        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            t = np.linspace(0, 1.0, 16000, endpoint=False)
            muestras = (np.sin(2 * np.pi * 220 * t) * 12000).astype(np.int16)
            wf.writeframes(muestras.tobytes())
        wav_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

        silencio_buf = io.BytesIO()
        with wave.open(silencio_buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            wf.writeframes(np.zeros(16000, dtype=np.int16).tobytes())
        silencio_b64 = base64.b64encode(silencio_buf.getvalue()).decode("ascii")

        modelo_audio = Mock()
        modelo_audio.classes_ = ["calma", "enojo", "neutral", "tristeza"]
        modelo_audio.predict_proba.return_value = [[0.43, 0.29, 0.16, 0.12]]
        art_audio = {
            "modelo": modelo_audio, "tipo": "audio", "version": "fase8-1.0",
            "preprocesado": "wav-ampliado", "algoritmo": "logistic_regression", "dataset": "RAVDESS"
        }
        with patch.object(experimental.modelos_fase7, "obtener_modelo", side_effect=lambda tipo: art_audio if tipo == "audio" else None):
            resp_wav = self.enviar(audio={"wav_b64": wav_b64}).json()
            aud = resp_wav["fuentes"]["audio"]
            self.assertEqual(resp_wav["fuentes"]["imagen"]["estado"], "sin_entrada")
            self.assertEqual(aud["estado"], "abstencion")
            self.assertIsNone(aud["expresion_vocal"])
            self.assertEqual(aud["hipotesis"]["categoria"], "calma")
            self.assertAlmostEqual(aud["hipotesis"]["probabilidad"], 0.43, places=3)
            self.assertFalse(aud["hipotesis"]["concluyente"])
            self.assertAlmostEqual(aud["calidad_entrada"]["duracion_segundos"], 1.0, places=2)

            resp_sil = self.enviar(audio={"wav_b64": silencio_b64}).json()
            self.assertEqual(resp_sil["fuentes"]["audio"]["estado"], "evidencia_insuficiente")

        # Modelo facial con hipotesis tanto en abstencion como concluyente
        cara = Mock()
        cara.detectMultiScale.return_value = [(10, 10, 90, 90)]
        modelo_img = Mock()
        modelo_img.classes_ = ["alegria", "enojo", "neutral", "tristeza"]
        modelo_img.predict_proba.return_value = [[0.72, 0.08, 0.14, 0.06]]
        art_img = {
            "modelo": modelo_img, "tipo": "facial", "version": "fase8-1.0",
            "preprocesado": "hog-96", "algoritmo": "svm_lineal", "dataset": "CMU Face Images"
        }
        with (patch.object(experimental.predictor, "_obtener_face_cascade", return_value=cara),
              patch.object(experimental.modelos_fase7, "obtener_modelo", side_effect=lambda tipo: art_img if tipo == "facial" else None)):
            img = self.enviar(imagen={"imagen_b64": imagen_b64(), "modelo_facial": "real"}).json()["fuentes"]["imagen"]
            self.assertEqual(img["estado"], "estimacion_experimental")
            self.assertEqual(img["expresion"], "alegria")
            self.assertTrue(img["hipotesis"]["concluyente"])
            self.assertEqual(img["hipotesis"]["categoria"], "alegria")

        # Academico limítrofe retorna abstención + hipótesis sin exigir imagen ni audio
        modelo_acad = Mock()
        modelo_acad.classes_ = ["aprueba", "no_aprueba"]
        modelo_acad.predict_proba.return_value = [[0.51, 0.49]]
        art_acad = {"modelo": modelo_acad, "tipo": "academico", "version": "fase7-1.0", "algoritmo": "logistic_regression", "dataset": "UCI Student Performance"}
        with patch.object(experimental.modelos_fase7, "obtener_modelo", side_effect=lambda tipo: art_acad if tipo == "academico" else None):
            acad = self.enviar(academico={"G1": 10, "G2": 10, "corte": "despues_g2", "escala": "0-20"}).json()["academico"]
            self.assertEqual(acad["estado"], "abstencion")
            self.assertIsNone(acad["desenlace_estimado"])
            self.assertEqual(acad["hipotesis"]["categoria"], "aprueba")
            self.assertFalse(acad["hipotesis"]["concluyente"])


def datos_academicos():
    return {
        "schema_version": 1, "simulado": True, "descripcion": "Registros de prueba",
        "estudiantes": [{"estudiante_id": "e1", "sesiones": ["s1", "s2"]}],
        "sesiones": [{"sesion_id": s, "actividad": "clase", "inicio": "2026-11-09T10:00:00-05:00",
                     "segundo_actual": 60} for s in ("s1", "s2")],
    }


def registro(**campos):
    return dict(dict(sesion_id="s1", estudiante_id="e1", fecha="2026-11-09", origen="registro-demo",
                     naturaleza="sintetica", verificada=True), **campos)


class RegistrosTests(unittest.TestCase):
    def test_prioridad_academica_omite_reglas_visuales_y_mantiene_indice_anterior(self):
        ruta = Path(__file__).resolve().parents[1] / "ejemplos" / "seguimiento_juan_sintetico.json"
        datos = json.loads(ruta.read_text(encoding="utf-8"))
        completo = analizar_estudiantes(datos)["resultados"][0]
        datos["observaciones"] = []
        datos["asociaciones"] = []
        academico = analizar_estudiantes(datos)["resultados"][0]
        self.assertEqual(completo["indice_prioridad"], 90)
        self.assertEqual(completo["indicadores_academicos"]["prioridad_academica"], 40)
        self.assertEqual(completo["indicadores_academicos"], academico["indicadores_academicos"])

    def test_participacion_deduplicada_y_separada_por_sesion(self):
        p = registro(id="p1", tipo="participacion", cantidad=2)
        datos = datos_academicos()
        datos["registros_academicos"] = [p, dict(p, origen="otra-referencia"), dict(p, sesion_id="s2", cantidad=0)]
        primero, segundo = analizar_estudiantes(datos)["resultados"]
        self.assertEqual(primero["indicadores_academicos"]["participaciones"], 2)
        self.assertEqual(segundo["indicadores_academicos"]["participaciones"], 0)
        self.assertIsNone(primero["indicadores_academicos"]["prioridad_academica"])

    def test_asistencia_deduplicada_con_contexto_previo(self):
        registros = [registro(id=f"a{i}", tipo="asistencia", estado="ausente" if i < 2 else "presente")
                     for i in range(5)]
        datos = datos_academicos()
        datos["registros_academicos"] = registros + [registros[0]]
        datos["contextos"] = [{"estudiante_id": "e1", "sesion_id": "s1", "origen": "fixture",
                              "asistencia": [{"id": "a0", "fecha": "2026-11-09", "estado": "ausente"}]}]
        indicadores = analizar_estudiantes(datos)["resultados"][0]["indicadores_academicos"]
        self.assertEqual((indicadores["asistencia_registros"], indicadores["ausencias"]), (5, 2))
        self.assertEqual(indicadores["prioridad_academica"], 15)

    def test_contradicciones_e_identidad_desconocida_quedan_excluidas(self):
        p = registro(id="p1", tipo="participacion", cantidad=2)
        datos = datos_academicos()
        datos["registros_academicos"] = [p, dict(p, cantidad=3),
                                        dict(p, id="p2", estudiante_id=None, verificada=False)]
        salida = analizar_estudiantes(datos)
        self.assertEqual(len(salida["registros_academicos_excluidos"]), 2)
        resultado = salida["resultados"][0]
        self.assertIsNone(resultado["indicadores_academicos"]["participaciones"])
        self.assertTrue(resultado["contradicciones"])
