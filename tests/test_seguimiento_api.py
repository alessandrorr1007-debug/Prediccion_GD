import asyncio
import copy
import json
from pathlib import Path
import unittest

import httpx
from fastapi.testclient import TestClient
from backend.app import app

EJEMPLOS = Path(__file__).resolve().parents[1] / "ejemplos"
RUTA = "/api/prediccion/estudiantes"


def ejemplo():
    return json.loads((EJEMPLOS / "seguimiento_juan_sintetico.json").read_text(encoding="utf-8"))


class SeguimientoApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_api_salida_validada_y_no_cache(self):
        r = self.client.post(RUTA, json=ejemplo())
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.headers["cache-control"], "no-store")
        self.assertEqual(r.json()["resultados"][0]["indice_prioridad"], 90)
        self.assertTrue(r.json()["simulado"])

    def test_todos_los_ejemplos_reproducibles(self):
        casos = {"juan", "sin_alerta", "identidad_desconocida", "insuficientes", "contradictorio", "duplicados", "aislado", "cambio_patron"}
        for caso in casos:
            with self.subTest(caso=caso):
                r = self.client.get(f"{RUTA}/ejemplos/{caso}")
                self.assertEqual(r.status_code, 200)
                self.assertTrue(r.json()["simulado"])
                self.assertEqual(self.client.post(RUTA, json=r.json()).status_code, 200)
        self.assertEqual(self.client.get(f"{RUTA}/ejemplos/no-existe").status_code, 404)

    def test_openapi_documenta_request_y_response(self):
        especificacion = self.client.get("/openapi.json").json()
        operacion = especificacion["paths"][RUTA]["post"]
        self.assertIn("EntradaSeguimiento", operacion["requestBody"]["content"]["application/json"]["schema"]["$ref"])
        self.assertIn("SalidaSeguimiento", operacion["responses"]["200"]["content"]["application/json"]["schema"]["$ref"])

    def test_no_acepta_reales_o_marcadores_ambiguos(self):
        for campo, valor in (("simulado", False), ("simulado", 1), ("schema_version", True), ("schema_version", 2)):
            datos = ejemplo(); datos[campo] = valor
            with self.subTest(campo=campo, valor=valor):
                self.assertEqual(self.client.post(RUTA, json=datos).status_code, 422)

    def test_errores_no_reflejan_valores_personales(self):
        datos = ejemplo()
        datos["estudiantes"][0]["nombre"] = "NO_REFLEJAR_VALOR_PRIVADO"
        datos["asociaciones"][0]["metodo"] = "SECRETO_METODO_INVALIDO"
        r = self.client.post(RUTA, json=datos)
        self.assertEqual(r.status_code, 422)
        self.assertNotIn("NO_REFLEJAR_VALOR_PRIVADO", r.text)
        self.assertNotIn("SECRETO_METODO_INVALIDO", r.text)
        self.assertEqual(r.headers["cache-control"], "no-store")

    def test_rechaza_json_invalido_y_payload_grande(self):
        r = self.client.post(RUTA, content=b"{invalido", headers={"content-type": "application/json"})
        self.assertEqual(r.status_code, 422)
        r = self.client.post(RUTA, content=b" " * (2 * 1024 * 1024 + 1))
        self.assertEqual(r.status_code, 413)

    def test_errores_de_fuentes_tampoco_reflejan_inputs(self):
        datos = ejemplo()
        secreto = "NO_REFLEJAR_FUENTE_" + "x" * 250
        datos["fuentes"] = [{"modulo": "video", "sesion_id": "demo-01", "origen": "fixture",
            "datos": {"frames": [{"timestamp": 2, "detecciones": [
                {"id": secreto, "clase": "telefono", "confianza": .9}]}]}}]
        r = self.client.post(RUTA, json=datos)
        self.assertEqual(r.status_code, 422)
        self.assertNotIn("NO_REFLEJAR_FUENTE", r.text)

    def test_audio_error_explicito_y_sin_rutas_inferencia(self):
        datos = ejemplo()
        datos["fuentes"] = [{"modulo": "audio", "sesion_id": "demo-01", "origen": "pendiente", "datos": {}}]
        r = self.client.post(RUTA, json=datos)
        self.assertEqual(r.status_code, 422)
        self.assertIn("AUDIO pendiente", r.json()["detail"])
        rutas = self.client.get("/openapi.json").json()["paths"]
        self.assertFalse(any(r.startswith("/api/medios") for r in rutas))

    def test_remoto_y_proxy_no_habilitan_datos_individuales(self):
        async def consultar_remoto():
            transporte = httpx.ASGITransport(app=app, client=("203.0.113.10", 1234))
            async with httpx.AsyncClient(transport=transporte, base_url="http://test") as cliente:
                return await cliente.post(RUTA, json=ejemplo())
        r = asyncio.run(consultar_remoto())
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.headers["cache-control"], "no-store")
        for cabecera in ("forwarded", "x-forwarded-for", "x-real-ip"):
            r = self.client.post(RUTA, json=ejemplo(), headers={cabecera: "127.0.0.1"})
            self.assertEqual(r.status_code, 403)

    def test_no_hay_historial_persistido_ni_ruta_publica_de_estudiante(self):
        datos = ejemplo()
        primera = self.client.post(RUTA, json=datos).json()
        vacio = copy.deepcopy(datos); vacio.update(observaciones=[], asociaciones=[], contextos=[])
        segunda = self.client.post(RUTA, json=vacio).json()
        self.assertEqual(primera["resultados"][0]["indice_prioridad"], 90)
        self.assertIsNone(segunda["resultados"][0]["indice_prioridad"])
        self.assertEqual(self.client.get(RUTA).status_code, 404)

    def test_motor_a_conserva_respuesta_tras_analizar_estudiantes(self):
        datos = json.loads((EJEMPLOS / "integracion_imagen_video.json").read_text(encoding="utf-8"))
        antes = self.client.post("/api/prediccion/integrar", json=datos)
        self.client.post(RUTA, json=ejemplo())
        despues = self.client.post("/api/prediccion/integrar", json=datos)
        self.assertEqual(antes.status_code, 200)
        self.assertEqual(antes.json(), despues.json())


if __name__ == "__main__":
    unittest.main()
