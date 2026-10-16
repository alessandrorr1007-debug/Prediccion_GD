import unittest
from backend.modulos.prediccion.engine import predecir


def evento(**cambios):
    return dict(id="1", modalidad="imagen", senal="telefono", segundo=10,
                confianza=.9, calidad=.9, **cambios)


class MotorTests(unittest.TestCase):
    def test_sin_datos_no_inventa_normalidad(self):
        self.assertIsNone(predecir({})["indice_revision"])

    def test_duplicados_no_incrementan_score(self):
        e = evento()
        base = predecir({"eventos": [e]})
        self.assertEqual(base, predecir({"eventos": [e, e]}))
        copia = dict(e, id="2", modalidad="video")
        self.assertEqual(base["indice_revision"], predecir({"eventos": [e, copia]})["indice_revision"])

    def test_baja_calidad_y_confianza_cero(self):
        for cambios in ({"calidad": .1}, {"confianza": 0}):
            resultado = predecir({"eventos": [dict(evento(), **cambios)]})
            self.assertIsNone(resultado["indice_revision"])

    def test_contexto_permite_libro(self):
        e = dict(evento(), senal="libro")
        self.assertEqual(predecir({"eventos": [e], "objetos_permitidos": ["libro"]})["indice_revision"], 0)

    def test_datos_vencidos_o_futuros(self):
        for ahora in (5, 100):
            self.assertIsNone(predecir({"eventos": [evento()], "segundo_actual": ahora})["indice_revision"])

    def test_persistencia_real(self):
        eventos = [dict(evento(), id=str(i), segundo=i) for i in (1, 5, 10)]
        self.assertTrue(predecir({"eventos": eventos})["evidencia"][0]["persistente"])

    def test_valores_invalidos(self):
        for valor in (float("nan"), float("inf"), -1, 95, True):
            with self.assertRaises(ValueError):
                predecir({"eventos": [dict(evento(), confianza=valor)]})

    def test_senal_desconocida_no_indica_normalidad(self):
        self.assertIsNone(predecir({"eventos": [dict(evento(), senal="otra") ]})["indice_revision"])

    def test_captura_sin_personas_devuelve_cero_alumnos(self):
        import base64
        import cv2
        import numpy as np
        from backend.entrenamiento_prediccion.predictor import procesar_captura_imagen

        # Imagen plana vacía (pared o escritorio sin personas)
        vacia = np.zeros((360, 480, 3), dtype=np.uint8)
        _, buffer = cv2.imencode(".jpg", vacia)
        b64 = base64.b64encode(buffer).decode("utf-8")

        resultado = procesar_captura_imagen(b64)
        self.assertEqual(resultado["total_alumnos"], 0)
        self.assertEqual(resultado["estudiantes"], [])
        self.assertEqual(resultado["estado"], "sin_personas")

    def test_asociacion_espacial_individual_distractores(self):
        import base64
        import cv2
        import numpy as np
        from unittest.mock import patch, MagicMock
        from backend.entrenamiento_prediccion.predictor import procesar_captura_imagen

        img_test = np.zeros((480, 640, 3), dtype=np.uint8)
        _, buffer = cv2.imencode(".jpg", img_test)
        b64 = base64.b64encode(buffer).decode("utf-8")

        # Simular 2 alumnos detectados por YOLO Pose
        # Alumno 1 en la izquierda (x: 50..200), Alumno 2 en la derecha (x: 350..500)
        box1 = MagicMock()
        box1.xyxy = [np.array([50, 100, 200, 400], dtype=np.float32)]
        box1.conf = [np.array(0.92, dtype=np.float32)]

        box2 = MagicMock()
        box2.xyxy = [np.array([350, 100, 500, 400], dtype=np.float32)]
        box2.conf = [np.array(0.91, dtype=np.float32)]

        mock_pose_res = MagicMock()
        mock_pose_res.boxes = [box1, box2]
        mock_pose_res.keypoints = None

        mock_pose = MagicMock()
        mock_pose.return_value = [mock_pose_res]

        # Celular espacialmente situado sobre el Alumno 2 (x: 380..440, y: 250..320)
        contexto = {
            "distractorBox": {
                "x1": 380, "y1": 250, "x2": 440, "y2": 320,
                "label": "Celular (0.95)"
            }
        }

        with patch("backend.entrenamiento_prediccion.predictor._obtener_yolo_pose", return_value=mock_pose):
            with patch("backend.entrenamiento_prediccion.predictor._obtener_yolo_best", return_value=None):
                res = procesar_captura_imagen(b64, contexto_externo=contexto)

        self.assertEqual(res["total_alumnos"], 2)
        est1, est2 = res["estudiantes"]

        # Estudiante 1 NO tiene celular y está libre de penalización
        self.assertFalse(est1["distractor"])
        self.assertIsNone(est1["distractorBox"])
        self.assertNotEqual(est1["accionDetectada"], "Uso de teléfono móvil frente a cámara")

        # Estudiante 2 SÍ tiene celular asignado exclusivamente por intersección espacial
        self.assertTrue(est2["distractor"])
        self.assertIsNotNone(est2["distractorBox"])
        self.assertEqual(est2["accionDetectada"], "Uso de teléfono móvil frente a cámara")
        self.assertIn("Celular", est2["distractorBox"]["label"])

    def test_escenario_aula_ejemplo_distractor_individual(self):
        from backend.entrenamiento_prediccion.predictor import obtener_escenario_aula_ejemplo
        escenario = obtener_escenario_aula_ejemplo()
        self.assertEqual(escenario["total_alumnos"], 5)
        # Solo el alumno 3 tiene celular asignado
        self.assertFalse(escenario["estudiantes"][0]["distractor"])
        self.assertFalse(escenario["estudiantes"][1]["distractor"])
        self.assertTrue(escenario["estudiantes"][2]["distractor"])
        self.assertFalse(escenario["estudiantes"][3]["distractor"])
        self.assertFalse(escenario["estudiantes"][4]["distractor"])


if __name__ == "__main__":
    unittest.main()

