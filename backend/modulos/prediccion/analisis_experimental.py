"""Analiza entradas de Predicción sin atribuir identidad ni calcular riesgo académico."""
import logging
from typing import Annotated

import cv2
import numpy as np
from fastapi import APIRouter, Request
from pydantic import AwareDatetime, Field, model_validator
from starlette.concurrency import run_in_threadpool

from backend.entrenamiento_prediccion import predictor
from backend.entrenamiento_prediccion.imagenes import ImagenInvalida, decodificar_imagen
from .captura_entrada import leer_captura
from .seguimiento_contrato import Contrato, Naturaleza, Texto, Unidad

ETIQUETAS = ("neutral", "alegria", "tristeza", "enojo", "miedo", "sorpresa", "asco")
UMBRAL = .65
MARGEN = .15
MODELO_FACIAL = {"nombre": "modelo_emociones_facial.pkl", "version": "2.5.0",
                "origen": "rasgos sinteticos", "calibrado_en_rostros": False}
logger = logging.getLogger(__name__)


class Referencia(Contrato):
    evento_id: Texto | None = None
    sesion_id: Texto | None = None
    fecha_hora: AwareDatetime | None = None
    naturaleza: Naturaleza = "desconocida"
    calidad: Unidad | None = None


class ImagenExperimental(Referencia):
    imagen_b64: Annotated[str, Field(strict=True, min_length=1)]


class AudioExperimental(Referencia):
    duracion_segundos: Annotated[float, Field(strict=True, ge=0, le=86400, allow_inf_nan=False)]
    rms_normalizado: Unidad | None = None
    f0_hz: Annotated[float, Field(strict=True, gt=0, le=4000, allow_inf_nan=False)] | None = None
    variabilidad_f0_hz: Annotated[float, Field(strict=True, ge=0, le=4000, allow_inf_nan=False)] | None = None
    pausas_segundos: Annotated[float, Field(strict=True, ge=0, allow_inf_nan=False)] | None = None
    ritmo_segmentos_minuto: Annotated[float, Field(strict=True, ge=0, allow_inf_nan=False)] | None = None

    @model_validator(mode="after")
    def validar_pausas(self):
        if self.pausas_segundos is not None and self.pausas_segundos > self.duracion_segundos:
            raise ValueError("Las pausas no pueden superar la duración del segmento")
        return self


class EntradaExperimental(Contrato):
    schema_version: Annotated[int, Field(strict=True, ge=1, le=1)]
    imagen: ImagenExperimental | None = None
    video: ImagenExperimental | None = None
    audio: AudioExperimental | None = None


def seleccionar_expresion(puntajes):
    orden = sorted(puntajes, key=puntajes.get, reverse=True)
    primera, segunda = orden[:2]
    if puntajes[primera] >= UMBRAL and puntajes[primera] - puntajes[segunda] >= MARGEN:
        return primera
    return None


def analizar_expresion(entrada):
    try:
        imagen = decodificar_imagen(entrada.imagen_b64)
    except ImagenInvalida as error:
        return {"estado": "imagen_invalida", "motivo": str(error)}
    gris = cv2.cvtColor(imagen, cv2.COLOR_BGR2GRAY)
    caras = predictor._obtener_face_cascade().detectMultiScale(gris, scaleFactor=1.15, minNeighbors=4, minSize=(64, 64))
    if len(caras) != 1:
        return {"estado": "evidencia_insuficiente", "motivo": "Se requiere un solo rostro frontal de al menos 64 × 64.",
                "rostros_detectados": len(caras)}
    if entrada.calidad is not None and entrada.calidad < .4:
        return {"estado": "evidencia_insuficiente", "motivo": "Calidad declarada insuficiente."}
    modelo = predictor.obtener_modelo_facial()
    if modelo is None:
        return {"estado": "modelo_no_disponible", "modelo": MODELO_FACIAL}
    x, y, w, h = caras[0]
    # Centrar el recorte evita que la posición en la imagen determine la inclinación.
    rasgos = predictor._extraer_rasgos_faciales(imagen[y:y+h, x:x+w], {"x": 0, "w": 1})
    vector = np.array([[rasgos[nombre] for nombre in predictor.RASGOS_FACIALES]])
    valores = modelo.predict_proba(vector)[0]
    puntajes = {ETIQUETAS[int(clase)]: float(p) for clase, p in zip(modelo.classes_, valores, strict=True)}
    expresion = seleccionar_expresion(puntajes)
    return {"estado": "estimacion_experimental" if expresion else "abstencion",
            "expresion": expresion, "puntajes_no_calibrados": puntajes, "modelo": MODELO_FACIAL}


def analizar_audio(entrada):
    caracteristicas = entrada.model_dump(exclude=set(Referencia.model_fields) | {"duracion_segundos"}, exclude_none=True)
    insuficiente = (
        entrada.duracion_segundos < .25 or not caracteristicas or entrada.rms_normalizado == 0
        or entrada.pausas_segundos == entrada.duracion_segundos
        or (entrada.calidad is not None and entrada.calidad < .4)
    )
    return {"estado": "evidencia_insuficiente" if insuficiente else "caracteristicas_declaradas",
            "integracion_productor": "integracion_pendiente", "clasificador": "modelo_no_disponible",
            "duracion_segundos": entrada.duracion_segundos, "caracteristicas": caracteristicas}


def evaluar(entrada):
    fuentes = {}
    sincronizables = []
    for nombre, datos in (("imagen", entrada.imagen), ("video", entrada.video), ("audio", entrada.audio)):
        if datos is None:
            fuentes[nombre] = {"estado": "sin_entrada"}
            continue
        try:
            resultado = analizar_audio(datos) if nombre == "audio" else analizar_expresion(datos)
        except Exception as error:
            logger.warning("Análisis experimental fallido (%s): %s", nombre, type(error).__name__)
            resultado = {"estado": "error_inferencia", "motivo": "No fue posible completar el análisis de esta fuente."}
        referencia = datos.model_dump(mode="json", include=set(Referencia.model_fields))
        fuentes[nombre] = dict(resultado, referencia=referencia, identidad_verificada=False)
        if resultado["estado"] in {"estimacion_experimental", "caracteristicas_declaradas"}:
            sincronizables.append((nombre, datos))

    compartido = (
        entrada.imagen is not None and entrada.video is not None
        and entrada.imagen.evento_id is not None and entrada.imagen.evento_id == entrada.video.evento_id
        and entrada.imagen.sesion_id is not None and entrada.imagen.sesion_id == entrada.video.sesion_id
    )
    nombres = {nombre for nombre, _ in sincronizables}
    estado = "fuentes_insuficientes"
    if compartido and {"imagen", "video"} <= nombres:
        if (entrada.imagen.fecha_hora is not None and entrada.imagen.fecha_hora == entrada.video.fecha_hora
                and entrada.imagen.naturaleza == entrada.video.naturaleza != "desconocida"):
            sincronizables = [(nombre, datos) for nombre, datos in sincronizables if nombre != "video"]
        else:
            estado = "referencias_incompatibles"
    if len(sincronizables) >= 2 and estado != "referencias_incompatibles":
        sesiones = {datos.sesion_id for _, datos in sincronizables}
        fechas = [datos.fecha_hora for _, datos in sincronizables]
        naturalezas = {datos.naturaleza for _, datos in sincronizables}
        estado = "referencia_incompleta"
        if None not in sesiones and all(fecha is not None for fecha in fechas) and "desconocida" not in naturalezas:
            estado = "sincronizadas" if (
                len(sesiones) == len(naturalezas) == 1 and (max(fechas) - min(fechas)).total_seconds() <= 1
            ) else "referencias_incompatibles"
    return {"schema_version": 1, "fuentes": fuentes, "sincronizacion": {
        "estado": estado, "fuentes_elegibles": [nombre for nombre, _ in sincronizables],
        "evento_visual_compartido": compartido, "fusion_estadistica": "pendiente",
    }}


router = APIRouter(tags=["Análisis experimental de Predicción"])


@router.post("/prediccion/analisis-experimental")
async def analisis_experimental(request: Request):
    entrada = await leer_captura(request, EntradaExperimental)
    return await run_in_threadpool(evaluar, entrada)
