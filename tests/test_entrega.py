import json
from pathlib import Path
import unittest

from fastapi.testclient import TestClient
from backend.app import app


RAIZ = Path(__file__).resolve().parents[1]


class EntregaTests(unittest.TestCase):
    def test_rutas_inferencia_ya_no_existen(self):
        with TestClient(app) as client:
            rutas = client.get("/openapi.json").json()["paths"]
            self.assertFalse(any(ruta.startswith("/api/medios") for ruta in rutas))
            for tipo in ("imagen", "audio", "video", "rostro"):
                self.assertEqual(client.post(f"/api/medios/{tipo}", content=b"medio").status_code, 405)

    def test_audio_solo_marcadores_y_rechazo_explicito(self):
        carpeta = RAIZ / "backend/modulos/audio"
        self.assertEqual({p.name for p in carpeta.iterdir()}, {"modulo.json", ".gitkeep"})
        modulo = json.loads((carpeta / "modulo.json").read_text(encoding="utf-8"))
        self.assertEqual(modulo["estado"], "pendiente_repositorio_y_contrato")
        self.assertEqual(modulo["artefactos"], [])
        with TestClient(app) as client:
            respuesta = client.post("/api/prediccion/integrar", json={"audio": {}})
            self.assertEqual(respuesta.status_code, 422)
            self.assertIn("pendiente", respuesta.json()["detail"])

    def test_imagen_individual_en_api_y_error_temporal(self):
        imagen = json.loads((RAIZ / "ejemplos/imagen_exportacion_sintetica.json").read_text(encoding="utf-8"))
        with TestClient(app) as client:
            respuesta = client.post("/api/prediccion/integrar", json={"imagen": imagen["frames"][0]})
            self.assertEqual(respuesta.status_code, 200)
            respuesta = client.post("/api/prediccion/integrar", json={"imagen": imagen, "video": {"frames": []}})
            self.assertEqual(respuesta.status_code, 422)
            self.assertIn("origen_temporal", respuesta.json()["detail"])


if __name__ == "__main__":
    unittest.main()
