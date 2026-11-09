import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app import app

ORQUESTAR = "/api/prediccion/orquestar"
DEMO = "/api/prediccion/demostracion-integral"
CONFIG = {k: "" for k in ("AULAPREDICT_MODELOS_FASE7", "AULAPREDICT_MODELOS_FASE8", "AULAPREDICT_DEMO_IMAGEN",
                           "AULAPREDICT_DEMO_RAVDESS", "AULAPREDICT_DEMO_TRACKING", "AULAPREDICT_FUSION_FASE10")}


class IntegracionFase10Tests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_cuatro_casos_y_adaptadores_con_fixtures(self):
        with patch.dict(os.environ, CONFIG):
            r = self.client.post(DEMO, json={"solicitar_fusion": True})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.headers["cache-control"], "no-store")
        datos = r.json()
        self.assertTrue(datos["simulado"])
        self.assertEqual([c["caso"] for c in datos["casos"]], list("ABCD"))
        a, b, c, d = datos["casos"]
        self.assertEqual(a["seguimiento"]["indicadores_academicos"]["asistencia_registros"], 5)
        self.assertEqual(a["seguimiento"]["indicadores_academicos"]["participaciones"], 3)
        self.assertEqual(a["analisis"]["academico"]["estado"], "modelo_no_disponible")
        self.assertEqual(b["seguimiento"]["indicadores_academicos"]["participaciones"], 0)
        self.assertIn("G2", b["analisis"]["academico"]["campos_faltantes"])
        self.assertTrue(c["seguimiento"]["tiene_observaciones_verificadas"])
        self.assertIn("imagen", c["seguimiento"]["evidencia_por_modulo"])
        self.assertIn("video", c["seguimiento"]["evidencia_por_modulo"])
        self.assertFalse(c["analisis"]["fuentes"]["audio"]["identidad_verificada"])
        self.assertEqual(d["analisis"]["fuentes"]["audio"]["motivo"], "sesion_distinta")
        self.assertIsNone(d["seguimiento"]["indicadores_academicos"]["participaciones"])
        self.assertTrue(datos["registros_academicos_excluidos"])
        self.assertFalse(datos["fusion"]["ejecutada"])
        self.assertEqual(datos["fusion"]["motivo"], "pareja_ravdess_no_disponible")

    def test_modalidades_opcionales_y_errores_de_medios(self):
        muestras = {"imagen": {"imagen_b64": "invalida"}, "video": {"imagen_b64": "invalida"},
                    "audio": {"wav_b64": "AAAA"}}
        for nombres in ((), ("imagen",), ("video",), ("audio",), ("imagen", "video"), ("imagen", "audio"),
                        ("video", "audio"), ("imagen", "video", "audio")):
            with self.subTest(nombres=nombres):
                r = self.client.post(ORQUESTAR, json={"schema_version": 1, "solicitar_fusion": True,
                    "analisis": {"schema_version": 1, **{n: muestras[n] for n in nombres}}})
                self.assertEqual(r.status_code, 200, r.text)
                datos = r.json()
                self.assertEqual(datos["fusion"]["motivo"], "procedencia_externa_no_validada")
                for nombre, fuente in datos["analisis"]["fuentes"].items():
                    esperado = ("audio_invalido" if nombre == "audio" else "imagen_invalida") if nombre in nombres else "sin_entrada"
                    self.assertEqual(fuente["estado"], esperado)

    def test_sesion_faltante_o_distinta_excluye_antes_de_inferir(self):
        payload = {"schema_version": 1, "sesion_id": "uno", "analisis": {"schema_version": 1,
                   "imagen": {"imagen_b64": "no_procesar"},
                   "video": {"imagen_b64": "no_procesar", "sesion_id": "dos"}}}
        r = self.client.post(ORQUESTAR, json=payload)
        datos = r.json()["analisis"]
        self.assertEqual(datos["fuentes_excluidas"], ["imagen", "video"])
        self.assertEqual(datos["fuentes"]["imagen"]["motivo"], "sesion_faltante")
        self.assertEqual(datos["sincronizacion"]["estado"], "referencias_incompatibles")
        self.assertNotIn("no_procesar", r.text)

    def test_rechaza_rutas_procedencia_cruzada_y_exceso(self):
        self.assertEqual(self.client.post(DEMO, json={}, headers={"Host": "otro.invalid"}).status_code, 403)
        self.assertEqual(self.client.post(DEMO, json={}, headers={"Origin": "https://otro.invalid"}).status_code, 403)
        self.assertEqual(self.client.post(DEMO, json={}, headers={"X-Forwarded-For": "127.0.0.1"}).status_code, 403)
        r = self.client.post(DEMO, json={"ruta": "dato-secreto-no-reflejar"})
        self.assertEqual(r.status_code, 422)
        self.assertNotIn("dato-secreto-no-reflejar", r.text)
        self.assertEqual(self.client.post(ORQUESTAR, content=b"x" * (2 * 1024**2 + 1)).status_code, 413)

    def test_asociaciones_contradictorias_no_atribuyen_una_observacion(self):
        seguimiento = self.client.get("/api/prediccion/estudiantes/ejemplos/multimodal").json()
        seguimiento["estudiantes"].append({"estudiante_id": "segundo-ficticio", "sesiones": ["demo-multimodal"]})
        asociacion = seguimiento["asociaciones"][0]
        seguimiento["asociaciones"].append(dict(asociacion, estudiante_id="segundo-ficticio"))
        respuesta = self.client.post(ORQUESTAR, json={"schema_version": 1, "seguimiento": seguimiento})
        self.assertEqual(respuesta.status_code, 200, respuesta.text)
        datos = respuesta.json()["seguimiento"]
        self.assertEqual(len(datos["resultados"]), 2)
        self.assertTrue(any(o["modulo"] == "imagen" and not o["identidad_verificada"]
                            for o in datos["observaciones_sin_atribuir"]))
        self.assertTrue(all(not r["evidencia_por_modulo"].get("imagen") for r in datos["resultados"]))

    @unittest.skipUnless(os.environ.get("AULAPREDICT_E2E_FASE10") == "1", "Requiere artefactos locales autorizados")
    def test_inferencia_real_y_fusion_opt_in(self):
        r = self.client.post(DEMO, json={})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertFalse(r.json()["fusion"]["ejecutada"])
        r = self.client.post(DEMO, json={"solicitar_fusion": True})
        self.assertEqual(r.status_code, 200, r.text)
        datos = r.json()
        a, _, c, _ = datos["casos"]
        self.assertIn("probabilidad_no_aprueba", a["analisis"]["academico"])
        fuentes = c["analisis"]["fuentes"]
        self.assertEqual(fuentes["video"]["duplicado_de"], "imagen")
        for nombre in ("imagen", "audio"):
            self.assertEqual(fuentes[nombre]["estado"], "abstencion")
            self.assertFalse(fuentes[nombre]["identidad_verificada"])
            self.assertAlmostEqual(sum(fuentes[nombre]["puntajes_calibrados"].values()), 1.0)
        self.assertTrue(datos["fusion"]["compatible"], datos["fusion"])
        self.assertTrue(datos["fusion"]["ejecutada"], datos["fusion"])
        self.assertAlmostEqual(sum(datos["fusion"]["resultado"]["puntajes_calibrados"].values()), 1.0)
