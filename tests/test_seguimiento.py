import copy
from datetime import timedelta
import json
from pathlib import Path
import unittest

from pydantic import ValidationError
from backend.modulos.prediccion.seguimiento import analizar_estudiantes
from backend.modulos.prediccion.seguimiento_contrato import EntradaSeguimiento
from backend.modulos.prediccion.seguimiento_integracion import reunir_observaciones

EJEMPLOS = Path(__file__).resolve().parents[1] / "ejemplos"


def ejemplo(caso="juan"):
    return json.loads((EJEMPLOS / f"seguimiento_{caso}_sintetico.json").read_text(encoding="utf-8"))


def actual(salida):
    return next(r for r in salida["resultados"] if r["sesion_id"] == "demo-01")


class SeguimientoTests(unittest.TestCase):
    def test_demo_juan_concurrencia_explicable_y_sin_mutacion(self):
        datos = ejemplo()
        original = copy.deepcopy(datos)
        r = actual(analizar_estudiantes(datos))
        self.assertEqual(datos, original)
        self.assertEqual((r["nivel_revision"], r["indice_prioridad"]), ("alto", 90))
        self.assertEqual({x["regla"] for x in r["reglas_activadas"]}, {
            "tareas_pendientes", "reunion_incumplida", "presencia_recurrente_celular", "concurrencia_academica", "evaluacion_proxima"})
        self.assertTrue(all(x["referencias"] and x["explicacion"] for x in r["reglas_activadas"]))
        self.assertEqual(r["avisar_a"], ["docente", "tutor"])
        self.assertTrue(r["requiere_revision_humana"])
        self.assertTrue(r["limitaciones"])
        self.assertIn("contexto", r["evidencia_por_modulo"])

    def test_casos_sin_alerta_e_insuficientes(self):
        for caso in ("sin_alerta", "aislado", "contradictorio"):
            with self.subTest(caso=caso):
                r = actual(analizar_estudiantes(ejemplo(caso)))
                self.assertEqual(r["indice_prioridad"], 0)
                self.assertFalse(r["reglas_activadas"])
        for caso in ("identidad_desconocida", "insuficientes"):
            with self.subTest(caso=caso):
                r = actual(analizar_estudiantes(ejemplo(caso)))
                self.assertIsNone(r["indice_prioridad"])
                self.assertEqual(r["nivel_revision"], "datos_insuficientes")

    def test_identidad_desconocida_no_se_atribuye_por_nombre_o_tracking(self):
        datos = ejemplo("identidad_desconocida")
        salida = analizar_estudiantes(datos)
        self.assertEqual(len(salida["observaciones_sin_atribuir"]), 3)
        self.assertEqual(actual(salida)["evidencia_por_modulo"], {})
        datos["observaciones"][0]["persona_id"] = "demo-juan"
        with self.assertRaises(ValidationError):
            analizar_estudiantes(datos)

    def test_asociacion_debil_o_no_verificada_no_asigna(self):
        for cambios in ({"verificada": False}, {"confianza": .89}):
            datos = ejemplo()
            datos["contextos"] = []
            for a in datos["asociaciones"]: a.update(cambios)
            r = analizar_estudiantes(datos)
            self.assertEqual(len(r["observaciones_sin_atribuir"]), 3)
            self.assertIsNone(actual(r)["indice_prioridad"])

    def test_identidad_ambigua_excluye_y_no_transfiere_evidencia(self):
        datos = ejemplo()
        datos["contextos"] = []
        datos["estudiantes"].append({"estudiante_id": "otra", "nombre": "Otro personaje", "sesiones": ["demo-01"]})
        otras = copy.deepcopy(datos["asociaciones"])
        for a in otras: a["estudiante_id"] = "otra"
        datos["asociaciones"] += otras
        salida = analizar_estudiantes(datos)
        self.assertTrue(all(x["motivo"] == "identidad ambigua" for x in salida["observaciones_sin_atribuir"]))
        self.assertTrue(all(r["indice_prioridad"] is None for r in salida["resultados"]))

    def test_no_mezcla_estudiantes(self):
        datos = ejemplo()
        datos["estudiantes"].append({"estudiante_id": "otra", "sesiones": ["demo-01"]})
        r = analizar_estudiantes(datos)
        otra = next(x for x in r["resultados"] if x["estudiante_id"] == "otra")
        self.assertIsNone(otra["indice_prioridad"])
        self.assertEqual(otra["evidencia_por_modulo"], {})
        self.assertEqual(actual(r)["indice_prioridad"], 90)

    def test_duplicados_no_incrementan_indice(self):
        base = actual(analizar_estudiantes(ejemplo()))
        salida = analizar_estudiantes(ejemplo("duplicados"))
        self.assertEqual(base, actual(salida))
        self.assertEqual(salida["duplicados_omitidos"], 3)

    def test_mismo_id_con_versiones_opuestas_se_excluye(self):
        datos = ejemplo("aislado")
        opuesta = copy.deepcopy(datos["observaciones"][0])
        opuesta["presente"] = False
        datos["observaciones"].append(opuesta)
        salida = analizar_estudiantes(datos)
        self.assertIn("contradictorios", salida["observaciones_descartadas"][0]["motivo"])
        self.assertTrue(actual(salida)["contradicciones"])

    def test_correlacion_multimodal_no_crea_recurrencia(self):
        datos = ejemplo("aislado")
        for i in (1, 2):
            o = copy.deepcopy(datos["observaciones"][0])
            o.update(id=f"imagen:duplicada-{i}", modulo="imagen")
            datos["observaciones"].append(o)
            a = copy.deepcopy(datos["asociaciones"][0])
            a.update(observacion_id=o["id"], modulo="imagen")
            datos["asociaciones"].append(a)
        r = actual(analizar_estudiantes(datos))
        self.assertEqual(r["indice_prioridad"], 0)
        self.assertIn("imagen", r["evidencia_por_modulo"])

    def test_correlacion_explicita_a_distintos_tiempos_se_cuenta_una_vez(self):
        datos = ejemplo("aislado")
        plantilla = copy.deepcopy(datos["observaciones"][0])
        for i, segundo in enumerate((20, 30), 1):
            o = copy.deepcopy(plantilla)
            o.update(id=f"copia-{i}", segundo=segundo, fecha_hora=f"2026-10-15T10:00:{segundo}-05:00")
            datos["observaciones"].append(o)
            a = copy.deepcopy(datos["asociaciones"][0]); a["observacion_id"] = o["id"]
            datos["asociaciones"].append(a)
        self.assertEqual(actual(analizar_estudiantes(datos))["indice_prioridad"], 0)

    def test_recurrencia_exige_separacion_temporal(self):
        datos = ejemplo()
        datos["contextos"] = []
        for o, segundo in zip(datos["observaciones"], (10, 11, 12)):
            o.update(segundo=segundo, fecha_hora=f"2026-10-15T10:00:{segundo}-05:00")
        self.assertFalse(actual(analizar_estudiantes(datos))["reglas_activadas"])

    def test_confianza_calidad_y_datos_fuera_de_ventana(self):
        for campo, valor in (("confianza", .1), ("calidad", .1), ("calidad", None)):
            datos = ejemplo()
            datos["contextos"] = []
            for o in datos["observaciones"]: o[campo] = valor
            salida = analizar_estudiantes(datos)
            self.assertEqual(len(salida["observaciones_descartadas"]), 3)
            self.assertIsNone(actual(salida)["indice_prioridad"])
        datos = ejemplo(); datos["contextos"] = []
        datos["sesiones"][0]["segundo_actual"] = 300
        self.assertIsNone(actual(analizar_estudiantes(datos))["indice_prioridad"])
        datos["sesiones"][0]["segundo_actual"] = 0
        self.assertEqual(len(analizar_estudiantes(datos)["observaciones_descartadas"]), 3)

    def test_objeto_permitido_no_activa_recurrencia(self):
        datos = ejemplo()
        datos["contextos"] = []
        datos["sesiones"][0]["objetos_permitidos"] = ["cell phone"]
        self.assertEqual(actual(analizar_estudiantes(datos))["indice_prioridad"], 0)

    def test_contradicciones_excluyen_muestras_y_registros(self):
        r = actual(analizar_estudiantes(ejemplo("contradictorio")))
        self.assertEqual(len(r["contradicciones"]), 2)
        self.assertTrue(any("Resolver" in x for x in r["recomendaciones"]))

    def test_contexto_solo_declarado_y_registros_duplicados_no_suman(self):
        datos = ejemplo()
        datos.update(observaciones=[], asociaciones=[])
        base = actual(analizar_estudiantes(datos))
        self.assertEqual(base["indice_prioridad"], 40)
        datos["contextos"][0]["tareas"] *= 3
        datos["contextos"][0]["reuniones"] *= 3
        self.assertEqual(actual(analizar_estudiantes(datos)), base)

    def test_asistencia_exige_base_minima_y_no_infiere_desercion(self):
        datos = ejemplo("sin_alerta")
        for a in datos["contextos"][0]["asistencia"][:2]: a["estado"] = "ausente"
        r = actual(analizar_estudiantes(datos))
        self.assertEqual(r["indice_prioridad"], 15)
        datos["contextos"][0]["asistencia"] = datos["contextos"][0]["asistencia"][:2]
        self.assertEqual(actual(analizar_estudiantes(datos))["indice_prioridad"], 0)

    def test_emociones_no_aportan_puntos_ni_reemplazan_datos(self):
        datos = ejemplo("aislado")
        datos["contextos"] = []
        datos["observaciones"][0].update(tipo="emocion", valor="tristeza", porcentaje=70)
        r = actual(analizar_estudiantes(datos))
        self.assertIsNone(r["indice_prioridad"])
        self.assertFalse(r["reglas_activadas"])
        self.assertEqual(r["evidencia_por_modulo"]["video"][0]["porcentaje"], 70)

    def test_objeto_desconocido_no_simula_datos_suficientes(self):
        datos = ejemplo("aislado"); datos["contextos"] = []
        datos["observaciones"][0]["valor"] = "objeto_nuevo"
        self.assertIsNone(actual(analizar_estudiantes(datos))["indice_prioridad"])

    def test_audio_no_se_simula_como_integrado(self):
        datos = ejemplo("aislado")
        datos["observaciones"][0]["modulo"] = "audio"
        with self.assertRaisesRegex(ValueError, "AUDIO pendiente"):
            analizar_estudiantes(datos)
        datos = ejemplo("insuficientes")
        datos["fuentes"] = [{"modulo": "audio", "sesion_id": "demo-01", "origen": "pendiente", "datos": {}}]
        with self.assertRaisesRegex(ValueError, "AUDIO pendiente"):
            analizar_estudiantes(datos)

    def test_cambio_patron_exige_tres_sesiones_previas_explicitas(self):
        datos = ejemplo("cambio_patron")
        reglas = {r["regla"] for r in actual(analizar_estudiantes(datos))["reglas_activadas"]}
        self.assertIn("cambio_patron_observado", reglas)
        datos["sesiones"][1]["finalizada"] = False
        self.assertNotIn("cambio_patron_observado", {r["regla"] for r in actual(analizar_estudiantes(datos))["reglas_activadas"]})

    def test_reglas_configurables_y_validacion(self):
        datos = ejemplo()
        datos["reglas"] = {"puntos_recurrencia": 0, "puntos_concurrencia": 0, "puntos_evaluacion": 0}
        self.assertEqual(actual(analizar_estudiantes(datos))["indice_prioridad"], 30)
        for reglas in ({"umbral_moderado": 80, "umbral_alto": 60}, {"identidad_minima": .1}, {"puntos_tareas": -1}):
            datos["reglas"] = reglas
            with self.subTest(reglas=reglas), self.assertRaises(ValidationError):
                analizar_estudiantes(datos)

    def test_identificadores_y_referencias_invalidas_no_se_inventan(self):
        for cambiar in (
                lambda d: d["estudiantes"].append(copy.deepcopy(d["estudiantes"][0])),
                lambda d: d["asociaciones"][0].update(observacion_id="no-existe"),
                lambda d: d["asociaciones"][0].update(estudiante_id="no-existe"),
                lambda d: d["contextos"].append(copy.deepcopy(d["contextos"][0]))):
            datos = ejemplo(); cambiar(datos)
            with self.assertRaises(ValueError): analizar_estudiantes(datos)

    def test_fechas_zonas_y_rangos(self):
        for cambios in ({"segundo": True}, {"segundo": 86401}, {"confianza": 1.2}, {"calidad": float("nan")},
                        {"fecha_hora": "2026-10-15T10:00:10"}, {"fecha_hora": "2026-10-15T10:00:00-05:00"}):
            datos = ejemplo(); datos["observaciones"][0].update(cambios)
            with self.subTest(cambios=cambios), self.assertRaises(ValueError): analizar_estudiantes(datos)

    def test_nombre_no_interviene_en_puntos_y_atributos_sensibles_se_rechazan(self):
        datos = ejemplo(); base = actual(analizar_estudiantes(datos))["indice_prioridad"]
        datos["estudiantes"][0]["nombre"] = "Otro nombre ficticio"
        self.assertEqual(actual(analizar_estudiantes(datos))["indice_prioridad"], base)
        datos["estudiantes"][0]["salud"] = "dato prohibido"
        with self.assertRaises(ValidationError): analizar_estudiantes(datos)

    def test_fuentes_reutilizan_adaptadores_sin_identidad_implicita(self):
        datos = ejemplo("insuficientes")
        alerta = json.loads((EJEMPLOS / "video_alerta_v1_sintetica.json").read_text(encoding="utf-8"))
        datos["fuentes"] = [{"modulo": "video", "sesion_id": "demo-01", "origen": "fixture_VIDEO", "datos": alerta}]
        observaciones = reunir_observaciones(EntradaSeguimiento.model_validate(datos))
        salida = analizar_estudiantes(datos)
        self.assertEqual(len(salida["observaciones_sin_atribuir"]), len(observaciones))
        datos["asociaciones"] = [dict(observacion_id=o.id, modulo=o.modulo, sesion_id=o.sesion_id,
            estudiante_id="demo-juan", metodo="revision_manual", referencia="revision_sintetica", verificada=True, confianza=.99) for o in observaciones]
        r = actual(analizar_estudiantes(datos))
        self.assertEqual(r["indice_prioridad"], 0)
        self.assertEqual(len(r["evidencia_por_modulo"]["video"]), len(observaciones))

    def test_fuente_imagen_usa_origen_temporal_explicito(self):
        datos = ejemplo("insuficientes")
        imagen = json.loads((EJEMPLOS / "imagen_exportacion_sintetica.json").read_text(encoding="utf-8"))
        datos["fuentes"] = [{"modulo": "imagen", "sesion_id": "demo-01", "origen": "fixture_IMAGEN", "datos": imagen}]
        with self.assertRaisesRegex(ValueError, "origen_temporal"): analizar_estudiantes(datos)
        imagen["origen_temporal"] = "2026-10-15T10:00:00"
        self.assertTrue(analizar_estudiantes(datos)["observaciones_sin_atribuir"])
        imagen["origen_temporal"] = "2026-10-15T09:00:00"
        with self.assertRaisesRegex(ValueError, "no coincide"):
            analizar_estudiantes(datos)

    def test_historial_reutilizado_no_cuenta_como_tres_bases_independientes(self):
        datos = ejemplo("cambio_patron")
        for o in datos["historial"]:
            o["evidencia_id"] = "misma-evidencia-historica"
        reglas = {r["regla"] for r in actual(analizar_estudiantes(datos))["reglas_activadas"]}
        self.assertNotIn("cambio_patron_observado", reglas)


if __name__ == "__main__":
    unittest.main()
