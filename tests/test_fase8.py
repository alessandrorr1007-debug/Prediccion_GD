import base64
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch

import joblib
import numpy as np
import pandas as pd
import sklearn
from fastapi.testclient import TestClient
from sklearn.dummy import DummyClassifier

from backend.app import app
from backend.entrenamiento_prediccion.entrenar_fer import VOTOS, importar
from backend.entrenamiento_prediccion.rasgos_fase7 import DIM_AUDIO_FASE7, rasgos_audio
from backend.modulos.prediccion import analisis_experimental, modelos_fase7
from test_analisis_experimental import imagen_b64
from test_fase7 import artefacto, wav_b64


class Fase8Tests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def enviar(self, **datos):
        respuesta = self.client.post("/api/prediccion/analisis-experimental", json={"schema_version": 1, **datos})
        self.assertEqual(respuesta.status_code, 200)
        return respuesta.json()

    def test_selector_real_no_recurre_al_sintetico_y_historico_es_explicito(self):
        cara = Mock()
        cara.detectMultiScale.return_value = [(10, 10, 80, 80)]
        original = analisis_experimental.predictor
        datos = {"imagen_b64": imagen_b64()}
        with (patch.object(original, "_obtener_face_cascade", return_value=cara),
              patch.object(original, "obtener_modelo_facial") as historico,
              patch.object(modelos_fase7, "obtener_modelo", return_value=None) as real):
            salida = self.enviar(imagen=dict(datos, modelo_facial="real"))
            self.assertEqual(salida["fuentes"]["imagen"]["estado"], "modelo_no_disponible")
            historico.assert_not_called()
            real.reset_mock()
            historico.return_value = Mock(classes_=[0, 1])
            historico.return_value.predict_proba.return_value = [[.55, .45]]
            salida = self.enviar(imagen=dict(datos, modelo_facial="historico"))["fuentes"]["imagen"]
            self.assertEqual(salida["origen_entrenamiento"], "sintetico")
            real.assert_not_called()

    def test_audio_ampliado_conserva_rasgos_originales_y_es_reproducible(self):
        datos = base64.b64decode(wav_b64())
        anterior, calidad = rasgos_audio(datos)
        ampliado, nueva_calidad = rasgos_audio(datos, ampliado=True)
        self.assertEqual(calidad, nueva_calidad)
        np.testing.assert_array_equal(anterior, ampliado[:DIM_AUDIO_FASE7])
        np.testing.assert_array_equal(ampliado, rasgos_audio(datos, ampliado=True)[0])
        self.assertEqual(ampliado.shape, (110,))
        self.assertTrue(np.isfinite(ampliado).all())
        modelo = artefacto("audio", ["calma", "neutral"], [.8, .2])
        modelo.update(version=modelos_fase7.VERSION_FASE8, preprocesado="wav-ampliado")
        with patch.object(modelos_fase7, "obtener_modelo", return_value=modelo):
            salida = self.enviar(audio={"wav_b64": wav_b64()})["fuentes"]["audio"]
        self.assertEqual(salida["expresion_vocal"], "calma")
        self.assertEqual(salida["modelo"]["version"], modelos_fase7.VERSION_FASE8)
        np.testing.assert_array_equal(modelo["modelo"].predict_proba.call_args.args[0], [ampliado])

    def test_estado_archivo_no_deserializa_y_fallback_valida_preprocesado(self):
        with TemporaryDirectory() as temporal:
            base = Path(temporal)
            anterior, nuevo = base / "fase7", base / "fase8"
            anterior.mkdir()
            nuevo.mkdir()
            modelo = DummyClassifier().fit([[0], [1]], ["calma", "neutral"])
            metadata = {"modelo": modelo, "algoritmo": "fixture", "tipo": "audio", "dataset": {},
                        "sklearn": sklearn.__version__, "version": modelos_fase7.VERSION}
            joblib.dump(metadata, anterior / "audio.joblib")
            joblib.dump(dict(metadata, version=modelos_fase7.VERSION_FASE8), nuevo / "audio.joblib")
            variables = {"AULAPREDICT_MODELOS_FASE7": str(anterior), "AULAPREDICT_MODELOS_FASE8": str(nuevo)}
            with patch.dict(os.environ, variables):
                with patch.object(modelos_fase7, "_cargar", side_effect=AssertionError("deserialización")):
                    estado = self.client.get("/api/prediccion/modelos-investigacion?cargar=false").json()
                    self.assertEqual(estado["audio"]["estado"], "archivo_presente")
                    self.assertEqual(estado["facial"]["estado"], "modelo_no_disponible")
                self.assertEqual(modelos_fase7.obtener_modelo("audio")["version"], modelos_fase7.VERSION)
            modelos_fase7._cargar.cache_clear()

    def test_deduplica_y_reporta_conflictos_aunque_una_senal_sea_invalida(self):
        ref = {"sesion_id": "s1", "evento_id": "v1", "fecha_hora": "2026-11-09T10:00:00Z",
               "naturaleza": "real", "origen": "ejemplo-validacion", "imagen_b64": "fixture"}
        with patch.object(analisis_experimental, "analizar_expresion", return_value={"estado": "estimacion_experimental"}) as inferir:
            salida = self.enviar(imagen=ref, video=ref, audio={"sesion_id": "s2", "wav_b64": "!!!"})
            inferir.assert_called_once()
        self.assertEqual(salida["fuentes"]["video"]["duplicado_de"], "imagen")
        self.assertFalse(salida["fuentes"]["imagen"]["identidad_verificada"])
        self.assertEqual(salida["fuentes"]["audio"]["estado"], "audio_invalido")
        self.assertEqual(salida["sincronizacion"]["conflictos_referencia"], ["sesiones_distintas"])
        self.assertEqual(salida["sincronizacion"]["estado"], "referencias_incompatibles")
        self.assertFalse(salida["sincronizacion"]["referencias_compatibles"])

    def test_referencias_compatibles_aunque_los_modelos_se_abstengan(self):
        ref = {"sesion_id": "s1", "fecha_hora": "2026-11-09T10:00:00Z", "naturaleza": "real"}
        with (patch.object(analisis_experimental, "analizar_expresion", return_value={"estado": "abstencion"}),
              patch.object(analisis_experimental, "analizar_audio", return_value={"estado": "abstencion"})):
            salida = self.enviar(imagen=dict(ref, imagen_b64="fixture"), audio=dict(ref, wav_b64="fixture"))
        sincronizacion = salida["sincronizacion"]
        self.assertTrue(sincronizacion["referencias_compatibles"])
        self.assertEqual(sincronizacion["fuentes_elegibles"], [])
        self.assertEqual(sincronizacion["fusion_estadistica"], "pendiente")

    def test_importador_fer_valida_tamano_y_orden_de_fer_plus(self):
        with TemporaryDirectory() as temporal:
            base = Path(temporal)
            imagenes, anotaciones = base / "fer.csv", base / "plus.csv"
            datos = pd.DataFrame({"Usage": ["Training", "PrivateTest"], "emotion": [0, 1],
                                  "pixels": ["0 " * 2304, "1 " * 2304]})
            datos.to_csv(imagenes, index=False)
            with self.assertRaisesRegex(ValueError, "cantidades por partición"):
                importar(imagenes, None, exigir_original=True)
            votos = pd.DataFrame(0, index=range(2), columns=VOTOS)
            votos["happiness"] = [8, 9]
            votos["Usage"] = datos.Usage
            votos.to_csv(anotaciones, index=False)
            self.assertEqual(importar(imagenes, anotaciones)[1].tolist(), ["alegria", "alegria"])
            votos.iloc[::-1].to_csv(anotaciones, index=False)
            with self.assertRaisesRegex(ValueError, "mismo número y orden"):
                importar(imagenes, anotaciones)
