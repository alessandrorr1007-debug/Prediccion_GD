"""Evalúa señales y notas compatibles por separado, sin atribuir identidad."""
import base64
import logging
from time import perf_counter
from typing import Annotated, Any, Literal

import cv2
import numpy as np
from fastapi import APIRouter, Request
from pydantic import AwareDatetime, Field, StrictBool, model_validator
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse

from backend.entrenamiento_prediccion import predictor
from backend.entrenamiento_prediccion.imagenes import ImagenInvalida, decodificar_imagen
from . import modelos_fase7
from .captura_entrada import leer_captura
from .detector_objetos import detectar_objetos_imagen
from .interpretacion_visual import construir_interpretacion_visual
from .seguimiento_contrato import Contrato, Naturaleza, Texto, Unidad

ETIQUETAS = ("neutral", "alegria", "tristeza", "enojo", "miedo", "sorpresa", "asco")
UMBRAL = .65
MARGEN = .15
MODELO_FACIAL = {"nombre": "modelo_emociones_facial.pkl", "version": "2.5.0",
                "origen": "rasgos sinteticos", "calibrado_en_rostros": False}
logger = logging.getLogger(__name__)
MIN_DETECCION_PX = 30
MIN_CLASIFICACION_PX = 64
MAX_LADO_DETECCION_PX = 1600


class Referencia(Contrato):
    evento_id: Texto | None = None
    sesion_id: Texto | None = None
    fecha_hora: AwareDatetime | None = None
    naturaleza: Naturaleza = "desconocida"
    origen: Texto | None = None
    calidad: Unidad | None = None


class ImagenExperimental(Referencia):
    imagen_b64: Annotated[str, Field(strict=True, min_length=1)]
    modelo_facial: Literal["automatico", "real", "historico"] = "automatico"
    detectar_objetos: StrictBool = True
    detecciones_objetos: list[dict[str, Any]] | None = Field(default=None, max_length=200)
    estudiante_id: Texto | None = None
    estado_identidad: Literal["desconocida", "verificada", "ambigua"] = "desconocida"


class AudioExperimental(Referencia):
    duracion_segundos: Annotated[float, Field(strict=True, ge=0, le=86400, allow_inf_nan=False)] | None = None
    wav_b64: Annotated[str, Field(strict=True, min_length=1, max_length=2_800_000)] | None = None
    rms_normalizado: Unidad | None = None
    f0_hz: Annotated[float, Field(strict=True, gt=0, le=4000, allow_inf_nan=False)] | None = None
    variabilidad_f0_hz: Annotated[float, Field(strict=True, ge=0, le=4000, allow_inf_nan=False)] | None = None
    pausas_segundos: Annotated[float, Field(strict=True, ge=0, allow_inf_nan=False)] | None = None
    ritmo_segmentos_minuto: Annotated[float, Field(strict=True, ge=0, allow_inf_nan=False)] | None = None
    tipo_observacion: Literal["vocal", "asistencia", "transcripcion", "desconocida"] | None = None
    estudiante_id: Texto | None = None
    estado_identidad: Literal["desconocida", "verificada", "ambigua"] = "desconocida"

    @model_validator(mode="after")
    def validar_pausas(self):
        if self.tipo_observacion in {"asistencia", "transcripcion"}:
            return self
        if self.duracion_segundos is None and (self.wav_b64 is None or self.pausas_segundos is not None):
            raise ValueError("Los descriptores de audio requieren duración")
        if self.pausas_segundos is not None and self.pausas_segundos > self.duracion_segundos:
            raise ValueError("Las pausas no pueden superar la duración del segmento")
        return self


Nota = Annotated[int, Field(strict=True, ge=0, le=20)]


class EntradaAcademica(Contrato):
    G1: Nota | None = None
    G2: Nota | None = None
    corte: Literal["despues_g2"] | None = None
    escala: Literal["0-20"] | None = None


class EntradaExperimental(Contrato):
    schema_version: Annotated[int, Field(strict=True, ge=1, le=1)]
    imagen: ImagenExperimental | None = None
    video: ImagenExperimental | None = None
    audio: AudioExperimental | None = None
    academico: EntradaAcademica | None = None


def seleccionar_expresion(puntajes):
    return modelos_fase7.decidir(puntajes, UMBRAL, MARGEN)[0]


def localizar_rostros(gris):
    alto, ancho = gris.shape
    escala = min(1, MAX_LADO_DETECCION_PX / max(ancho, alto))
    muestra = gris
    if escala < 1:
        medidas = (max(1, round(ancho * escala)), max(1, round(alto * escala)))
        muestra = cv2.resize(gris, medidas, interpolation=cv2.INTER_AREA)
    alto_muestra, ancho_muestra = muestra.shape
    cajas = []
    caras = predictor.detectar_rostros(muestra, (MIN_DETECCION_PX, MIN_DETECCION_PX), experimental=True)
    for x, y, w, h in caras:
        izquierda = max(0, round(int(x) * ancho / ancho_muestra))
        arriba = max(0, round(int(y) * alto / alto_muestra))
        derecha = min(ancho, round(int(x + w) * ancho / ancho_muestra))
        abajo = min(alto, round(int(y + h) * alto / alto_muestra))
        if izquierda < derecha and arriba < abajo:
            cajas.append({"x": izquierda, "y": arriba, "ancho": derecha - izquierda, "alto": abajo - arriba})
    return cajas


def analizar_expresion(entrada):
    tiempos = {}

    def medir(etapa, operacion, *args, **kwargs):
        inicio = perf_counter()
        try:
            return operacion(*args, **kwargs)
        finally:
            tiempos[etapa] = round((perf_counter() - inicio) * 1000, 3)

    try:
        imagen = medir("decodificacion", decodificar_imagen, entrada.imagen_b64)
    except ImagenInvalida as error:
        return {"estado": "imagen_invalida", "motivo": str(error), "tiempos_ms": tiempos}
    gris = medir("escala_de_grises", cv2.cvtColor, imagen, cv2.COLOR_BGR2GRAY)
    caras = medir("deteccion", localizar_rostros, gris)
    obj_det = medir(
        "objetos",
        detectar_objetos_imagen,
        imagen,
        caras=caras,
        gris=gris,
        detecciones_externas=getattr(entrada, "detecciones_objetos", None),
        usar_yolo=getattr(entrada, "detectar_objetos", False),
    )
    alto, ancho = gris.shape
    deteccion = {"rostros_detectados": len(caras), "rostros": caras, "imagen_px": [ancho, alto],
                 "detector_facial": "opencv_haar_frontalface_alt", "deteccion_objetos": obj_det,
                 "tiempos_ms": tiempos}
    if not caras:
        return dict(deteccion, estado="evidencia_insuficiente", deteccion_facial="sin_rostro",
                    motivo="Prueba con un rostro frontal visible y bien iluminado.")
    if len(caras) > 1:
        return dict(deteccion, estado="evidencia_insuficiente", deteccion_facial="multiples_rostros",
                    motivo="Se requiere un solo rostro para clasificar.")
    x, y, w, h = (caras[0][campo] for campo in ("x", "y", "ancho", "alto"))
    if min(w, h) < MIN_CLASIFICACION_PX:
        return dict(deteccion, estado="evidencia_insuficiente", deteccion_facial="rostro_pequeno",
                    motivo="Acerca el rostro. La clasificación requiere un recorte de al menos 64 × 64 píxeles.")
    if entrada.calidad is not None and entrada.calidad < .4:
        return dict(deteccion, estado="evidencia_insuficiente", deteccion_facial="calidad_insuficiente",
                    motivo="Calidad declarada insuficiente.")
    calidad = {"declarada": entrada.calidad, "rostros_detectados": 1, "recorte_px": [w, h]}
    deteccion.update(deteccion_facial="rostro_detectado", calidad_entrada=calidad)
    artefacto = (medir("carga_modelo", modelos_fase7.obtener_modelo, "facial")
                 if entrada.modelo_facial != "historico" else None)
    if artefacto is not None:
        inicio = perf_counter()
        recorte = gris[y:y+h, x:x+w]
        tiempos["recorte"] = round((perf_counter() - inicio) * 1000, 3)
        inicio = perf_counter()
        vector = cv2.resize(recorte, (48, 48), interpolation=cv2.INTER_AREA).reshape(1, -1)
        tiempos["preprocesamiento"] = round((perf_counter() - inicio) * 1000, 3)
        return dict(deteccion, **medir("inferencia", modelos_fase7.clasificar, artefacto, vector, "expresion"),
                    origen_entrenamiento="datos_reales",
                    limitacion="Categorías de expresión observable. No permiten inferir estados internos ni diagnósticos.")
    if entrada.modelo_facial == "real":
        return dict(deteccion, estado="modelo_no_disponible",
                    motivo="No hay un modelo facial entrenado con datos reales habilitado.")
    modelo = predictor.obtener_modelo_facial()
    if modelo is None:
        return dict(deteccion, estado="modelo_no_disponible", modelo=MODELO_FACIAL)
    # Centrar el recorte evita que la posición en la imagen determine la inclinación.
    rasgos = predictor._extraer_rasgos_faciales(imagen[y:y+h, x:x+w], {"x": 0, "w": 1})
    vector = np.array([[rasgos[nombre] for nombre in predictor.RASGOS_FACIALES]])
    valores = modelo.predict_proba(vector)[0]
    puntajes = {ETIQUETAS[int(clase)]: float(p) for clase, p in zip(modelo.classes_, valores, strict=True)}
    expresion, criterio = modelos_fase7.decidir(puntajes, UMBRAL, MARGEN)
    return {**deteccion, "estado": "estimacion_experimental" if expresion else "abstencion",
            "expresion": expresion,
            "hipotesis": {"categoria": criterio["hipotesis"], "probabilidad": criterio["maximo"],
                          "concluyente": not criterio["motivos"]},
            "puntajes_no_calibrados": puntajes, "modelo": MODELO_FACIAL,
            "calidad_entrada": calidad, "origen_entrenamiento": "sintetico", "criterio_abstencion": criterio}


def analizar_audio(entrada):
    if getattr(entrada, "tipo_observacion", None) in {"asistencia", "transcripcion"}:
        return {
            "estado": "tipo_incompatible_no_vocal",
            "tipo_observacion": entrada.tipo_observacion,
            "motivo": f"La entrada de tipo «{entrada.tipo_observacion}» no corresponde a señal vocal y se excluye del clasificador acústico.",
            "clasificador": "omitido_por_incompatibilidad",
        }
    if entrada.wav_b64 is not None:
        return analizar_wav(entrada)
    caracteristicas = entrada.model_dump(
        exclude=set(Referencia.model_fields) | {"duracion_segundos", "wav_b64", "tipo_observacion", "estudiante_id", "estado_identidad"},
        exclude_none=True,
    )
    insuficiente = (
        entrada.duracion_segundos < .25 or not caracteristicas or entrada.rms_normalizado == 0
        or entrada.pausas_segundos == entrada.duracion_segundos
        or (entrada.calidad is not None and entrada.calidad < .4)
    )
    return {"estado": "evidencia_insuficiente" if insuficiente else "caracteristicas_declaradas",
            "integracion_productor": "integracion_pendiente", "clasificador": "modelo_no_disponible",
            "duracion_segundos": entrada.duracion_segundos, "caracteristicas": caracteristicas}


def analizar_wav(entrada):
    from backend.entrenamiento_prediccion.rasgos_fase7 import SenalInsuficiente, extraer_audio, preparar_audio

    valor = entrada.wav_b64
    if valor.startswith(("data:audio/wav;base64,", "data:audio/x-wav;base64,")):
        valor = valor.split(",", 1)[1]
    try:
        senal, calidad = preparar_audio(base64.b64decode(valor, validate=True))
    except SenalInsuficiente as error:
        return {"estado": "evidencia_insuficiente", "motivo": str(error)}
    except ValueError:
        return {"estado": "audio_invalido", "motivo": "Se requiere base64 con WAV PCM16, 8–48 kHz, hasta 8 s."}
    if entrada.calidad is not None and entrada.calidad < .4:
        return {"estado": "evidencia_insuficiente", "motivo": "Calidad declarada insuficiente."}
    artefacto = modelos_fase7.obtener_modelo("audio")
    if artefacto is None:
        return {"estado": "modelo_no_disponible", "calidad_entrada": calidad}
    vector = extraer_audio(senal, ampliado=artefacto.get("preprocesado") == modelos_fase7.PREPROCESADO_AUDIO_FASE8)
    return dict(modelos_fase7.clasificar(artefacto, vector.reshape(1, -1), "expresion_vocal"),
                calidad_entrada=calidad, limitacion="Patrones vocales actuados en inglés norteamericano.")


def analizar_academico(entrada):
    if entrada is None:
        return {"estado": "sin_entrada"}
    faltantes = [campo for campo in EntradaAcademica.model_fields if getattr(entrada, campo) is None]
    if faltantes:
        return {"estado": "evidencia_insuficiente", "campos_faltantes": faltantes}
    artefacto = modelos_fase7.obtener_modelo("academico")
    if artefacto is None:
        return {"estado": "modelo_no_disponible"}
    resultado = modelos_fase7.clasificar(artefacto, [[entrada.G1, entrada.G2]], "desenlace_estimado")
    return dict(resultado, desenlace="G3 < 10/20", corte=entrada.corte,
                probabilidad_no_aprueba=resultado["puntajes_calibrados"]["no_aprueba"],
                limitacion="Matemáticas de secundaria portuguesa. Uso de investigación.")


def evaluar(entrada):
    fuentes = {}
    sincronizables = []
    referencias = tuple(datos for datos in (entrada.imagen, entrada.video, entrada.audio) if datos is not None)
    sesiones = {datos.sesion_id for datos in referencias if datos.sesion_id is not None}
    fechas = [datos.fecha_hora for datos in referencias if datos.fecha_hora is not None]
    naturalezas = {datos.naturaleza for datos in referencias if datos.naturaleza != "desconocida"}
    conflictos = []
    if len(sesiones) > 1:
        conflictos.append("sesiones_distintas")
    if len(naturalezas) > 1:
        conflictos.append("naturalezas_distintas")
    if fechas and (max(fechas) - min(fechas)).total_seconds() > 1:
        conflictos.append("tiempos_incompatibles")
    identidades_verificadas = {
        getattr(datos, "estudiante_id", None)
        for datos in referencias
        if getattr(datos, "estado_identidad", "desconocida") == "verificada" and getattr(datos, "estudiante_id", None)
    }
    if any(getattr(datos, "estado_identidad", "desconocida") == "ambigua" for datos in referencias):
        conflictos.append("identidad_ambigua")
    if len(identidades_verificadas) > 1:
        conflictos.append("identidades_contradictorias")
    compartido = (entrada.imagen is not None and entrada.video is not None
                  and entrada.imagen.evento_id is not None and entrada.imagen.evento_id == entrada.video.evento_id
                  and entrada.imagen.sesion_id is not None and entrada.imagen.sesion_id == entrada.video.sesion_id)
    if (compartido and entrada.imagen.fecha_hora is not None and entrada.video.fecha_hora is not None
            and entrada.imagen.fecha_hora != entrada.video.fecha_hora and "tiempos_incompatibles" not in conflictos):
        conflictos.append("tiempos_evento_visual_distintos")
    referencias_completas = (len(referencias) >= 2 and len(fechas) == len(referencias)
                             and all(datos.sesion_id is not None and datos.naturaleza != "desconocida"
                                     for datos in referencias))
    referencias_compatibles = None
    if conflictos or referencias_completas:
        referencias_compatibles = not conflictos
    deduplicado = (compartido and entrada.imagen == entrada.video and entrada.imagen.fecha_hora is not None
                   and entrada.imagen.naturaleza != "desconocida")
    conflicto_identidad = "identidades_contradictorias" in conflictos or "identidad_ambigua" in conflictos
    for nombre, datos in (("imagen", entrada.imagen), ("video", entrada.video), ("audio", entrada.audio)):
        if datos is None:
            fuentes[nombre] = {"estado": "sin_entrada"}
            continue
        try:
            if nombre == "video" and deduplicado:
                resultado = dict(fuentes["imagen"], duplicado_de="imagen")
            else:
                resultado = analizar_audio(datos) if nombre == "audio" else analizar_expresion(datos)
        except Exception as error:
            logger.warning("Análisis experimental fallido (%s): %s", nombre, type(error).__name__)
            resultado = {"estado": "error_inferencia", "motivo": "No fue posible completar el análisis de esta fuente."}
        referencia = datos.model_dump(mode="json", include=set(Referencia.model_fields))
        identidad_ok = (
            not conflicto_identidad
            and getattr(datos, "estado_identidad", "desconocida") == "verificada"
            and bool(getattr(datos, "estudiante_id", None))
        )
        salida_fuente = dict(
            resultado,
            referencia=referencia,
            identidad_verificada=identidad_ok,
            estado_identidad="ambigua" if conflicto_identidad else getattr(datos, "estado_identidad", "desconocida"),
        )
        if identidad_ok:
            salida_fuente["estudiante_id"] = getattr(datos, "estudiante_id")
        fuentes[nombre] = salida_fuente
        if resultado["estado"] in {"estimacion_experimental", "caracteristicas_declaradas"}:
            sincronizables.append((nombre, datos))

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
    if conflictos:
        estado = "referencias_incompatibles"
    try:
        academico = analizar_academico(entrada.academico)
    except Exception as error:
        logger.warning("Análisis académico experimental fallido: %s", type(error).__name__)
        academico = {"estado": "error_inferencia"}

    fuente_visual = (
        fuentes["imagen"] if fuentes["imagen"].get("estado") != "sin_entrada"
        else fuentes["video"] if fuentes["video"].get("estado") != "sin_entrada"
        else None
    )
    interpretacion_visual = construir_interpretacion_visual(
        fuente_visual,
        objeto_det=fuente_visual.get("deteccion_objetos") if isinstance(fuente_visual, dict) else None,
        resultado_audio=fuentes["audio"],
        resultado_academico=academico,
    )
    if isinstance(fuentes.get("imagen"), dict) and fuentes["imagen"].get("estado") != "sin_entrada":
        fuentes["imagen"]["interpretacion_visual"] = interpretacion_visual
    if isinstance(fuentes.get("video"), dict) and fuentes["video"].get("estado") != "sin_entrada":
        fuentes["video"]["interpretacion_visual"] = (
            interpretacion_visual if fuentes["imagen"].get("estado") == "sin_entrada"
            else construir_interpretacion_visual(
                fuentes["video"],
                objeto_det=fuentes["video"].get("deteccion_objetos"),
                resultado_audio=fuentes["audio"],
                resultado_academico=academico,
            )
        )

    return {"schema_version": 1, "fuentes": fuentes, "academico": academico,
            "interpretacion_visual": interpretacion_visual,
            "sincronizacion": {
                "estado": estado, "fuentes_elegibles": [nombre for nombre, _ in sincronizables],
                "evento_visual_compartido": compartido, "fusion_estadistica": "pendiente",
                "conflictos_referencia": conflictos, "referencias_compatibles": referencias_compatibles,
            }}


router = APIRouter(tags=["Análisis experimental de Predicción"])


@router.get("/prediccion/modelos-investigacion")
def estado_modelos(cargar: bool = True):
    if not cargar:
        estados = {tipo: modelos_fase7.inspeccionar_archivo(tipo) for tipo in modelos_fase7.TIPOS}
        estados["facial_historico"] = {"estado": "archivo_presente", "modelo": MODELO_FACIAL} if (
            predictor.RUTA_MODELO_FACIAL.is_file()) else {"estado": "modelo_no_disponible"}
        return estados
    estados = {}
    for tipo in modelos_fase7.TIPOS:
        artefacto = modelos_fase7.obtener_modelo(tipo)
        estados[tipo] = {"estado": "disponible", "modelo": modelos_fase7.metadatos(artefacto)} if artefacto else {
            "estado": "modelo_no_disponible"}
    estados["facial_historico"] = {"estado": "disponible", "modelo": MODELO_FACIAL} if (
        predictor.obtener_modelo_facial() is not None) else {"estado": "modelo_no_disponible"}
    return estados


@router.post("/prediccion/analisis-experimental")
async def analisis_experimental(request: Request):
    inicio = perf_counter()
    entrada = await leer_captura(request, EntradaExperimental)
    validada = perf_counter()
    resultado = await run_in_threadpool(evaluar, entrada)
    evaluada = perf_counter()
    response = JSONResponse(resultado)
    response.headers["Server-Timing"] = (
        f"entrada;dur={(validada - inicio) * 1000:.1f}, "
        f"evaluacion;dur={(evaluada - validada) * 1000:.1f}, "
        f"serializacion;dur={(perf_counter() - evaluada) * 1000:.3f}"
    )
    return response
