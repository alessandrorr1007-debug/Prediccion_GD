import unittest

from backend.modulos.imagen.adapter import adaptar_imagen
from backend.modulos.prediccion.integracion import integrar_fuentes
from backend.modulos.video.adapter import adaptar_video


class IntegracionTests(unittest.TestCase):
    def test_video_adapta_clases_y_multiples_personas(self):
        eventos = adaptar_video({"frames": [{
            "frame_id": 1,
            "timestamp": 5,
            "detecciones": [
                {"clase": "person", "confianza": .9},
                {"clase": "persona", "confianza": .8},
                {"clase": "cell phone", "confianza": .7},
            ],
        }]})
        self.assertEqual(
            {evento["senal"] for evento in eventos},
            {"persona", "telefono", "multiples_personas"},
        )

    def test_imagen_descarta_objetos_no_confirmados(self):
        eventos = adaptar_imagen({"frames": [{
            "frame_id": 2,
            "timestamp": "2026-10-11T10:00:00",
            "objetos": [
                {"id": "a", "clase": "telefono", "confianza_procesada": .8, "estado": "confirmada"},
                {"id": "b", "clase": "reloj", "confianza_procesada": .9, "estado": "no_confirmada"},
            ],
        }]})
        self.assertEqual(len(eventos), 1)
        self.assertEqual(eventos[0]["senal"], "telefono")
        self.assertEqual(eventos[0]["segundo"], 0)

    def test_integracion_combina_imagen_y_video(self):
        resultado = integrar_fuentes({
            "video": {"frames": [{"timestamp": 10, "detecciones": [
                {"clase": "telefono", "confianza": .8},
            ]}]},
            "imagen": {"frames": [{"timestamp": 10, "objetos": [
                {"clase": "telefono", "confianza_procesada": .9, "estado": "confirmada"},
            ]}]},
        })
        self.assertEqual(resultado["modalidades_disponibles"], ["imagen", "video"])
        self.assertEqual(resultado["integracion"]["eventos_generados"], 2)
        self.assertEqual(resultado["evidencia"][0]["modalidades"], ["imagen", "video"])

    def test_audio_espera_contrato_real(self):
        with self.assertRaisesRegex(ValueError, "pendiente"):
            integrar_fuentes({"audio": {"eventos": []}})


if __name__ == "__main__":
    unittest.main()
