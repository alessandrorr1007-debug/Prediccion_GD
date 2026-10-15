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


if __name__ == "__main__":
    unittest.main()
