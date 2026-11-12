import base64
from datetime import datetime, timedelta, timezone
import io
import os
from pathlib import Path
import struct
import unittest
from unittest.mock import Mock, patch
import wave

import cv2
import numpy as np
from fastapi.testclient import TestClient

from backend.app import app
from backend.modulos.prediccion import detector_objetos, recepcion_multimodal
from backend.modulos.prediccion.captura_entrada import MAX_JSON_CAPTURA
from backend.modulos.prediccion.interpretacion_visual import construir_interpretacion_visual


def _imagen_vacia_b64() -> str:
    _, buf = cv2.imencode(".png", np.zeros((160, 160, 3), dtype=np.uint8))
    return base64.b64encode(buf).decode("ascii")


def _wav_valido_b64(duracion_seg: float = 1.5, freq_hz: float = 220.0) -> str:
    sr = 16000
    n = int(sr * duracion_seg)
    t = np.linspace(0.0, duracion_seg, n, endpoint=False)
    onda = (0.3 * np.sin(2.0 * np.pi * freq_hz * t) * 32767.0).astype("<i2")
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(onda.tobytes())
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def _astronaut_b64() -> str | None:
    ruta = Path(__file__).resolve().parents[1] / "_archivo/fase7/datos/astronaut.png"
    if not ruta.is_file():
        return None
    return base64.b64encode(ruta.read_bytes()).decode("ascii")


PROHIBIDOS_NO_CLINICOS = (
    "depresion clinica",
    "diagnostico psicologico",
    "problema familiar",
    "violencia intrafamiliar",
    "pobreza",
)


class Fase13UnificadaTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        recepcion_multimodal.ESTADO_CANAL.reiniciar()

    def test_cajas_externas_invalidas_conservan_la_deteccion(self):
        coordenadas = dict(x1=1, y1=2, x2=10, y2=20)
        deteccion = {"clase": "persona", "confianza": 0.9}
        entradas = [
            dict(deteccion, **coordenadas),
            dict(deteccion, caja=dict(coordenadas, x2=[])),
            dict(deteccion, caja=dict(coordenadas, x2=float("nan"))),
            dict(deteccion, caja=dict(coordenadas, x2=0)),
        ]
        salida = detector_objetos.normalizar_detecciones_externas(entradas)
        self.assertEqual(len(salida), len(entradas))
        self.assertEqual(salida[0]["caja"], coordenadas)
        self.assertTrue(all("caja" not in objeto for objeto in salida[1:]))

    def test_reintento_de_evento_no_reemplaza_el_resultado_publicado(self):
        carga = {"schema_version": 1, "sesion_id": "s1", "eventos": [{
            "evento_id": "foto-1",
            "modulo": "imagen",
            "sesion_id": "s1",
            "tipo_observacion": "objeto",
            "datos_observados": {"objetos": [{"clase": "libro", "confianza": 0.9}]},
        }]}
        ruta = "/api/prediccion/recepcion"
        excluida = self.client.post(ruta, json=dict(carga, sesion_id="s2")).json()
        self.assertEqual(excluida["analisis"]["fuentes"]["imagen"]["estado"], "sin_entrada")
        primera = self.client.post(ruta, json=carga).json()
        self.assertEqual(primera["analisis"]["fuentes"]["imagen"]["deteccion_objetos"]["estado"], "solo_externas")
        reintento = self.client.post(ruta, json=carga).json()
        self.assertEqual(reintento["analisis"]["fuentes"]["imagen"]["estado"], "sin_entrada")
        self.assertEqual(reintento["actualizacion_id"], primera["actualizacion_id"])
        ultima = self.client.get(f"{ruta}/ultima").json()
        self.assertEqual(ultima["resultado"], primera)

    def test_interpretacion_visual_rica_una_sola_foto_sin_academico_ni_diagnosticos(self):
        astro = _astronaut_b64()
        if not astro:
            self.skipTest("Requiere astronaut.png de referencia")
        resp = self.client.post(
            "/api/prediccion/analisis-experimental",
            json={"schema_version": 1, "imagen": {"imagen_b64": astro, "modelo_facial": "real"}},
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        datos = resp.json()
        self.assertEqual(datos["academico"]["estado"], "sin_entrada")
        img = datos["fuentes"]["imagen"]
        self.assertEqual(img["rostros_detectados"], 1)
        self.assertFalse(img["identidad_verificada"])
        self.assertIn("deteccion_objetos", img)
        clases = {o["clase"] for o in img["deteccion_objetos"]["objetos"]}
        self.assertTrue({"persona", "reloj"} & clases, clases)

        iv = datos["interpretacion_visual"]
        self.assertTrue(iv["observaciones"])
        self.assertTrue(iv["clasificaciones"])
        self.assertTrue(iv["hipotesis"])
        self.assertTrue(iv["limitaciones"])
        self.assertTrue(iv["evidencia_requerida"])
        for h in iv["hipotesis"]:
            self.assertFalse(h["es_prediccion_individual"])
            if h["tipo"] == "posibilidad_general_no_evaluada":
                self.assertIsNone(h["probabilidad_asignada"])
            texto = h["descripcion"].lower()
            for termino in PROHIBIDOS_NO_CLINICOS:
                self.assertNotIn(termino, texto)

    def test_interpretacion_visual_cero_y_multiples_rostros_y_fallback_detector_objetos(self):
        with patch.dict(os.environ, {"AULAPREDICT_DETECTOR_OBJETOS": "off"}):
            detector_objetos._CACHE_YOLO = None
            resp = self.client.post(
                "/api/prediccion/analisis-experimental",
                json={"schema_version": 1, "imagen": {"imagen_b64": _imagen_vacia_b64(), "modelo_facial": "real"}},
            )
        self.assertEqual(resp.status_code, 200)
        img = resp.json()["fuentes"]["imagen"]
        self.assertEqual(img["deteccion_facial"], "sin_rostro")
        self.assertEqual(img["deteccion_objetos"]["estado"], "no_solicitado")
        iv = resp.json()["interpretacion_visual"]
        self.assertIn("no se detectó un rostro", iv["resumen"]["observacion_visual"].lower())

        with patch.object(detector_objetos.YOLO_BEST, "cargar", return_value=None):
            resp_nd = self.client.post(
                "/api/prediccion/analisis-experimental",
                json={"schema_version": 1, "imagen": {"imagen_b64": _imagen_vacia_b64(), "modelo_facial": "real"}},
            )
        self.assertEqual(resp_nd.status_code, 200)
        self.assertEqual(resp_nd.json()["fuentes"]["imagen"]["deteccion_objetos"]["estado"], "modelo_no_disponible")

        iv_multi = construir_interpretacion_visual(
            {
                "estado": "evidencia_insuficiente",
                "deteccion_facial": "multiples_rostros",
                "rostros_detectados": 3,
                "identidad_verificada": False,
                "deteccion_objetos": {
                    "estado": "detectado",
                    "objetos": [
                        {"clase": "persona", "etiqueta": "Persona", "confianza": 0.91, "origen": "yolo"},
                        {"clase": "telefono", "etiqueta": "Teléfono móvil", "confianza": 0.84, "origen": "yolo"},
                    ],
                    "objetos_no_persona": [{"clase": "telefono", "etiqueta": "Teléfono móvil", "confianza": 0.84, "origen": "yolo"}],
                    "senales_encuadre": [],
                },
            }
        )
        textos_obs = " ".join(o["hecho"] for o in iv_multi["observaciones"])
        self.assertIn("3 rostros", textos_obs)
        self.assertIn("teléfono móvil", textos_obs.lower())

    def test_recepcion_modalidades_independientes_parciales_y_canal_polling(self):
        wav = _wav_valido_b64()
        casos = (
            {"audio": {"wav_b64": wav}},
            {"academico": {"G1": 15, "G2": 16, "corte": "despues_g2", "escala": "0-20"}},
            {"imagen": {"imagen_b64": _imagen_vacia_b64(), "detectar_objetos": False}},
            {
                "audio": {"wav_b64": wav},
                "academico": {"G1": 9, "G2": 8, "corte": "despues_g2", "escala": "0-20"},
            },
        )
        seq_base = self.client.get("/api/prediccion/recepcion/ultima").json()["actualizacion_id"]
        for idx, cuerpo in enumerate(casos, start=1):
            with self.subTest(caso=idx):
                r = self.client.post("/api/prediccion/recepcion", json={"schema_version": 1, **cuerpo})
                self.assertEqual(r.status_code, 200, r.text)
                self.assertEqual(r.headers["cache-control"], "no-store")
                datos = r.json()
                self.assertEqual(datos["actualizacion_id"], seq_base + idx)
                self.assertFalse(datos["fusion"]["ejecutada"])
                self.assertEqual(datos["fusion"]["metodo"], "sin_modelo_conjunto_validado")

        ultima = self.client.get("/api/prediccion/recepcion/ultima").json()
        self.assertTrue(ultima["disponible"])
        seq = ultima["actualizacion_id"]
        self.assertEqual(seq, seq_base + len(casos))

        sin_cambios = self.client.get(f"/api/prediccion/recepcion/ultima?desde={seq}").json()
        self.assertTrue(sin_cambios["sin_cambios"])

        reinicio = self.client.post("/api/prediccion/recepcion/reiniciar").json()
        self.assertEqual(reinicio["estado"], "reiniciado")
        despues_reinicio = self.client.get("/api/prediccion/recepcion/ultima").json()
        self.assertFalse(despues_reinicio["disponible"])

        diag = self.client.get("/api/prediccion/diagnostico").json()
        self.assertEqual(diag["modulo"], "PREDICCION")
        self.assertTrue(diag["garantias"]["prohibe_diagnostico_psicologico_o_familiar"])

    def test_cuarentena_audio_no_vocal_e_aislamiento_errores_parciales(self):
        modelo = Mock(classes_=["aprueba", "no_aprueba"])
        modelo.predict_proba.return_value = [[0.82, 0.18]]
        artefacto = {
            "modelo": modelo, "tipo": "academico", "version": "fase7-1.0",
            "algoritmo": "logistic_regression", "dataset": "fixture_sintetica",
        }
        self.enterContext(patch.object(recepcion_multimodal.modelos_fase7, "obtener_modelo", return_value=artefacto))
        t0 = datetime(2026, 5, 1, 10, 0, tzinfo=timezone.utc)
        r = self.client.post(
            "/api/prediccion/recepcion",
            json={
                "schema_version": 1,
                "sesion_id": "aula-101",
                "eventos": [
                    {
                        "evento_id": "ev-aud-asist",
                        "modulo": "audio",
                        "sesion_id": "aula-101",
                        "fecha_hora": t0.isoformat(),
                        "tipo_observacion": "asistencia",
                        "datos_observados": {"asistencia": True},
                    },
                    {
                        "evento_id": "ev-obj-img",
                        "modulo": "imagen",
                        "sesion_id": "aula-101",
                        "fecha_hora": (t0 + timedelta(seconds=1)).isoformat(),
                        "tipo_observacion": "objeto",
                        "datos_observados": {
                            "objetos": [
                                {"clase": "telefono", "confianza": 0.89},
                                {"clase": "persona", "confianza": 0.95},
                            ]
                        },
                    },
                    {
                        "evento_id": "ev-acad-ok",
                        "modulo": "academico",
                        "sesion_id": "aula-101",
                        "fecha_hora": (t0 + timedelta(seconds=2)).isoformat(),
                        "tipo_observacion": "academico",
                        "datos_observados": {"G1": 16, "G2": 15, "corte": "despues_g2", "escala": "0-20"},
                    },
                ],
            },
        )
        self.assertEqual(r.status_code, 200, r.text)
        datos = r.json()
        self.assertEqual(datos["estado"], "parcial")
        self.assertEqual(datos["analisis"]["fuentes"]["audio"]["estado"], "tipo_incompatible_no_vocal")
        self.assertEqual(datos["analisis"]["fuentes"]["imagen"]["deteccion_objetos"]["estado"], "solo_externas")
        self.assertEqual(datos["analisis"]["fuentes"]["imagen"]["deteccion_objetos"]["objetos"][0]["clase"], "telefono")
        imagen = datos["analisis"]["fuentes"]["imagen"]
        self.assertEqual(imagen["deteccion_objetos"]["conteo_personas"], 1)
        self.assertEqual(imagen["deteccion_facial"], "sin_recorte_facial")
        self.assertIsNone(imagen["rostros_detectados"])
        self.assertEqual(datos["analisis"]["academico"]["estado"], "estimacion_experimental")

    def test_deduplicacion_orden_cronologico_sesion_ventana_e_identidades(self):
        t0 = datetime(2026, 5, 1, 12, 0, tzinfo=timezone.utc)
        evento_tarde = {
            "evento_id": "ev-2",
            "modulo": "academico",
            "estudiante_id": "est-01",
            "estado_identidad": "verificada",
            "sesion_id": "s1",
            "fecha_hora": (t0 + timedelta(seconds=20)).isoformat(),
            "tipo_observacion": "academico",
            "datos_observados": {"G1": 14, "G2": 14, "corte": "despues_g2", "escala": "0-20"},
        }
        evento_temprano = {
            "evento_id": "ev-1",
            "modulo": "audio",
            "estudiante_id": "est-02",
            "estado_identidad": "verificada",
            "sesion_id": "s1",
            "fecha_hora": (t0 + timedelta(seconds=5)).isoformat(),
            "tipo_observacion": "vocal",
            "datos_observados": {"duracion_segundos": 3.0, "rms_normalizado": 0.25},
        }
        evento_otra_sesion = {
            "evento_id": "ev-3",
            "modulo": "video",
            "sesion_id": "s-distinta",
            "fecha_hora": (t0 + timedelta(seconds=6)).isoformat(),
            "tipo_observacion": "objeto",
            "datos_observados": {"objetos": [{"clase": "laptop", "confianza": 0.8}]},
        }
        evento_fuera_ventana = {
            "evento_id": "ev-4",
            "modulo": "imagen",
            "sesion_id": "s1",
            "fecha_hora": (t0 + timedelta(minutes=10)).isoformat(),
            "tipo_observacion": "objeto",
            "datos_observados": {"objetos": [{"clase": "libro", "confianza": 0.8}]},
        }

        resp = self.client.post(
            "/api/prediccion/recepcion",
            json={
                "schema_version": 1,
                "sesion_id": "s1",
                "ventana_captura": {"inicio": t0.isoformat(), "fin": (t0 + timedelta(seconds=30)).isoformat()},
                "eventos": [evento_tarde, evento_temprano, evento_temprano, evento_otra_sesion, evento_fuera_ventana],
            },
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        datos = resp.json()
        traza = datos["trazabilidad_eventos"]
        self.assertTrue(traza["reordenados_cronologicamente"])
        self.assertEqual(traza["duplicados_omitidos"], 1)
        self.assertEqual({e["motivo"] for e in traza["excluidos"]}, {"sesion_distinta", "captura_fuera_de_ventana"})
        self.assertIn("identidades_contradictorias", datos["analisis"]["sincronizacion"]["conflictos_referencia"])
        self.assertFalse(datos["analisis"]["fuentes"]["audio"]["identidad_verificada"])

        # Reenviar mismo evento_id con payload distinto -> detecta contradictorio
        evento_contradictorio = dict(evento_tarde, datos_observados={"G1": 2, "G2": 3, "corte": "despues_g2", "escala": "0-20"})
        resp2 = self.client.post(
            "/api/prediccion/recepcion",
            json={"schema_version": 1, "sesion_id": "s1", "eventos": [evento_contradictorio]},
        )
        self.assertEqual(resp2.status_code, 200)
        self.assertIn("ev-2", resp2.json()["trazabilidad_eventos"]["contradictorios"])

    def test_adaptadores_exportacion_y_seguridad_http(self):
        resp = self.client.post(
            "/api/prediccion/recepcion",
            json={
                "schema_version": 1,
                "imagen_exportacion": {
                    "schema_version": 1,
                    "modulo": "imagen",
                    "modelo": "yolov8-mock",
                    "frames": [
                        {
                            "frame_id": 1,
                            "segundo": 0.0,
                            "objetos": [{"clase": "telefono", "confianza": 0.92}],
                        }
                    ],
                },
                "video_exportacion": {
                    "schema_version": 1,
                    "modulo": "video",
                    "modelo": "tracking-mock",
                    "frames": [
                        {
                            "frame_id": 1,
                            "segundo": 0.0,
                            "detecciones": [{"clase": "person", "confianza": 0.9}, {"clase": "laptop", "confianza": 0.85}],
                        }
                    ],
                },
            },
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        img_objs = resp.json()["analisis"]["fuentes"]["imagen"]["deteccion_objetos"]["objetos"]
        self.assertEqual(img_objs[0]["clase"], "telefono")
        vid_objs = resp.json()["analisis"]["fuentes"]["video"]["deteccion_objetos"]["objetos"]
        self.assertIn("laptop", {o["clase"] for o in vid_objs})

        # Seguridad HTTP
        self.assertEqual(
            self.client.post("/api/prediccion/recepcion", json={"schema_version": 1}, headers={"Origin": "https://malicioso.example"}).status_code,
            403,
        )
        self.assertEqual(
            self.client.post("/api/prediccion/recepcion", json={"schema_version": 1}, headers={"Host": "externo.example"}).status_code,
            403,
        )
        self.assertEqual(
            self.client.post("/api/prediccion/recepcion", json={"schema_version": 1}, headers={"X-Forwarded-For": "10.0.0.5"}).status_code,
            403,
        )
        invalido = self.client.post("/api/prediccion/recepcion", json={"schema_version": 99, "extra": "dato-sensible"})
        self.assertEqual(invalido.status_code, 422)
        self.assertNotIn("dato-sensible", invalido.text)
        sobrepeso = self.client.post("/api/prediccion/recepcion", content=b"x" * (MAX_JSON_CAPTURA + 1))
        self.assertEqual(sobrepeso.status_code, 413)
