"""Carga opcional de artefactos de investigación generados localmente."""
from functools import lru_cache
import json
import logging
from math import isfinite
import os
from pathlib import Path

UMBRAL = .55
MARGEN = .10
VERSION = "fase7-1.0"
VERSION_FASE8 = "fase8-1.0"
PREPROCESADO_AUDIO_FASE8 = "wav-ampliado"
TIPOS = ("facial", "audio", "academico")
logger = logging.getLogger(__name__)


@lru_cache(maxsize=6)
def _cargar(tipo, ruta, version, modificacion):
    import joblib
    import sklearn

    try:
        artefacto = joblib.load(ruta)
        if (artefacto["version"] == version and artefacto["tipo"] == tipo
                and artefacto["sklearn"] == sklearn.__version__):
            if (tipo == "audio" and version == VERSION_FASE8
                    and artefacto.get("preprocesado") != PREPROCESADO_AUDIO_FASE8):
                return None
            return artefacto
    except Exception as error:
        logger.warning("Artefacto experimental ilegible (%s): %s", tipo, type(error).__name__)
    return None


def _rutas(tipo):
    if tipo not in TIPOS:
        return
    fases = [("AULAPREDICT_MODELOS_FASE7", VERSION)]
    if tipo != "academico":
        fases.insert(0, ("AULAPREDICT_MODELOS_FASE8", VERSION_FASE8))
    for variable, version in fases:
        directorio = os.environ.get(variable)
        if directorio:
            yield Path(directorio) / f"{tipo}.joblib", version


def obtener_modelo(tipo):
    for ruta, version in _rutas(tipo):
        try:
            ruta = ruta.resolve()
            artefacto = _cargar(tipo, ruta, version, ruta.stat().st_mtime_ns)
        except OSError:
            continue
        if artefacto is not None:
            return artefacto
    return None


def inspeccionar_archivo(tipo):
    for ruta, version in _rutas(tipo):
        if not ruta.is_file():
            continue
        estado = {"estado": "archivo_presente"}
        try:
            reporte = json.loads(ruta.with_suffix(".metricas.json").read_text(encoding="utf-8"))
            if reporte["tipo"] == tipo and reporte["version"] == version:
                estado["modelo"] = {"tipo": tipo, "version": version, "algoritmo": reporte["seleccion"],
                                    "dataset": reporte["dataset"]}
        except (OSError, ValueError, KeyError, TypeError):
            pass
        return estado
    return {"estado": "modelo_no_disponible"}


def metadatos(artefacto):
    return {clave: artefacto[clave] for clave in ("tipo", "version", "algoritmo", "dataset")}


def decidir(puntajes, umbral, margen):
    primera, segunda = sorted(puntajes, key=puntajes.get, reverse=True)[:2]
    maximo = puntajes[primera]
    diferencia = maximo - puntajes[segunda]
    motivos = []
    if not isfinite(maximo) or maximo < umbral:
        motivos.append("probabilidad_insuficiente")
    if not isfinite(diferencia) or diferencia < margen:
        motivos.append("margen_insuficiente")
    return (None if motivos else primera), {
        "umbral": umbral, "margen_minimo": margen, "maximo": maximo, "margen_observado": diferencia,
        "motivos": motivos, "hipotesis": primera,
    }


def clasificar(artefacto, vector, campo):
    modelo = artefacto["modelo"]
    valores = modelo.predict_proba(vector)[0]
    puntajes = {str(clase): float(valor) for clase, valor in zip(modelo.classes_, valores, strict=True)}
    etiqueta, criterio = decidir(puntajes, UMBRAL, MARGEN)
    return {
        "estado": "estimacion_experimental" if etiqueta else "abstencion",
        campo: etiqueta,
        "hipotesis": {
            "categoria": criterio["hipotesis"],
            "probabilidad": criterio["maximo"],
            "concluyente": not criterio["motivos"],
        },
        "puntajes_calibrados": puntajes,
        "modelo": metadatos(artefacto),
        "criterio_abstencion": criterio,
    }
