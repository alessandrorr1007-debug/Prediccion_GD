import copy
import json
from pathlib import Path
import unittest

from backend.modulos.imagen.adapter import adaptar_imagen
from backend.modulos.prediccion.integracion import integrar_fuentes
from backend.modulos.prediccion.engine import predecir


class ImagenAdapterTests(unittest.TestCase):
    def setUp(self):
        ruta = Path(__file__).resolve().parents[1] / "ejemplos/imagen_exportacion_sintetica.json"
        self.datos = json.loads(ruta.read_text(encoding="utf-8"))

    def frame(self, **cambios):
        return dict(frame_id=0, timestamp=10, objetos=[
            {"id": 0, "clase": "telefono", "confianza_procesada": .8, "estado": "confirmada"}
        ], **cambios)

    def test_ejemplo_exportado_reemplazable_y_sin_mutacion(self):
        original = copy.deepcopy(self.datos)
        eventos = adaptar_imagen(self.datos)
        objetos = [o for f in self.datos["frames"] for o in f["objetos"]
                   if o.get("estado") in ("confirmada", "recuperada")]
        self.assertEqual(len(eventos), len(objetos))
        self.assertEqual([e["confianza"] for e in eventos], [o["confianza_procesada"] for o in objetos])
        self.assertTrue(all(e["calidad"] == 1 for e in eventos))
        self.assertEqual(self.datos, original)
        self.assertEqual(integrar_fuentes({"imagen": self.datos})["integracion"]["eventos_generados"], len(eventos))

    def test_frame_individual_equivale_al_acumulado(self):
        individual = dict(self.datos["frames"][0], archivo="captura.jpg", procesado_en="2026-10-15T10:01:00")
        self.assertEqual(adaptar_imagen(individual), adaptar_imagen({"frames": [individual]}))

    def test_estados_y_prioridad_confianza(self):
        frame = self.frame()
        frame["objetos"] = [dict(frame["objetos"][0], id=i, estado=estado,
            confianza_video=.99, confianza_capturada=.95) for i, estado in enumerate(
                ("confirmada", "recuperada", "no_confirmada", "no_detectada"))]
        eventos = adaptar_imagen({"frames": [frame]})
        self.assertEqual(len(eventos), 2)
        self.assertEqual([e["confianza"] for e in eventos], [.8, .8])

    def test_calidad_no_normaliza_metricas(self):
        frame = self.frame(calidad={"mejorado": {"nitidez": 0, "brillo": 0}})
        self.assertEqual(adaptar_imagen({"frames": [frame]})[0]["calidad"], 1)
        frame["calidad_normalizada"] = .25
        self.assertEqual(adaptar_imagen({"frames": [frame]})[0]["calidad"], .25)

    def test_formatos_invalidos_no_se_ignoran(self):
        for datos in ({}, {"objetos": []}, {"frames": {}}, {"frames": [None]}):
            with self.subTest(datos=datos), self.assertRaises(ValueError):
                adaptar_imagen(datos)
        self.assertEqual(adaptar_imagen({"frames": []}), [])

    def test_compatibilidad_fecha_aislada_y_id_anterior(self):
        frame = self.frame()
        frame["timestamp"] = "2026-10-15 10:00:00"
        evento = adaptar_imagen({"frames": [frame]})[0]
        self.assertEqual(evento["segundo"], 0)
        self.assertEqual(evento["id"], "imagen:0:0")

    def test_fechas_con_video_exigen_origen_y_se_alinean(self):
        frame = self.frame()
        frame["timestamp"] = "2026-10-15 10:00:10"
        imagen = {"frames": [frame]}
        video = {"frames": [{"frame_id": 1, "timestamp": 10, "detecciones": [
            {"clase": "telefono", "confianza": .9}]}]}
        with self.assertRaisesRegex(ValueError, "origen_temporal"):
            integrar_fuentes({"imagen": imagen, "video": video})
        imagen["origen_temporal"] = "2026-10-15T10:00:00"
        self.assertEqual(adaptar_imagen(imagen, exigir_origen_temporal=True)[0]["segundo"], 10)
        resultado = integrar_fuentes({"imagen": imagen, "video": video})
        self.assertEqual(resultado["evidencia"][0]["modalidades"], ["imagen", "video"])

    def test_limite_temporal_numerico_y_fechas(self):
        for tiempo in (-1, 86401, float("nan"), float("inf"), True, "", None):
            frame = self.frame()
            frame["timestamp"] = tiempo
            with self.subTest(tiempo=tiempo), self.assertRaisesRegex(ValueError, "timestamp"):
                adaptar_imagen({"frames": [frame]})
        for fecha in ("2026-10-16T10:00:01", "2026-10-15T09:59:59"):
            frame = self.frame()
            frame["timestamp"] = fecha
            with self.assertRaisesRegex(ValueError, "86400"):
                adaptar_imagen({"frames": [frame], "origen_temporal": "2026-10-15T10:00:00"})
        frame = self.frame()
        frame["timestamp"] = 86400
        self.assertEqual(adaptar_imagen({"frames": [frame]})[0]["segundo"], 86400)

    def test_fechas_con_zonas_inconsistentes_y_mezclas(self):
        frame = self.frame()
        frame["timestamp"] = "2026-10-15T10:00:00-05:00"
        with self.assertRaisesRegex(ValueError, "zonas horarias"):
            adaptar_imagen({"frames": [frame], "origen_temporal": "2026-10-15T10:00:00"})
        otra = self.frame()
        with self.assertRaisesRegex(ValueError, "mezclas"):
            adaptar_imagen({"frames": [frame, otra]})

    def test_ids_aislan_origen_tiempo_y_sesion_y_deduplican_reenvios(self):
        base = {"frames": [self.frame(origen="uno.jpg")], "sesion_id": "s1"}
        entradas = [base, dict(base, sesion_id="s2"), {"sesion_id": "s1", "frames": [self.frame(origen="dos.jpg")]}]
        otro_tiempo = copy.deepcopy(base)
        otro_tiempo["frames"][0]["timestamp"] = 11
        entradas.append(otro_tiempo)
        eventos = [adaptar_imagen(datos)[0] for datos in entradas]
        self.assertEqual(len({e["id"] for e in eventos}), 4)
        self.assertEqual(predecir({"eventos": eventos}), predecir({"eventos": eventos + eventos}))

    def test_confianza_invalida_no_recurre_a_otra(self):
        frame = self.frame()
        frame["objetos"][0].update(confianza_procesada=1.2, confianza_video=.9)
        with self.assertRaisesRegex(ValueError, "confianza_procesada"):
            adaptar_imagen({"frames": [frame]})


if __name__ == "__main__":
    unittest.main()
