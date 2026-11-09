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
        with patch.object(experimental.predictor, "_obtener_face_cascade", return_value=cara):
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
