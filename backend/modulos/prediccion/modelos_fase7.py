"""Carga opcional de artefactos de investigación generados localmente."""
from functools import lru_cache
import logging
import os
from pathlib import Path

UMBRAL = .55
MARGEN = .10
VERSION = "fase7-1.0"
TIPOS = ("facial", "audio", "academico")
logger = logging.getLogger(__name__)


@lru_cache(maxsize=6)
def _cargar(tipo, ruta, modificacion):
    import joblib
    import sklearn

    try:
        artefacto = joblib.load(ruta)
        if (artefacto["version"] == VERSION and artefacto["tipo"] == tipo
                and artefacto["sklearn"] == sklearn.__version__):
            return artefacto
    except Exception as error:
        logger.warning("Artefacto experimental ilegible (%s): %s", tipo, type(error).__name__)
    return None


def obtener_modelo(tipo):
    directorio = os.environ.get("AULAPREDICT_MODELOS_FASE7")
    if not directorio or tipo not in TIPOS:
        return None
    ruta = Path(directorio).resolve() / f"{tipo}.joblib"
    try:
        return _cargar(tipo, ruta, ruta.stat().st_mtime_ns)
    except OSError:
        return None


def metadatos(artefacto):
    return {clave: artefacto[clave] for clave in ("tipo", "version", "algoritmo", "dataset")}


def clasificar(artefacto, vector, campo):
    modelo = artefacto["modelo"]
    valores = modelo.predict_proba(vector)[0]
    puntajes = {str(clase): float(valor) for clase, valor in zip(modelo.classes_, valores, strict=True)}
    primera, segunda = sorted(puntajes, key=puntajes.get, reverse=True)[:2]
    etiqueta = primera if puntajes[primera] >= UMBRAL and puntajes[primera] - puntajes[segunda] >= MARGEN else None
    return {"estado": "estimacion_experimental" if etiqueta else "abstencion", campo: etiqueta,
            "puntajes_calibrados": puntajes, "modelo": metadatos(artefacto)}
