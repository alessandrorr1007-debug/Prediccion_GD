import copy
import json
from pathlib import Path
import unittest

from fastapi.testclient import TestClient

from backend.app import app


RUTA = "/api/prediccion/estudiantes"
EJEMPLOS = Path(__file__).resolve().parents[1] / "ejemplos"


class IntegracionSeguimientoTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        respuesta = self.client.get(f"{RUTA}/ejemplos/multimodal")
        self.assertEqual(respuesta.status_code, 200)
        self.datos = respuesta.json()

    def evaluar(self):
        respuesta = self.client.post(RUTA, json=self.datos)
        self.assertEqual(respuesta.status_code, 200, respuesta.text)
        return respuesta.json()

    def test_imagen_y_video_con_historial_conservan_procedencia_e_identidad(self):
        salida = self.evaluar()
        resultado, = salida["resultados"]
        self.assertEqual(resultado["indice_prioridad"], 30)
        self.assertTrue(resultado["tiene_observaciones_verificadas"])
        evidencia = resultado["evidencia_por_modulo"]
        for modulo in ("imagen", "video"):
            with self.subTest(modulo=modulo):
                evento, = evidencia[modulo]
                self.assertEqual(evento["valor"], "telefono")
                self.assertEqual(evento["naturaleza"], "sintetica")
                self.assertEqual(evento["sesion_id"], "demo-multimodal")
                self.assertEqual(evento["estudiante_id"], "demo-integracion")
                self.assertTrue(evento["identidad_verificada"])
                self.assertEqual(evento["asociacion"]["referencia"], "revision-demo-1")
                self.assertEqual(evento["calidad_origen"], "declarada")
                self.assertTrue(evento["modelo"])
                self.assertTrue(evento["fecha_hora"].startswith("2026-11-09T10:00:10"))
        cruce = resultado["coincidencia_contextual"]
        self.assertEqual({o["modulo"] for o in cruce["observaciones"]}, {"imagen", "video"})
        self.assertEqual({r["tipo"] for r in cruce["registros_academicos"]}, {"tarea", "evaluacion_proxima"})
        self.assertEqual({f["modulo"] for f in salida["fuentes_recibidas"]}, {"imagen", "video", "captura"})

    def test_conteo_de_captura_se_conserva_sin_atribuir_a_un_estudiante(self):
        self.datos["asociaciones"].append(dict(self.datos["asociaciones"][0],
            observacion_id="cap-demo-1", modulo="captura"))
        salida = self.evaluar()
        captura, = salida["observaciones_sin_atribuir"]
        self.assertEqual((captura["tipo"], captura["valor"]), ("conteo_personas", "2"))
        self.assertEqual(captura["estado"], "identidad_no_aplicable")
        self.assertFalse(captura["identidad_verificada"])
        self.assertIsNone(captura["confianza"])
        self.assertNotIn("captura", salida["resultados"][0]["evidencia_por_modulo"])

    def test_fuente_vacia_se_registra_y_audio_permanece_pendiente(self):
        self.datos["fuentes"][0].update(datos={"frames": []}, evidencias={})
        self.datos["asociaciones"].pop(0)
        salida = self.evaluar()
        imagen = next(f for f in salida["fuentes_recibidas"] if f["modulo"] == "imagen")
        self.assertEqual(imagen["observaciones_recibidas"], 0)
        self.assertEqual(salida["estado_modulos"]["audio"], "pendiente")
        self.datos["fuentes"].append(dict(modulo="audio", sesion_id="demo-multimodal", origen="pendiente", datos={}))
        error = self.client.post(RUTA, json=self.datos)
        self.assertEqual(error.status_code, 422)
        self.assertEqual(error.json()["error_integracion"], dict(indice=3, modulo="audio", codigo="contrato_pendiente"))
        self.assertIn("AUDIO pendiente", error.json()["detail"])

    def test_fallo_identifica_fuente_y_preserva_estado_local_sintetico(self):
        fuente = self.datos["fuentes"][0]
        for cambios, codigo in (({"sesion_id": "no-inscrita"}, "sesion_desconocida"),
                                ({"datos": {}}, "fuente_invalida"),
                                ({"naturaleza": "real"}, "datos_reales")):
            with self.subTest(codigo=codigo):
                datos = dict(self.datos, fuentes=[dict(fuente, **cambios)])
                error = self.client.post(RUTA, json=datos)
                self.assertEqual(error.status_code, 422)
                self.assertEqual(error.json()["error_integracion"]["codigo"], codigo)

    def test_alias_equivalentes_se_deduplican_y_versiones_opuestas_se_excluyen(self):
        self.datos = json.loads((EJEMPLOS / "seguimiento_juan_sintetico.json").read_text(encoding="utf-8"))
        primero = self.datos["observaciones"][0]
        self.datos["observaciones"].append(dict(primero, valor="celular"))
        salida = self.evaluar()
        self.assertEqual(salida["duplicados_omitidos"], 1)
        self.assertEqual(salida["resultados"][0]["indice_prioridad"], 90)
        self.datos["observaciones"].append(dict(primero, presente=False))
        salida = self.evaluar()
        self.assertEqual(salida["observaciones_descartadas"][0]["estado"], "observacion_contradictoria")
        self.assertLess(salida["resultados"][0]["indice_prioridad"], 90)

    def test_confianza_ausente_preserva_atribucion_sin_usarla_como_evidencia(self):
        datos = json.loads((EJEMPLOS / "seguimiento_coincidencia_sintetico.json").read_text(encoding="utf-8"))
        del datos["observaciones"][0]["confianza"]
        self.datos = datos
        salida = self.evaluar()
        evento, = salida["observaciones_descartadas"]
        self.assertEqual(evento["estado"], "confianza_insuficiente")
        self.assertTrue(evento["identidad_verificada"])
        self.assertIsNone(evento["confianza"])
        self.assertIsNone(salida["resultados"][0]["coincidencia_contextual"])

    def test_identidad_ambigua_no_publica_atribucion_y_desconocida_conserva_fuente(self):
        otro = copy.deepcopy(self.datos["estudiantes"][0])
        otro["estudiante_id"] = "demo-otro"
        self.datos["estudiantes"].append(otro)
        self.datos["asociaciones"] = [
            self.datos["asociaciones"][0],
            dict(self.datos["asociaciones"][0], estudiante_id="demo-otro"),
        ]
        salida = self.evaluar()
        por_modulo = {o["modulo"]: o for o in salida["observaciones_sin_atribuir"]}
        self.assertEqual(por_modulo["imagen"]["estado"], "identidad_ambigua")
        self.assertNotIn("estudiante_id", por_modulo["imagen"])
        self.assertEqual(por_modulo["video"]["estado"], "identidad_desconocida")
        self.assertEqual(por_modulo["video"]["origen"], "fixture-video")
        self.assertTrue(all(r["coincidencia_contextual"] is None for r in salida["resultados"]))

    def test_mismo_id_de_fuente_en_otra_sesion_no_transfiere_identidad(self):
        segunda_sesion = "demo-otra-sesion"
        self.datos["estudiantes"][0]["sesiones"].append(segunda_sesion)
        self.datos["sesiones"].append(dict(self.datos["sesiones"][0], sesion_id=segunda_sesion))
        fuente = copy.deepcopy(self.datos["fuentes"][1])
        fuente["sesion_id"] = segunda_sesion
        fuente["datos"]["modelo"] = ""
        self.datos["fuentes"].append(fuente)
        salida = self.evaluar()
        observado, = [o for o in salida["observaciones_sin_atribuir"] if o["modulo"] == "video"]
        self.assertEqual((observado["id"], observado["sesion_id"]), ("video:t1", segunda_sesion))
        self.assertIsNone(observado["modelo"])
        self.assertEqual(salida["duplicados_omitidos"], 0)
