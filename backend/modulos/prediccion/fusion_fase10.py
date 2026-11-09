"""Fusión local limitada a una pareja pública verificada de RAVDESS."""
import csv
from functools import lru_cache
import hashlib
from io import BytesIO, StringIO
import logging
import os
from pathlib import Path
from statistics import median
from zipfile import ZipFile

from .modelos_fase7 import clasificar

VERSION = "fusion-fase9-1.0"
MUESTRA = "01-08-01-01-01-21"
AUDIO_MD5 = "bc696df654c87fed845eb13823edef8a"
TRACKING_MD5 = "5753bbc64a9a790f8a8d3e03cba526ee"
IMAGEN_SHA256 = "88431cd9653ccd539741b555fb0a46b61558b301d4110412b5bc28b5e3ea6cb5"
logger = logging.getLogger(__name__)


def archivo_configurado(variable):
    valor = os.environ.get(variable)
    try:
        ruta = Path(valor).resolve() if valor else None
        return ruta if ruta and ruta.is_file() else None
    except (OSError, RuntimeError, ValueError):
        return None


def huella(ruta, algoritmo):
    with ruta.open("rb") as archivo:
        return hashlib.file_digest(archivo, algoritmo).hexdigest()


@lru_cache(maxsize=4)
def miembro_verificado(ruta, modificacion, md5, nombre, limite):
    if huella(ruta, "md5") != md5:
        raise ValueError("Integridad del corpus inválida")
    with ZipFile(ruta) as contenedor:
        miembros = [m for m in contenedor.infolist() if Path(m.filename).name == nombre and not m.is_dir()]
        if len(miembros) != 1 or miembros[0].file_size > limite:
            raise ValueError("Muestra ambigua o fuera del límite")
        return contenedor.read(miembros[0])


def audio_demo():
    ruta = archivo_configurado("AULAPREDICT_DEMO_RAVDESS")
    if ruta:
        return miembro_verificado(ruta, ruta.stat().st_mtime_ns, AUDIO_MD5, f"03-{MUESTRA}.wav", 2 * 1024**2)
    return None


@lru_cache(maxsize=2)
def imagen_verificada(ruta, modificacion):
    if ruta.stat().st_size > 1024**2 or huella(ruta, "sha256") != IMAGEN_SHA256:
        raise ValueError("Integridad de imagen inválida")
    return ruta.read_bytes()


def imagen_demo():
    ruta = archivo_configurado("AULAPREDICT_DEMO_IMAGEN")
    return imagen_verificada(ruta, ruta.stat().st_mtime_ns) if ruta else None


@lru_cache(maxsize=2)
def cargar_modelo(ruta, modificacion):
    import joblib
    import sklearn

    # Solo una ruta fijada por el operador. La petición nunca aporta pesos ni rutas.
    paquete = joblib.load(ruta)
    modelo = paquete["modelos"]["audio_visual"]
    clases = {"alegria", "asco", "calma", "enojo", "miedo", "neutral", "sorpresa", "tristeza"}
    if (paquete["version"] != VERSION or paquete["sklearn"] != sklearn.__version__
            or modelo.n_features_in_ != 161 or set(modelo.classes_) != clases):
        raise ValueError("Artefacto de fusión incompatible")
    return modelo


def evaluar_fusion(solicitada, *, demo=False, wav=None):
    ruta_modelo = archivo_configurado("AULAPREDICT_FUSION_FASE10")
    estado = {"solicitada": solicitada, "disponible": ruta_modelo is not None,
              "compatible": None, "ejecutada": False, "motivo": "no_solicitada"}
    if not solicitada:
        return estado
    if not demo:
        return dict(estado, compatible=False, motivo="procedencia_externa_no_validada")
    tracking = archivo_configurado("AULAPREDICT_DEMO_TRACKING")
    if wav is None or tracking is None:
        return dict(estado, compatible=False, motivo="pareja_ravdess_no_disponible")

    try:
        from backend.entrenamiento_prediccion.evaluar_fusion_fase9 import entrada_por_modalidad, rasgos_visuales
        from backend.entrenamiento_prediccion.rasgos_fase7 import rasgos_audio

        csv_tracking = miembro_verificado(tracking, tracking.stat().st_mtime_ns, TRACKING_MD5,
                                          f"01-{MUESTRA}.csv", 2 * 1024**2)
        tiempos = [float(fila["timestamp"]) for fila in csv.DictReader(StringIO(csv_tracking.decode("utf-8")))]
        intervalos = [b - a for a, b in zip(tiempos, tiempos[1:])]
        if not intervalos or not all(i > 0 for i in intervalos) or not 29 <= 1 / median(intervalos) <= 31:
            return dict(estado, compatible=False, motivo="frecuencia_tracking_incompatible")
        audio, calidad = rasgos_audio(wav, ampliado=True)
        visual, motivo = rasgos_visuales(BytesIO(csv_tracking), calidad["duracion_segundos"])
        if motivo:
            return dict(estado, compatible=False, motivo=motivo)
    except Exception as error:
        logger.warning("Validación de pareja RAVDESS fallida: %s", type(error).__name__)
        return dict(estado, compatible=False, motivo="pareja_ravdess_invalida")

    if ruta_modelo is None:
        return dict(estado, compatible=True, motivo="modelo_no_disponible")
    try:
        modelo = cargar_modelo(ruta_modelo, ruta_modelo.stat().st_mtime_ns)
        _, entrada = entrada_por_modalidad(audio.reshape(1, -1), visual.reshape(1, -1))
        artefacto = {"modelo": modelo, "tipo": "fusion", "version": VERSION,
                     "algoritmo": "regresion_logistica_escalada",
                     "dataset": {"nombre": "RAVDESS y Facial Landmark Tracking"}}
        resultado = clasificar(artefacto, entrada, "expresion")
    except Exception as error:
        logger.warning("Inferencia de fusión fallida: %s", type(error).__name__)
        return dict(estado, disponible=False, compatible=True, motivo="artefacto_no_utilizable")
    return dict(estado, compatible=True, ejecutada=True, motivo="pareja_publica_verificada",
                muestra=MUESTRA, duracion_segundos=calidad["duracion_segundos"],
                frecuencia_tracking_hz=1 / median(intervalos), resultado=resultado)
