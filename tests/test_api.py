import json
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app import app


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_frontend_y_archivos(self):
        for path in ("/", "/app.js", "/style.css", "/api/salud"):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 200)

    def test_manifiestos_y_adaptadores(self):
        modulos = self.client.get("/api/modulos").json()["modulos"]
        self.assertEqual({modulo["nombre"] for modulo in modulos}, {"imagen", "audio", "video", "prediccion"})
        for nombre in ("imagen", "video", "prediccion"):
            modulo = next(item for item in modulos if item["nombre"] == nombre)
            self.assertEqual(modulo["archivos_presentes"], modulo["artefactos"])

    def test_ejemplo_multimodal(self):
        ruta = Path(__file__).resolve().parent.parent / "ejemplos" / "prediccion.json"
        response = self.client.post("/api/prediccion", json=json.loads(ruta.read_text(encoding="utf-8")))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["modalidades_disponibles"]), 3)

    def test_integracion_imagen_video(self):
        ruta = Path(__file__).resolve().parent.parent / "ejemplos" / "integracion_imagen_video.json"
        response = self.client.post(
            "/api/prediccion/integrar",
            json=json.loads(ruta.read_text(encoding="utf-8")),
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["integracion"]["fuentes_recibidas"], ["video", "imagen"])

    def test_json_invalido(self):
        self.assertEqual(self.client.post("/api/prediccion", content="invalido").status_code, 422)


if __name__ == "__main__":
    unittest.main()
