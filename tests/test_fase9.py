import unittest

import numpy as np
from fastapi.testclient import TestClient

from backend.app import app
from backend.entrenamiento_prediccion.evaluar_fusion_fase9 import entrada_por_modalidad
from backend.entrenamiento_prediccion.entrenar_fase9 import elegir, medir_politica
from backend.modulos.prediccion.modelos_fase7 import decidir


class PoliticaSelectivaTests(unittest.TestCase):
    def test_fusion_degradada_por_modalidad(self):
        audio = np.array([[1, 2]])
        visual = np.array([[3, 4]])
        self.assertEqual(entrada_por_modalidad()[0], "abstencion")
        self.assertIs(entrada_por_modalidad(audio)[1], audio)
        self.assertIs(entrada_por_modalidad(visual=visual)[1], visual)
        nombre, vector = entrada_por_modalidad(audio, visual)
        self.assertEqual(nombre, "audio_visual")
        np.testing.assert_array_equal(vector, [[1, 2, 3, 4]])

    def test_umbral_margen_y_motivos(self):
        etiqueta, detalle = decidir({"alegria": .5, "enojo": .25, "neutral": .25}, .5, .25)
        self.assertEqual(etiqueta, "alegria")
        self.assertEqual(detalle["motivos"], [])
        etiqueta, detalle = decidir({"alegria": .53, "enojo": .47}, .55, .10)
        self.assertIsNone(etiqueta)
        self.assertEqual(detalle["motivos"], ["probabilidad_insuficiente", "margen_insuficiente"])

    def test_cobertura_y_precision_selectiva_vacias(self):
        p = np.array([[.6, .4], [.55, .45]])
        resultado = medir_politica(p, np.array([True, False]), np.array([1, 2]), .7, .1)
        self.assertEqual(resultado["cobertura"], 0)
        self.assertIsNone(resultado["precision_selectiva"])
        self.assertIsNone(resultado["riesgo"])

    def test_promocion_exige_calidad_y_soporte_por_grupo(self):
        base = {"emitidas": 30, "precision_selectiva": .88, "cobertura": .08}
        candidato = {"emitidas": 100, "grupos_cubiertos": 8, "cobertura": .25,
                     "precision_selectiva": .87, "wilson_inferior": .78, "precision_min_sin_un_grupo": .83}
        resultados = {"base": {"f1_macro": .45, "politica_fase8": base, "curva": []},
                      "nuevo": {"f1_macro": .44, "curva": [candidato]}}
        self.assertEqual(elegir(resultados, "base", 30), ("nuevo", candidato))
        for cambio in ({"grupos_cubiertos": 3}, {"precision_selectiva": .82}, {"wilson_inferior": .64}):
            with self.subTest(cambio=cambio):
                resultados["nuevo"]["curva"] = [dict(candidato, **cambio)]
                self.assertIsNone(elegir(resultados, "base", 30))


class ContratoCompletoTests(unittest.TestCase):
    def test_fixture_sintetico_imagen_video_asistencia_y_participacion(self):
        with TestClient(app) as cliente:
            datos = cliente.get("/api/prediccion/estudiantes/ejemplos/multimodal").json()
            self.assertTrue(datos["simulado"])
            base = {"sesion_id": "demo-multimodal", "estudiante_id": "demo-integracion",
                    "fecha": "2026-11-09", "origen": "fixture-audio-fase9", "naturaleza": "sintetica",
                    "verificada": True, "confianza": .95}
            asistencia = dict(base, id="asistencia-fixture", tipo="asistencia", estado="presente")
            participacion = dict(base, id="participacion-fixture", tipo="participacion", cantidad=2)
            desconocida = dict(participacion, id="voz-sin-identidad", estudiante_id=None, verificada=False, cantidad=3)
            datos["registros_academicos"] = [asistencia, participacion, participacion, desconocida]
            respuesta = cliente.post("/api/prediccion/estudiantes", json=datos)
            self.assertEqual(respuesta.status_code, 200, respuesta.text)
            resultado, = respuesta.json()["resultados"]
            self.assertTrue(resultado["tiene_observaciones_verificadas"])
            self.assertIn("imagen", resultado["evidencia_por_modulo"])
            self.assertIn("video", resultado["evidencia_por_modulo"])
            self.assertEqual(resultado["indicadores_academicos"]["participaciones"], 2)
            self.assertNotIn("probabilidad_no_aprueba", resultado)

    def test_modalidades_ausentes_y_calificacion_incompleta(self):
        with TestClient(app) as cliente:
            salida = cliente.post("/api/prediccion/analisis-experimental", json={
                "schema_version": 1, "imagen": {"imagen_b64": "no-es-una-imagen"},
                "audio": {"wav_b64": "AAAA"}, "academico": {"G1": 12},
            }).json()
        self.assertEqual(salida["fuentes"]["imagen"]["estado"], "imagen_invalida")
        self.assertEqual(salida["fuentes"]["audio"]["estado"], "audio_invalido")
        self.assertEqual(salida["fuentes"]["video"]["estado"], "sin_entrada")
        self.assertEqual(salida["academico"]["campos_faltantes"], ["G2", "corte", "escala"])
