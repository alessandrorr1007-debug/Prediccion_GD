import copy
import json
from pathlib import Path
import unittest

from backend.modulos.video.adapter import ALIAS, adaptar_video
from backend.modulos.prediccion import engine
from backend.modulos.prediccion.integracion import integrar_fuentes


class VideoAlertaTests(unittest.TestCase):
    def setUp(self):
        ruta = Path(__file__).resolve().parents[1] / "ejemplos/video_alerta_v1_sintetica.json"
        self.alerta = json.loads(ruta.read_text(encoding="utf-8"))

    def test_ejemplo_reemplazable_por_salida_real(self):
        original = copy.deepcopy(self.alerta)
        eventos = adaptar_video(self.alerta)
        self.assertEqual(self.alerta, original)
        personas = sum(ALIAS.get(d["clase"], d["clase"]) == "persona" for d in self.alerta["detecciones"])
        self.assertEqual(len(eventos), len(self.alerta["detecciones"]) + int(personas > 1))
        for indice, (evento, deteccion) in enumerate(zip(eventos, self.alerta["detecciones"])):
            self.assertEqual(evento["id"], f"video:alerta:{self.alerta['evento_id']}:deteccion:{indice}")
            self.assertEqual(evento["senal"], ALIAS.get(deteccion["clase"], deteccion["clase"]))
            self.assertEqual(evento["confianza"], deteccion["confianza"])
            self.assertEqual(evento["segundo"], self.alerta["timestamp"])
            self.assertEqual(evento["calidad"], 1)
        self.assertEqual(integrar_fuentes({"video": self.alerta})["integracion"]["eventos_generados"], len(eventos))

    def test_ids_no_confunden_seguimiento_ni_alertas(self):
        self.alerta["detecciones"] = [
            {"clase": "persona", "confianza": .9, "persona_id": 1, "id": "repetido"},
            {"clase": "telefono", "confianza": .9, "telefono_id": 1, "id": "repetido"},
            {"clase": "persona", "confianza": .8, "persona_id": 2},
        ]
        primera = adaptar_video(self.alerta)
        otra = dict(self.alerta, evento_id="b" * 32)
        segunda = adaptar_video(otra)
        self.assertEqual(len({e["id"] for e in primera + segunda}), 8)
        base = engine.predecir({"eventos": primera + segunda})
        self.assertEqual(base, engine.predecir({"eventos": primera + segunda + primera}))
        self.assertEqual(len(next(e for e in base["evidencia"] if e["senal"] == "telefono")["eventos"]), 2)

    def test_version_y_formato_invalidos(self):
        for datos in ({}, {"detecciones": []}, dict(self.alerta, evento_id="incorrecto")):
            with self.subTest(datos=datos), self.assertRaisesRegex(ValueError, "frames o una alerta"):
                adaptar_video(datos)
        for version in (0, 2, "1", True, None):
            with self.subTest(version=version), self.assertRaisesRegex(ValueError, "schema_version.*versión 1"):
                adaptar_video(dict(self.alerta, schema_version=version))

    def test_tiempos_y_confianza_invalidos(self):
        for tiempo in (-1, 86401, float("nan"), float("inf"), None, True):
            with self.subTest(tiempo=tiempo), self.assertRaisesRegex(ValueError, "timestamp"):
                adaptar_video(dict(self.alerta, timestamp=tiempo))
        self.assertTrue(all(e["segundo"] == 86400 for e in adaptar_video(dict(self.alerta, timestamp=86400))))
        for confianza in (-.1, 1.1, None, True):
            with self.subTest(confianza=confianza), self.assertRaisesRegex(ValueError, "confianza"):
                adaptar_video(dict(self.alerta, detecciones=[{"clase": "telefono", "confianza": confianza}]))

    def test_modelos_y_confirmacion_no_cambian_evidencia(self):
        self.alerta["modelos"] = {"b.pt": "f" * 64, "a.pt": "a" * 64}
        eventos = adaptar_video(self.alerta)
        self.assertTrue(all(e["modelo"] == "a.pt, b.pt" for e in eventos))
        self.alerta["evento"].update(confirmado=True, confirmacion_video_seg=80000, evidencia_seg=100)
        self.assertEqual(eventos, adaptar_video(self.alerta))
        with self.assertRaisesRegex(ValueError, "modelos"):
            adaptar_video(dict(self.alerta, modelos=[]))

    def test_frames_anterior_y_alias_compartidos(self):
        self.assertIs(engine.ALIAS, ALIAS)
        self.assertEqual(adaptar_video({"frames": []}), [])
        eventos = adaptar_video({"modelo": "anterior", "frames": [{"frame_id": 7, "segundo": 5,
            "calidad": .8, "detecciones": [{"id": "original", "clase": "cell phone", "confianza": .9}]}]})
        self.assertEqual(eventos, [{"id": "video:original", "modalidad": "video", "senal": "telefono",
            "segundo": 5, "confianza": .9, "calidad": .8, "modelo": "anterior"}])


if __name__ == "__main__":
    unittest.main()
