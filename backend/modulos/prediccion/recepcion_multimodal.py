"""Orquestación multimodal versionada y canal HTTP de recepción automática."""
from collections import deque
from datetime import datetime, timezone
from hashlib import sha256
import ipaddress
import json
import logging
import threading
from typing import Annotated, Any, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from pydantic import AwareDatetime, Field, StrictBool, ValidationError
from starlette.concurrency import run_in_threadpool

from backend.modulos.imagen.adapter import adaptar_imagen
from backend.modulos.video.adapter import adaptar_video
from . import analisis_experimental, fusion_fase10, modelos_fase7, orquestacion_fase10
from .captura_entrada import MAX_JSON_CAPTURA
from .detector_objetos import LIMITACIONES_OBJETOS, metadata_detector, normalizar_detecciones_externas
from .interpretacion_visual import construir_interpretacion_visual
from .seguimiento import analizar_estudiantes
from .seguimiento_contrato import Contrato, EntradaSeguimiento, Texto, Unidad
from .validacion_contratos import errores_pydantic, validar_analisis

SCHEMA_VERSION_ACTUAL = 1
MAX_HISTORIAL_EVENTOS = 256
logger = logging.getLogger(__name__)


class EventoModulo(Contrato):
    evento_id: Texto
    modulo: Literal["imagen", "video", "audio", "academico"]
    estudiante_id: Texto | None = None
    estado_identidad: Literal["desconocida", "verificada", "ambigua"] = "desconocida"
    sesion_id: Texto | None = None
    fecha_hora: AwareDatetime | None = None
    tipo_observacion: Literal[
        "facial",
        "objeto",
        "vocal",
        "asistencia",
        "transcripcion",
        "academico",
        "frame",
        "alerta",
        "desconocida",
    ] = "desconocida"
    datos_observados: dict[str, Any] = Field(default_factory=dict)
    resultados_modelo: dict[str, Any] | None = None
    confianza: Unidad | None = None
    calidad: Unidad | None = None
    version_modelo: Texto | None = None
    trazabilidad: dict[str, Any] | None = None


class EntradaRecepcion(Contrato):
    schema_version: Annotated[int, Field(strict=True, ge=1, le=1)]
    sesion_id: Texto | None = None
    ventana_captura: orquestacion_fase10.VentanaCaptura | None = None
    solicitar_fusion: StrictBool = False
    publicar_en_panel: StrictBool = True
    analisis: Any = None
    imagen: Any = None
    video: Any = None
    audio: Any = None
    academico: Any = None
    imagen_exportacion: Any = None
    video_exportacion: Any = None
    eventos: list[Any] | None = Field(default=None, max_length=200)
    seguimiento: Any = None


class _EstadoRecepcion:
    def __init__(self):
        self._lock = threading.Lock()
        self.actualizacion_id = 0
        self.ultimo_resultado: dict[str, Any] | None = None
        self.fuentes_activas: list[str] = []
        self.total_recepciones = 0
        self.total_duplicados = 0
        self.total_errores = 0
        self.ultima_actualizacion_utc: str | None = None
        self.ultimo_estado: str = "en_espera"
        self._eventos_vistos: deque[tuple[str, str]] = deque(maxlen=MAX_HISTORIAL_EVENTOS)
        self._huellas_eventos: dict[str, str] = {}

    def registrar_eventos(self, huella_por_id: list[tuple[str, str]]) -> tuple[list[str], list[str]]:
        duplicados = []
        contradictorios = []
        with self._lock:
            for ev_id, huella in huella_por_id:
                previa = self._huellas_eventos.get(ev_id)
                if previa is None:
                    if len(self._eventos_vistos) == MAX_HISTORIAL_EVENTOS:
                        viejo_id, _ = self._eventos_vistos.popleft()
                        self._huellas_eventos.pop(viejo_id, None)
                    self._eventos_vistos.append((ev_id, huella))
                    self._huellas_eventos[ev_id] = huella
                elif previa == huella:
                    duplicados.append(ev_id)
                else:
                    contradictorios.append(ev_id)
        return duplicados, contradictorios

    def publicar(self, resultado: dict[str, Any], *, publicar: bool, fuentes_activas: list[str], n_dup: int, n_err: int) -> int:
        with self._lock:
            self.total_recepciones += 1
            self.total_duplicados += n_dup
            self.total_errores += n_err
            self.ultima_actualizacion_utc = datetime.now(timezone.utc).isoformat()
            self.ultimo_estado = resultado.get("estado", "procesado")
            if publicar:
                self.actualizacion_id += 1
                self.ultimo_resultado = resultado
                self.fuentes_activas = list(fuentes_activas)
            return self.actualizacion_id

    def obtener_ultima(self) -> dict[str, Any]:
        with self._lock:
            return {
                "schema_version": SCHEMA_VERSION_ACTUAL,
                "actualizacion_id": self.actualizacion_id,
                "disponible": self.ultimo_resultado is not None,
                "fuentes_activas": list(self.fuentes_activas),
                "ultima_actualizacion_utc": self.ultima_actualizacion_utc,
                "resultado": self.ultimo_resultado,
            }

    def reiniciar(self) -> dict[str, Any]:
        with self._lock:
            self.actualizacion_id += 1
            self.ultimo_resultado = None
            self.fuentes_activas = []
            self.ultimo_estado = "reiniciado"
            self._eventos_vistos.clear()
            self._huellas_eventos.clear()
            return {"schema_version": SCHEMA_VERSION_ACTUAL, "actualizacion_id": self.actualizacion_id, "estado": "reiniciado"}

    def diagnostico(self) -> dict[str, Any]:
        with self._lock:
            return {
                "actualizacion_id": self.actualizacion_id,
                "panel_con_resultados": self.ultimo_resultado is not None,
                "fuentes_activas": list(self.fuentes_activas),
                "total_recepciones": self.total_recepciones,
                "duplicados_omitidos_acumulados": self.total_duplicados,
                "errores_acumulados": self.total_errores,
                "ultima_actualizacion_utc": self.ultima_actualizacion_utc,
                "ultimo_estado": self.ultimo_estado,
            }


ESTADO_CANAL = _EstadoRecepcion()


def _huella_evento(ev: EventoModulo) -> str:
    crudo = json.dumps(ev.model_dump(mode="json", exclude={"trazabilidad"}), sort_keys=True, ensure_ascii=True)
    return sha256(crudo.encode("utf-8")).hexdigest()[:24]


def _extraer_detecciones_evento(ev: EventoModulo) -> list[dict[str, Any]]:
    candidatos = []
    for contenedor in (ev.datos_observados, ev.resultados_modelo or {}):
        if not isinstance(contenedor, dict):
            continue
        for clave in ("objetos", "detecciones"):
            lista = contenedor.get(clave)
            if isinstance(lista, list):
                for item in lista:
                    if isinstance(item, dict):
                        item_copia = dict(item)
                        item_copia.setdefault("origen", f"modulo_{ev.modulo}")
                        if item_copia.get("confianza") is None and ev.confianza is not None:
                            item_copia["confianza"] = ev.confianza
                        candidatos.append(item_copia)
        if contenedor.get("clase") and contenedor.get("confianza") is not None:
            item_copia = dict(contenedor)
            item_copia.setdefault("origen", f"modulo_{ev.modulo}")
            candidatos.append(item_copia)
    return normalizar_detecciones_externas(candidatos)


def _construir_bloque_solo_detecciones(detecciones: list[dict[str, Any]], origen: str) -> dict[str, Any]:
    objetos_no_persona = [d for d in detecciones if d["clase"] != "persona"]
    conteo_personas = sum(1 for d in detecciones if d["clase"] == "persona")
    senales_encuadre = []
    if conteo_personas > 1:
        senales_encuadre.append({
            "codigo": "multiples_personas",
            "descripcion": f"El módulo externo reportó {conteo_personas} personas en el encuadre.",
            "origen": origen,
        })
    obj_det = {
        "estado": "solo_externas",
        "origen": origen,
        "modelo": metadata_detector(),
        "latencia_ms": 0.0,
        "objetos": detecciones,
        "objetos_no_persona": objetos_no_persona,
        "conteo_personas": conteo_personas or None,
        "senales_encuadre": senales_encuadre,
        "adaptador_externo_listo": True,
        "limitaciones": list(LIMITACIONES_OBJETOS),
    }
    return {
        "estado": "evidencia_insuficiente",
        "deteccion_facial": "sin_recorte_facial",
        "rostros_detectados": None,
        "detector_facial": "no_ejecutado_solo_detecciones",
        "deteccion_objetos": obj_det,
        "motivo": "Se recibieron detecciones externas de objetos sin imagen facial para clasificar expresión.",
    }


def _evaluar_fusion_honesta(solicitar_fusion: bool, analisis: dict[str, Any]) -> dict[str, Any]:
    base = fusion_fase10.evaluar_fusion(solicitar_fusion)
    fuentes = analisis.get("fuentes") or {}
    acad = analisis.get("academico") or {}
    activas = [k for k, v in fuentes.items() if isinstance(v, dict) and v.get("estado") != "sin_entrada"]
    if isinstance(acad, dict) and acad.get("estado") != "sin_entrada":
        activas.append("academico")
    if base.get("ejecutada"):
        return dict(base, metodo="fusion_fase10")
    explicacion = (
        "No existe un modelo multimodal conjunto calibrado entre estas fuentes heterogéneas; "
        "cada modalidad reporta su evidencia e incertidumbre por separado sin promediar probabilidades."
    )
    motivo = base.get("motivo", "no_solicitada")
    if len(activas) >= 2 and not solicitar_fusion:
        motivo = "evaluacion_independiente_sin_fusion"
    return dict(base, metodo="sin_modelo_conjunto_validado", motivo=motivo, explicacion=explicacion, fuentes_evaluadas=activas)


def _combinar_analisis_directo(entrada: EntradaRecepcion) -> tuple[dict[str, Any], dict[str, list[dict[str, str]]]]:
    if isinstance(entrada.analisis, dict):
        return dict(entrada.analisis), {}
    bloque = {"schema_version": 1}
    for campo in ("imagen", "video", "audio", "academico"):
        valor = getattr(entrada, campo)
        if valor is not None:
            bloque[campo] = valor
    return bloque, {}


def _procesar_eventos_externos(
    entrada: EntradaRecepcion,
    analisis_crudo: dict[str, Any],
    errores: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    if not entrada.eventos:
        return {"recibidos": 0, "validos": 0, "duplicados_omitidos": 0, "contradictorios": [], "reordenados": False, "excluidos": []}

    validados: list[tuple[int, EventoModulo]] = []
    for idx, crudo in enumerate(entrada.eventos):
        try:
            validados.append((idx, EventoModulo.model_validate(crudo)))
        except ValidationError as err:
            errores.setdefault("eventos", []).extend(errores_pydantic(err, f"eventos[{idx}]"))

    huellas = [(ev.evento_id, _huella_evento(ev)) for _, ev in validados]
    vistas_lote: dict[str, str] = {}
    dup_lote: set[str] = set()
    contr_lote: set[str] = set()
    filtrados_lote: list[tuple[int, EventoModulo]] = []
    for (idx, ev), (_, huella) in zip(validados, huellas):
        previa = vistas_lote.get(ev.evento_id)
        if previa is None:
            vistas_lote[ev.evento_id] = huella
            filtrados_lote.append((idx, ev))
        elif previa == huella:
            dup_lote.add(ev.evento_id)
        else:
            contr_lote.add(ev.evento_id)

    excluidos = []
    elegibles: list[EventoModulo] = []
    for _, ev in filtrados_lote:
        if ev.evento_id in contr_lote:
            continue
        if entrada.sesion_id is not None and ev.sesion_id is not None and ev.sesion_id != entrada.sesion_id:
            excluidos.append({"evento_id": ev.evento_id, "modulo": ev.modulo, "motivo": "sesion_distinta"})
            continue
        if entrada.ventana_captura is not None:
            if ev.fecha_hora is None:
                excluidos.append({"evento_id": ev.evento_id, "modulo": ev.modulo, "motivo": "fecha_faltante"})
                continue
            if not (entrada.ventana_captura.inicio <= ev.fecha_hora <= entrada.ventana_captura.fin):
                excluidos.append({"evento_id": ev.evento_id, "modulo": ev.modulo, "motivo": "captura_fuera_de_ventana"})
                continue
        elegibles.append(ev)

    dup_hist, contr_hist = ESTADO_CANAL.registrar_eventos(
        [(ev.evento_id, vistas_lote[ev.evento_id]) for ev in elegibles]
    )
    duplicados = sorted(dup_lote | set(dup_hist))
    contradictorios = sorted(contr_lote | set(contr_hist))
    omitidos = set(dup_hist) | set(contr_hist)
    elegibles = [ev for ev in elegibles if ev.evento_id not in omitidos]
    fechas_orig = [ev.fecha_hora for ev in elegibles if ev.fecha_hora is not None]
    reordenados = fechas_orig != sorted(fechas_orig)
    elegibles.sort(key=lambda ev: ev.fecha_hora or datetime.max.replace(tzinfo=timezone.utc))

    detecciones_extra: dict[str, list[dict[str, Any]]] = {"imagen": [], "video": []}
    audio_incompatible: EventoModulo | None = None

    for ev in elegibles:
        datos = dict(ev.datos_observados)
        if ev.modulo in {"imagen", "video"}:
            dets = _extraer_detecciones_evento(ev)
            detecciones_extra[ev.modulo].extend(dets)
            if isinstance(datos.get("imagen_b64"), str) and datos["imagen_b64"].strip():
                analisis_crudo[ev.modulo] = {
                    "imagen_b64": datos["imagen_b64"],
                    "modelo_facial": datos.get("modelo_facial", "real"),
                    "detectar_objetos": bool(datos.get("detectar_objetos", False)),
                    "evento_id": ev.evento_id,
                    "sesion_id": ev.sesion_id or entrada.sesion_id,
                    "fecha_hora": ev.fecha_hora.isoformat() if ev.fecha_hora else None,
                    "calidad": ev.calidad if ev.calidad is not None else datos.get("calidad"),
                    "origen": f"modulo_{ev.modulo}",
                    "naturaleza": datos.get("naturaleza", "real"),
                    "estudiante_id": ev.estudiante_id,
                    "estado_identidad": ev.estado_identidad,
                }
        elif ev.modulo == "audio":
            if ev.tipo_observacion not in {"vocal", "desconocida"}:
                audio_incompatible = ev
                continue
            payload_audio = {
                "evento_id": ev.evento_id,
                "sesion_id": ev.sesion_id or entrada.sesion_id,
                "fecha_hora": ev.fecha_hora.isoformat() if ev.fecha_hora else None,
                "calidad": ev.calidad if ev.calidad is not None else datos.get("calidad"),
                "origen": "modulo_audio",
                "naturaleza": datos.get("naturaleza", "real"),
                "tipo_observacion": ev.tipo_observacion,
                "estudiante_id": ev.estudiante_id,
                "estado_identidad": ev.estado_identidad,
            }
            for k in ("duracion_segundos", "wav_b64", "rms_normalizado", "f0_hz", "variabilidad_f0_hz", "pausas_segundos", "ritmo_segmentos_minuto"):
                if k in datos and datos[k] is not None:
                    payload_audio[k] = datos[k]
            analisis_crudo["audio"] = payload_audio
        elif ev.modulo == "academico":
            payload_acad = {k: datos[k] for k in ("G1", "G2", "corte", "escala") if k in datos}
            if payload_acad:
                analisis_crudo["academico"] = payload_acad

    for mod in ("imagen", "video"):
        if mod in analisis_crudo and isinstance(analisis_crudo[mod], dict) and detecciones_extra[mod]:
            previas = analisis_crudo[mod].get("detecciones_objetos")
            if previas is None or isinstance(previas, list):
                analisis_crudo[mod]["detecciones_objetos"] = [*(previas or []), *detecciones_extra[mod]]

    return {
        "recibidos": len(entrada.eventos),
        "validos": len(validados),
        "elegibles": len(elegibles),
        "duplicados_omitidos": len(duplicados),
        "duplicados_ids": duplicados,
        "contradictorios": contradictorios,
        "reordenados": reordenados,
        "excluidos": excluidos,
        "detecciones_extra": detecciones_extra,
        "audio_incompatible": audio_incompatible,
        "identidades_verificadas": sorted({ev.estudiante_id for ev in elegibles if ev.estado_identidad == "verificada" and ev.estudiante_id}),
        "identidad_ambigua": any(ev.estado_identidad == "ambigua" for ev in elegibles),
    }


def _integrar_exportaciones(entrada: EntradaRecepcion, errores: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    extra: dict[str, list[dict[str, Any]]] = {"imagen": [], "video": []}
    if entrada.imagen_exportacion is not None:
        try:
            eventos = adaptar_imagen(entrada.imagen_exportacion, exigir_origen_temporal=entrada.video_exportacion is not None)
            extra["imagen"].extend(
                {"clase": e["senal"], "confianza": e["confianza"], "origen": f"adaptador_imagen ({e.get('modelo', 'imagen')})"}
                for e in eventos
            )
        except (ValueError, TypeError, OverflowError) as error:
            errores["imagen_exportacion"] = [{"campo": "imagen_exportacion", "codigo": "adaptador_invalido", "detalle": str(error)}]
    if entrada.video_exportacion is not None:
        try:
            eventos = adaptar_video(entrada.video_exportacion)
            extra["video"].extend(
                {"clase": e["senal"], "confianza": e["confianza"], "origen": f"adaptador_video ({e.get('modelo', 'video')})"}
                for e in eventos if e["senal"] != "multiples_personas"
            )
        except (ValueError, TypeError, OverflowError) as error:
            errores["video_exportacion"] = [{"campo": "video_exportacion", "codigo": "adaptador_invalido", "detalle": str(error)}]
    return extra


def procesar_recepcion(entrada: EntradaRecepcion) -> dict[str, Any]:
    analisis_crudo, _ = _combinar_analisis_directo(entrada)
    errores: dict[str, Any] = {}

    info_eventos = _procesar_eventos_externos(entrada, analisis_crudo, errores)
    info_export = _integrar_exportaciones(entrada, errores)

    analisis_validado, err_analisis = validar_analisis(analisis_crudo)
    errores.update(err_analisis)
    resultado_analisis = orquestacion_fase10.evaluar_modalidades(analisis_validado, entrada.sesion_id, entrada.ventana_captura)

    for nombre in orquestacion_fase10.FUENTES:
        if nombre in errores:
            resultado_analisis["fuentes"][nombre] = {
                "estado": "entrada_invalida",
                "identidad_verificada": False,
                "errores": errores[nombre],
            }
    if "academico" in errores:
        resultado_analisis["academico"] = {"estado": "entrada_invalida", "errores": errores["academico"]}

    # Incorporar audio rechazado explícitamente por ser asistencia/transcripción.
    aud_incomp = info_eventos.get("audio_incompatible")
    if aud_incomp is not None and resultado_analisis["fuentes"]["audio"].get("estado") == "sin_entrada":
        resultado_analisis["fuentes"]["audio"] = {
            "estado": "tipo_incompatible_no_vocal",
            "tipo_observacion": aud_incomp.tipo_observacion,
            "motivo": f"El evento «{aud_incomp.tipo_observacion}» no es señal vocal; excluido del modelo RAVDESS.",
            "identidad_verificada": False,
        }

    # Incorporar detecciones externas de IMAGEN / VIDEO cuando llegaron sin píxeles base64.
    for mod in ("imagen", "video"):
        combinadas = info_eventos.get("detecciones_extra", {}).get(mod, []) + info_export.get(mod, [])
        if combinadas and resultado_analisis["fuentes"][mod].get("estado") == "sin_entrada":
            dets_norm = normalizar_detecciones_externas(combinadas)
            if dets_norm:
                bloque = _construir_bloque_solo_detecciones(dets_norm, f"modulo_{mod}")
                bloque["identidad_verificada"] = False
                resultado_analisis["fuentes"][mod] = bloque

    # Detección de conflicto global de identidad en eventos.
    ids_ev = info_eventos.get("identidades_verificadas", [])
    conflicto_id_ev = bool(info_eventos.get("identidad_ambigua")) or len(ids_ev) > 1
    if conflicto_id_ev:
        resultado_analisis["sincronizacion"]["estado"] = "referencias_incompatibles"
        resultado_analisis["sincronizacion"]["referencias_compatibles"] = False
        if "identidades_contradictorias" not in resultado_analisis["sincronizacion"]["conflictos_referencia"]:
            resultado_analisis["sincronizacion"]["conflictos_referencia"].append("identidades_contradictorias")
        for mod in orquestacion_fase10.FUENTES:
            if isinstance(resultado_analisis["fuentes"][mod], dict):
                resultado_analisis["fuentes"][mod]["identidad_verificada"] = False
                resultado_analisis["fuentes"][mod]["estado_identidad"] = "ambigua"

    if info_eventos.get("contradictorios"):
        resultado_analisis["sincronizacion"]["estado"] = "referencias_incompatibles"
        resultado_analisis["sincronizacion"]["conflictos_referencia"].append("eventos_contradictorios")

    # Reconstruir interpretación visual unificada final.
    fuente_visual = (
        resultado_analisis["fuentes"]["imagen"]
        if resultado_analisis["fuentes"]["imagen"].get("estado") not in {None, "sin_entrada", "entrada_invalida"}
        else resultado_analisis["fuentes"]["video"]
        if resultado_analisis["fuentes"]["video"].get("estado") not in {None, "sin_entrada", "entrada_invalida"}
        else None
    )
    resultado_analisis["interpretacion_visual"] = construir_interpretacion_visual(
        fuente_visual,
        objeto_det=fuente_visual.get("deteccion_objetos") if isinstance(fuente_visual, dict) else None,
        resultado_audio=resultado_analisis["fuentes"]["audio"],
        resultado_academico=resultado_analisis["academico"],
    )

    for nombre, salida in {**resultado_analisis["fuentes"], "academico": resultado_analisis["academico"]}.items():
        if isinstance(salida, dict) and salida.get("estado") in {"audio_invalido", "imagen_invalida", "error_inferencia", "tipo_incompatible_no_vocal"}:
            errores[nombre] = [{"campo": f"analisis.{nombre}", "codigo": salida["estado"]}]

    seguimiento, errores_fuente = None, []
    if entrada.seguimiento is not None:
        try:
            seguimiento = analizar_estudiantes(
                EntradaSeguimiento.model_validate(entrada.seguimiento),
                errores_fuente=errores_fuente,
            )
        except ValidationError as error:
            errores["seguimiento"] = errores_pydantic(error, "seguimiento")
        except ValueError:
            errores["seguimiento"] = [{"campo": "seguimiento", "codigo": "referencias_incompatibles"}]
        except Exception as error:
            logger.warning("Seguimiento en recepción fallido: %s", type(error).__name__)
            errores["seguimiento"] = [{"campo": "seguimiento", "codigo": "error_ejecucion"}]

    fuentes_activas = [
        k for k in ("imagen", "video", "audio")
        if resultado_analisis["fuentes"][k].get("estado") not in {None, "sin_entrada"}
    ]
    if resultado_analisis["academico"].get("estado") not in {None, "sin_entrada"}:
        fuentes_activas.append("academico")

    parcial = bool(errores or errores_fuente or resultado_analisis["fuentes_excluidas"] or info_eventos.get("excluidos") or info_eventos.get("contradictorios"))
    salida_final = {
        "schema_version": SCHEMA_VERSION_ACTUAL,
        "sesion_id": entrada.sesion_id,
        "estado": "parcial" if parcial else "procesado",
        "errores": errores,
        "fuentes_seguimiento_excluidas": errores_fuente,
        "trazabilidad_eventos": {
            "recibidos": info_eventos.get("recibidos", 0),
            "elegibles": info_eventos.get("elegibles", 0),
            "duplicados_omitidos": info_eventos.get("duplicados_omitidos", 0),
            "duplicados_ids": info_eventos.get("duplicados_ids", []),
            "contradictorios": info_eventos.get("contradictorios", []),
            "reordenados_cronologicamente": info_eventos.get("reordenados", False),
            "excluidos": info_eventos.get("excluidos", []),
        },
        "analisis": resultado_analisis,
        "seguimiento": seguimiento,
        "fusion": _evaluar_fusion_honesta(entrada.solicitar_fusion, resultado_analisis),
    }

    solo_reintentos = (
        info_eventos["duplicados_omitidos"] > 0
        and not info_eventos.get("elegibles")
        and not info_eventos.get("excluidos")
        and not info_eventos["contradictorios"]
        and not errores
        and entrada.seguimiento is None
        and entrada.imagen_exportacion is None
        and entrada.video_exportacion is None
        and set(analisis_crudo) == {"schema_version"}
    )
    actualizacion_id = ESTADO_CANAL.publicar(
        salida_final,
        publicar=entrada.publicar_en_panel and not solo_reintentos,
        fuentes_activas=fuentes_activas,
        n_dup=info_eventos.get("duplicados_omitidos", 0),
        n_err=len(errores),
    )
    salida_final["actualizacion_id"] = actualizacion_id
    return salida_final


class RutaRecepcionLocal(APIRoute):
    def get_route_handler(self):
        manejar = super().get_route_handler()

        async def protegido(request: Request):
            client_host = request.client.host if request.client else ""
            try:
                local_client = ipaddress.ip_address(client_host).is_loopback
            except ValueError:
                local_client = client_host == "testclient"
            url_host = request.url.hostname or ""
            try:
                local_host = ipaddress.ip_address(url_host).is_loopback
            except ValueError:
                local_host = url_host == "localhost" or (url_host == "testserver" and client_host == "testclient")
            origen = request.headers.get("origin")
            esperado = f"{request.url.scheme}://{request.url.netloc}" if request.url.netloc else None
            if (
                not local_client
                or not local_host
                or any(h in request.headers for h in ("forwarded", "x-forwarded-for", "x-real-ip"))
                or (origen is not None and origen != esperado)
            ):
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Recepción automática disponible solo en red local autorizada."},
                    headers={"Cache-Control": "no-store"},
                )

            cuerpo = bytearray()
            async for bloque in request.stream():
                if len(cuerpo) + len(bloque) > MAX_JSON_CAPTURA:
                    return JSONResponse(
                        status_code=413,
                        content={"detail": "El JSON supera 8 MiB"},
                        headers={"Cache-Control": "no-store"},
                    )
                cuerpo.extend(bloque)
            request._body = bytes(cuerpo)
            try:
                respuesta = await manejar(request)
            except RequestValidationError as error:
                detalle = [{"campo": ".".join(map(str, e["loc"])), "mensaje": e["msg"]} for e in error.errors()]
                respuesta = JSONResponse(status_code=422, content={"detail": detalle})
            except HTTPException as error:
                respuesta = JSONResponse(status_code=error.status_code, content={"detail": error.detail})
            respuesta.headers["Cache-Control"] = "no-store"
            return respuesta

        return protegido


router = APIRouter(tags=["Recepción automática multimodal"], route_class=RutaRecepcionLocal)


@router.post("/prediccion/recepcion")
async def recepcion_multimodal(entrada: EntradaRecepcion):
    resultado = await run_in_threadpool(procesar_recepcion, entrada)
    return JSONResponse(resultado, headers={"Cache-Control": "no-store"})


@router.get("/prediccion/recepcion/ultima")
def recepcion_ultima(desde: int = Query(default=0, ge=0)):
    snapshot = ESTADO_CANAL.obtener_ultima()
    if desde and snapshot["actualizacion_id"] <= desde:
        return JSONResponse(
            {
                "schema_version": SCHEMA_VERSION_ACTUAL,
                "actualizacion_id": snapshot["actualizacion_id"],
                "disponible": snapshot["disponible"],
                "sin_cambios": True,
            },
            headers={"Cache-Control": "no-store"},
        )
    return JSONResponse(snapshot, headers={"Cache-Control": "no-store"})


@router.post("/prediccion/recepcion/reiniciar")
def recepcion_reiniciar():
    return JSONResponse(ESTADO_CANAL.reiniciar(), headers={"Cache-Control": "no-store"})


@router.get("/prediccion/diagnostico")
def prediccion_diagnostico():
    modelos = {}
    for tipo in modelos_fase7.TIPOS:
        modelos[tipo] = modelos_fase7.inspeccionar_archivo(tipo)
    modelos["objetos_yolo"] = metadata_detector()
    return JSONResponse(
        {
            "schema_version": SCHEMA_VERSION_ACTUAL,
            "modulo": "PREDICCION",
            "canal_recepcion": ESTADO_CANAL.diagnostico(),
            "modelos": modelos,
            "garantias": {
                "identidad_por_defecto": "desconocida",
                "prohibe_diagnostico_psicologico_o_familiar": True,
                "prohibe_fusion_no_calibrada": True,
                "resiste_fallo_parcial": True,
            },
        },
        headers={"Cache-Control": "no-store"},
    )
