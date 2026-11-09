import base64
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch
import wave

import cv2
import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

from backend.app import app
from backend.entrenamiento_prediccion.entrenar_fer import importar
from backend.modulos.prediccion import analisis_experimental, modelos_fase7


def wav_b64(silencio=False):
    t = np.arange(16000) / 16000
    datos = np.zeros_like(t) if silencio else 5000 * np.sin(2 * np.pi * 180 * t)
    buffer = BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
        wav.writeframes(datos.astype("<i2").tobytes())
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def artefacto(tipo, clases, valores):
    modelo = Mock(classes_=clases)
    modelo.predict_proba.return_value = [valores]
    return {"tipo": tipo, "version": modelos_fase7.VERSION, "dataset": {"fuente": "fixture"},
            "algoritmo": "fixture", "modelo": modelo}


class Fase7Tests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def enviar(self, **datos):
        return self.client.post("/api/prediccion/analisis-experimental", json={"schema_version": 1, **datos})

    def test_wav_invalido_insuficiente_y_sin_modelo(self):
        with patch.object(modelos_fase7, "obtener_modelo", return_value=None):
            for wav, esperado in (("!!", "audio_invalido"), (wav_b64(True), "evidencia_insuficiente"),
                                  (wav_b64(), "modelo_no_disponible")):
                with self.subTest(estado=esperado):
                    salida = self.enviar(audio={"wav_b64": wav}).json()["fuentes"]["audio"]
                    self.assertEqual(salida["estado"], esperado)
                    self.assertNotIn("wav_b64", str(salida))

    def test_audio_calibrado_academico_independiente_y_sin_fusion(self):
        audio = artefacto("audio", ["calma", "neutral"], [.54, .46])
        academico = artefacto("academico", ["aprueba", "no_aprueba"], [.1, .9])
        with patch.object(modelos_fase7, "obtener_modelo", side_effect={"audio": audio, "academico": academico}.get):
            notas = {"G1": 8, "G2": 9, "escala": "0-20", "corte": "despues_g2"}
            salida = self.enviar(audio={"wav_b64": wav_b64()}, academico=notas).json()
            voz = salida["fuentes"]["audio"]
            self.assertEqual(voz["estado"], "abstencion")
            self.assertIsNone(voz["expresion_vocal"])
            self.assertEqual(voz["puntajes_calibrados"]["calma"], .54)
            self.assertFalse(voz["identidad_verificada"])
            self.assertEqual(salida["academico"]["probabilidad_no_aprueba"], .9)
            academico["modelo"].predict_proba.assert_called_once_with([[8, 9]])
            self.assertEqual(salida["sincronizacion"]["fusion_estadistica"], "pendiente")
            estados = self.client.get("/api/prediccion/modelos-investigacion").json()
            self.assertEqual(estados["audio"]["modelo"]["version"], modelos_fase7.VERSION)
            self.assertEqual(estados["facial"]["estado"], "modelo_no_disponible")

    def test_academico_requiere_variables_compatibles(self):
        with patch.object(modelos_fase7, "obtener_modelo", return_value=None) as cargar:
            salida = self.enviar(academico={"G1": 8}).json()["academico"]
            self.assertEqual(salida["estado"], "evidencia_insuficiente")
            self.assertEqual(salida["campos_faltantes"], ["G2", "corte", "escala"])
            cargar.assert_not_called()
            self.assertEqual(self.enviar(academico={"G1": True}).status_code, 422)
            self.assertEqual(self.enviar(academico={"G2": 21}).status_code, 422)
            notas = {"G1": 8, "G2": 9, "escala": "0-20", "corte": "despues_g2"}
            self.assertEqual(self.enviar(academico=notas).json()["academico"]["estado"], "modelo_no_disponible")

    def test_artefacto_facial_recibe_recorte_y_preserva_la_calidad(self):
        cara = Mock()
        cara.detectMultiScale.return_value = [(10, 10, 80, 80)]
        fer = artefacto("facial", ["alegria", "neutral"], [.15, .85])
        imagen = cv2.imencode(".png", np.zeros((100, 100, 3), dtype=np.uint8))[1]
        datos = {"imagen_b64": base64.b64encode(imagen).decode("ascii"), "calidad": .7}
        with (patch.object(analisis_experimental.predictor, "_obtener_face_cascade", return_value=cara),
              patch.object(modelos_fase7, "obtener_modelo", return_value=fer)):
            salida = self.enviar(video=datos).json()["fuentes"]["video"]
        self.assertEqual(salida["expresion"], "neutral")
        self.assertEqual(salida["puntajes_calibrados"]["neutral"], .85)
        self.assertEqual(salida["calidad_entrada"]["recorte_px"], [80, 80])
        self.assertEqual(fer["modelo"].predict_proba.call_args.args[0].shape, (1, 2304))

    def test_importador_fer_reserva_duplicado_en_prueba(self):
        with TemporaryDirectory() as directorio:
            csv = Path(directorio) / "fer.csv"
            pixeles = " ".join(["0"] * 2304)
            filas = [("Training", 0, pixeles), ("PrivateTest", 0, pixeles), ("PublicTest", 1, "0")]
            pd.DataFrame(filas, columns=["Usage", "emotion", "pixels"]).to_csv(csv, index=False)
            x, y, grupo, descartes = importar(csv, None)
            self.assertEqual(x.shape, (1, 2304))
            self.assertEqual(y.tolist(), ["enojo"])
            self.assertEqual(grupo.tolist(), [2])
            self.assertEqual(descartes["duplicado_exacto"], 1)
            self.assertEqual(descartes["fila_invalida"], 1)
            with self.assertRaisesRegex(ValueError, "mismo número y orden"):
                importar(csv, csv)
