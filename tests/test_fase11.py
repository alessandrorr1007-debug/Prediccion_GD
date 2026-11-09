import json
from pathlib import Path
import unittest

from fastapi.testclient import TestClient

from backend.app import app
from backend.modulos.prediccion.validacion_contratos import diagnosticar

ORQUESTAR = "/api/prediccion/orquestar"
DEMO = "/api/prediccion/demostracion-integral"
EJEMPLOS = Path(__file__).resolve().parents[1] / "ejemplos"


def fixture(nombre):
    return json.loads((EJEMPLOS / nombre).read_text(encoding="utf-8"))


class ContratosFase11Tests(unittest.TestCase):
    def test_contratos_sinteticos_y_campo_adicional(self):
        imagen = diagnosticar("imagen", fixture("fase11_imagen_sintetica.json"), "demo-local")
        self.assertTrue(imagen["compatible"], imagen)
        self.assertIn("_nota", imagen["campos_adicionales"])
        video = diagnosticar("video", fixture("video_alerta_v1_sintetica.json"))
        self.assertTrue(video["compatible"], video)
        self.assertTrue(video["advertencias"])
        self.assertTrue(diagnosticar("audio", fixture("fase11_audio_sintetico.json"))["compatible"])
        self.assertTrue(diagnosticar("seguimiento", fixture("seguimiento_multimodal_sintetico.json"))["compatible"])

    def test_imagen_original_sin_origen_y_audio_corrupto(self):
        imagen = diagnosticar("imagen", fixture("imagen_exportacion_sintetica.json"))
        self.assertFalse(imagen["compatible"])
        self.assertIn("origen_temporal", imagen["errores"][0]["motivo"])
        self.assertFalse(diagnosticar("audio", {"wav_b64": "AAAA"})["compatible"])
        self.assertFalse(diagnosticar("audio", {"schema_version": True, "duracion_segundos": 1})["compatible"])

    def test_duplicados_y_confianza(self):
        datos = fixture("fase11_imagen_sintetica.json")
        datos["frames"] *= 2
        self.assertTrue(any("repetidos" in aviso for aviso in diagnosticar("imagen", datos)["advertencias"]))
        datos["frames"][0]["objetos"][0]["confianza"] = 1.1
        self.assertFalse(diagnosticar("imagen", datos)["compatible"])


class OrquestadorFase11Tests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_fuente_con_esquema_invalido_preserva_audio_y_seguimiento(self):
        datos = {"schema_version": 1, "analisis": {"schema_version": 1,
                 "video": {"imagen_b64": 7, "fecha_hora": "invalida"},
                 "audio": {"duracion_segundos": 2, "rms_normalizado": .2}},
                 "seguimiento": fixture("seguimiento_multimodal_sintetico.json")}
        respuesta = self.client.post(ORQUESTAR, json=datos)
        self.assertEqual(respuesta.status_code, 200)
        resultado = respuesta.json()
        self.assertEqual(resultado["estado"], "parcial")
        self.assertEqual(resultado["analisis"]["fuentes"]["video"]["estado"], "entrada_invalida")
        self.assertEqual(resultado["analisis"]["fuentes"]["audio"]["estado"], "caracteristicas_declaradas")
        self.assertEqual(len(resultado["seguimiento"]["resultados"]), 1)

    def test_adapter_fallido_excluye_su_asociacion_y_preserva_video(self):
        datos = fixture("seguimiento_multimodal_sintetico.json")
        datos["fuentes"][0]["datos"]["frames"][0]["objetos"][0]["estado"] = []
        respuesta = self.client.post(ORQUESTAR, json={"schema_version": 1, "seguimiento": datos})
        self.assertEqual(respuesta.status_code, 200)
        salida = respuesta.json()
        self.assertEqual(salida["estado"], "parcial")
        self.assertEqual(salida["fuentes_seguimiento_excluidas"], [{"indice": 0, "modulo": "imagen", "codigo": "fuente_invalida"}])
        evidencia = salida["seguimiento"]["resultados"][0]["evidencia_por_modulo"]
        self.assertIn("video", evidencia)
        self.assertNotIn("imagen", evidencia)

    def test_version_y_ventana_sin_destruir_fuentes_validas(self):
        audio = {"duracion_segundos": 2, "rms_normalizado": .2, "fecha_hora": "2026-11-09T10:00:02Z"}
        r = self.client.post(ORQUESTAR, json={"schema_version": 1,
            "ventana_captura": {"inicio": "2026-11-09T10:00:00Z", "fin": "2026-11-09T10:00:05Z"},
            "analisis": {"schema_version": 1, "audio": audio,
                         "imagen": {"imagen_b64": "no_leer", "fecha_hora": "2026-11-09T10:00:06Z"}},
            "seguimiento": {"schema_version": 2}})
        self.assertEqual(r.status_code, 200)
        salida = r.json()
        self.assertEqual(salida["analisis"]["fuentes"]["imagen"]["motivo"], "captura_fuera_de_ventana")
        self.assertEqual(salida["analisis"]["fuentes"]["audio"]["estado"], "caracteristicas_declaradas")
        self.assertIn("seguimiento", salida["errores"])
        self.assertNotIn("no_leer", r.text)
        self.assertEqual(self.client.post(ORQUESTAR, json={"schema_version": 2}).status_code, 422)

    def test_un_caso_y_rechazo_de_selector_arbitrario(self):
        r = self.client.post(DEMO, json={"caso": "D"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual([c["caso"] for c in r.json()["casos"]], ["D"])
        self.assertEqual(self.client.post(DEMO, json={"caso": "../otro"}).status_code, 422)
