import base64
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch

import cv2
import numpy as np
from fastapi.testclient import TestClient

from backend.app import app
from backend.entrenamiento_prediccion import predictor
from backend.entrenamiento_prediccion.modelos_yolo import ModeloYolo


CAPTURA = "/api/prediccion/analizar-captura"
VISION = "/api/vision/analizar"


class CapturaApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _, imagen = cv2.imencode(".jpg", np.zeros((240, 320, 3), dtype=np.uint8))
        cls.imagen_b64 = base64.b64encode(imagen).decode("ascii")

    def setUp(self):
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_json_invalido_y_cuerpo_grande(self):
        for ruta in (VISION, CAPTURA):
            with self.subTest(ruta=ruta):
                self.assertEqual(self.client.post(ruta, content=b"{incompleto").status_code, 400)
                exceso = (b" " * (1024 * 1024) for _ in range(9))
                self.assertEqual(self.client.post(ruta, content=exceso).status_code, 413)

    def test_tipos_y_base64_invalidos_son_422(self):
        for ruta in (VISION, CAPTURA):
            self.assertEqual(self.client.post(ruta, content=b"null").status_code, 422)
            for cuerpo in ([], {"imagen_b64": 8}, {"imagen_b64": "@@"},
                           {"imagen_b64": "data:text/plain;base64,YQ=="}, {"imagen_b64": "YQ=="}):
                with self.subTest(ruta=ruta, cuerpo=cuerpo):
                    r = self.client.post(ruta, json=cuerpo)
                    self.assertEqual(r.status_code, 422, r.text)

    def test_validacion_contexto_y_opciones_sin_cambiar_formatos_documentados(self):
        for ruta, extras in (
            (VISION, {"aplicar_mejora": "false"}),
            (VISION, {"segundos_distraccion": "nan"}),
            (CAPTURA, {"contexto_externo": {"objetos": False}}),
            (CAPTURA, {"contexto_externo": {"distractorBox": {"x": "invalido"}}}),
            (CAPTURA, {"contexto_externo": {"objetos": [{"box": {"x1": 1, "y1": 2}, "conf": "nan"}]}}),
        ):
            with self.subTest(ruta=ruta, extras=extras):
                r = self.client.post(ruta, json={"imagen_b64": self.imagen_b64, **extras})
                self.assertEqual(r.status_code, 422, r.text)

        with patch("backend.app.procesar_captura_imagen", return_value={}) as procesar:
            contexto = {"estudiante_id": "2", "acciones_detectadas": ["uso_celular"],
                        "objetos": ["telefono", {"box": {"x": .1, "y": .2}, "confianza": .9}],
                        "distractor_box": {"x1": 12, "y1": 30, "score": .8}}
            r = self.client.post(CAPTURA, json={"imagen_b64": self.imagen_b64, "contexto_externo": contexto})
            self.assertEqual(r.status_code, 200, r.text)
            procesar.assert_called_once_with(self.imagen_b64, contexto)

    def test_error_de_inferencia_no_expone_datos_internos(self):
        with patch("backend.app.procesar_frame", side_effect=RuntimeError("VALOR_INTERNO")):
            with self.assertLogs("backend.app", level="ERROR") as logs:
                r = self.client.post(VISION, json={"imagen_b64": self.imagen_b64})
        self.assertEqual(r.status_code, 500)
        self.assertEqual(r.json()["estado"], "error_inferencia")
        self.assertNotIn("VALOR_INTERNO", r.text + "".join(logs.output))

    def test_pesos_presentes_no_implican_modelo_cargado(self):
        with TemporaryDirectory() as carpeta, patch.dict("os.environ", {"AULAPREDICT_YOLO_DIR": carpeta}):
            (Path(carpeta) / "best.pt").touch()
            with patch("backend.app.YOLO_BEST", ModeloYolo("best.pt")):
                r = self.client.get("/api/vision/estado")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()["modelo_yolo_disponible"])
        self.assertEqual(r.json()["ruta_modelo_yolo"], "best.pt")
        self.assertEqual(r.json()["modelo_yolo"], {
            "estado": "carga_pendiente", "pesos_presentes": True,
            "carga": "pendiente", "inferencia": "no_ejecutada",
        })

    def test_sin_yolo_respaldo_y_sin_rostro_no_inventa_resultados(self):
        with TemporaryDirectory() as carpeta, patch.dict("os.environ", {"AULAPREDICT_YOLO_DIR": carpeta}):
            modelo = ModeloYolo("best.pt")
            with patch("backend.modulos.vision_service.YOLO_BEST", modelo):
                r = self.client.post(VISION, json={
                    "imagen_b64": f"data:image/jpeg;base64,{self.imagen_b64}",
                    "modo": "captura", "aplicar_mejora": False, "segundos_distraccion": "3",
                })
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["estado_modelos"], "modo_respaldo")
        self.assertEqual(r.json()["modelo_yolo"]["carga"], "sin_pesos")
        self.assertIsNone(r.json()["emociones"])
        self.assertIsNone(r.json()["prediccion"])

    def test_yolo_distingue_carga_e_inferencia_por_respuesta(self):
        modelo = ModeloYolo("best.pt")
        modelo.modelo = Mock()
        modelo.carga = "cargado"
        modelo.modelo.predict.side_effect = [RuntimeError("interno"), []]
        with patch("backend.modulos.vision_service.YOLO_BEST", modelo):
            error = self.client.post(VISION, json={"imagen_b64": self.imagen_b64}).json()
            exito = self.client.post(VISION, json={"imagen_b64": self.imagen_b64}).json()
        self.assertEqual(error["modelo_yolo"]["estado"], "error_inferencia")
        self.assertEqual(error["modelo_yolo"]["carga"], "cargado")
        self.assertFalse(error["modelo_yolo_activo"])
        self.assertEqual(exito["modelo_yolo"]["inferencia"], "ejecutada")
        self.assertTrue(exito["modelo_yolo_activo"])

    def test_captura_sin_pickle_no_produce_estimaciones_de_respaldo(self):
        rostro = Mock()
        rostro.detectMultiScale.return_value = [(40, 40, 50, 50)]
        with (patch.multiple(predictor, _MODELO_FACIAL=None, _MODELO_SUCESOS=None),
              patch.object(predictor, "_cargar_modelos"),
              patch.object(predictor, "_obtener_yolo_pose", return_value=None),
              patch.object(predictor, "_obtener_yolo_best", return_value=None),
              patch.object(predictor, "_obtener_face_cascade", return_value=rostro)):
            r = self.client.post(CAPTURA, json={"imagen_b64": self.imagen_b64})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["estado"], "modelo_no_disponible")
        self.assertEqual(r.json()["personas_detectadas"], 1)
        self.assertFalse(r.json()["modelos_predictivos_disponibles"])
        self.assertEqual(r.json()["estudiantes"], [])
