"""Composición local de los contratos de Predicción y demostración integral."""
import base64
import ipaddress
import json
import logging
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import Field, StrictBool
from starlette.concurrency import run_in_threadpool

from . import analisis_experimental, fusion_fase10
from .seguimiento import analizar_estudiantes
from .seguimiento_api import RutaDemoLocal
from .seguimiento_contrato import Contrato, EntradaSeguimiento, Texto

VERSION = Annotated[int, Field(strict=True, ge=1, le=1)]
FUENTES = ("imagen", "video", "audio")
FECHA = "2026-11-09T10:00:00-05:00"
EJEMPLOS = Path(__file__).resolve().parents[3] / "ejemplos"
logger = logging.getLogger(__name__)


class EntradaIntegral(Contrato):
    schema_version: VERSION
    sesion_id: Texto | None = None
    analisis: analisis_experimental.EntradaExperimental | None = None
    seguimiento: EntradaSeguimiento | None = None
    solicitar_fusion: StrictBool = False


class OpcionesDemo(Contrato):
    solicitar_fusion: StrictBool = False


class RutaIntegralLocal(RutaDemoLocal):
    def get_route_handler(self):
        manejar = super().get_route_handler()

        async def protegido(request: Request):
            origen = request.headers.get("origin")
            esperado = None
            try:
                host = request.url.hostname or ""
                try:
                    permitido = ipaddress.ip_address(host).is_loopback
                except ValueError:
                    permitido = host == "localhost" or (host == "testserver" and request.client.host == "testclient")
                esperado = f"{request.url.scheme}://{request.url.netloc}"
            except (ValueError, AttributeError):
                permitido = False
            if not permitido or (origen is not None and origen != esperado):
                return JSONResponse({"detail": "Se requiere un origen local autorizado."}, status_code=403,
                                    headers={"Cache-Control": "no-store"})
            return await manejar(request)

        return protegido


def evaluar_modalidades(entrada, sesion):
    excluidas = {}
    for nombre in FUENTES:
        fuente = getattr(entrada, nombre)
        if fuente is None or sesion is None or fuente.sesion_id == sesion:
            continue
        motivo = "sesion_faltante" if fuente.sesion_id is None else "sesion_distinta"
        referencia = fuente.model_dump(mode="json", include=set(analisis_experimental.Referencia.model_fields))
        excluidas[nombre] = {"estado": "fuente_excluida", "motivo": motivo, "referencia": referencia,
                            "identidad_verificada": False}
    resultado = analisis_experimental.evaluar(entrada.model_copy(update=dict.fromkeys(excluidas)))
    resultado["fuentes"].update(excluidas)
    for nombre, salida in resultado["fuentes"].items():
        fuente = getattr(entrada, nombre)
        if fuente is not None:
            salida["procedencia"] = ("declarada_no_verificada" if fuente.origen and fuente.naturaleza != "desconocida"
                                     else "incompleta")
    resultado["fuentes_excluidas"] = list(excluidas)
    if excluidas:
        sincronizacion = resultado["sincronizacion"]
        sincronizacion.update(estado="referencias_incompatibles", referencias_compatibles=False)
        sincronizacion["conflictos_referencia"].extend(sorted({datos["motivo"] for datos in excluidas.values()}))
    return resultado


def orquestar(entrada):
    analisis = entrada.analisis or analisis_experimental.EntradaExperimental(schema_version=1)
    seguimiento = analizar_estudiantes(entrada.seguimiento) if entrada.seguimiento is not None else None
    return {"schema_version": 1, "sesion_id": entrada.sesion_id,
            "analisis": evaluar_modalidades(analisis, entrada.sesion_id), "seguimiento": seguimiento,
            "fusion": fusion_fase10.evaluar_fusion(entrada.solicitar_fusion)}


def seguimiento_demo():
    datos = json.loads((EJEMPLOS / "seguimiento_participacion_sintetico.json").read_text(encoding="utf-8"))
    visual = json.loads((EJEMPLOS / "seguimiento_multimodal_sintetico.json").read_text(encoding="utf-8"))
    datos["fuentes"] = [dict(fuente, sesion_id="clase-demo") for fuente in visual["fuentes"]]
    datos["asociaciones"] = [dict(asociacion, sesion_id="clase-demo", estudiante_id="demo-03")
                             for asociacion in visual["asociaciones"]]
    registros = datos["registros_academicos"]
    asistencias = [r for r in registros if r["tipo"] == "asistencia"]
    registros.extend(dict(r, id=f"a-fixture-{i}", estudiante_id="demo-02", estado="presente")
                     for i, r in enumerate(asistencias, start=1))
    for registro in registros:
        if registro["id"] in {"p1", "p2"}:
            registro["cantidad"] = 0 if registro["id"] == "p1" else 3
    return analizar_estudiantes(EntradaSeguimiento.model_validate(datos))


def medio_demo(cargar):
    try:
        return cargar()
    except Exception as error:
        logger.warning("Muestra pública no utilizable: %s", type(error).__name__)
        return None


def demostracion(opciones):
    seguimiento = seguimiento_demo()
    reglas = {r["estudiante_id"]: r for r in seguimiento["resultados"]}
    foto = medio_demo(fusion_fase10.imagen_demo)
    wav = medio_demo(fusion_fase10.audio_demo)
    medios = {}
    if foto is not None:
        medios["imagen"] = {"imagen_b64": base64.b64encode(foto).decode("ascii"), "modelo_facial": "real",
                            "origen": "NASA / scikit-image", "naturaleza": "real", "evento_id": "foto-publica",
                            "sesion_id": "muestra-visual-publica", "fecha_hora": FECHA}
        medios["video"] = medios["imagen"]  # Prueba de duplicación, no un video de estudiante.
    if wav is not None:
        medios["audio"] = {"wav_b64": base64.b64encode(wav).decode("ascii"), "origen": "RAVDESS",
                            "naturaleza": "real", "evento_id": fusion_fase10.MUESTRA}
    if not medios:
        medios["audio"] = {"duracion_segundos": 1, "origen": "fixture-sintetico", "naturaleza": "sintetica"}
    contradiccion = {"audio": {"duracion_segundos": 1, "origen": "fixture-sintetico",
                              "naturaleza": "sintetica", "sesion_id": "otra-sesion", "fecha_hora": FECHA}}
    entradas = (
        ("A", "demo-02", {"academico": {"G1": 13, "G2": 14, "corte": "despues_g2", "escala": "0-20"}}, None),
        ("B", "demo-01", {"academico": {"G1": 8}}, None),
        ("C", "demo-03", medios, None),
        ("D", "demo-04", contradiccion, "clase-demo"),
    )
    casos = []
    for letra, identificador, datos, sesion in entradas:
        entrada = analisis_experimental.EntradaExperimental.model_validate(dict(datos, schema_version=1))
        analisis = evaluar_modalidades(entrada, sesion)
        if letra == "C":
            for nombre, verificado in (("imagen", foto is not None), ("video", foto is not None), ("audio", wav is not None)):
                if verificado:
                    analisis["fuentes"][nombre]["procedencia"] = "corpus_publico_verificado"
        casos.append({"caso": letra, "estudiante_id_ficticio": identificador,
                      "seguimiento": reglas[identificador], "analisis": analisis})
    return {"schema_version": 1, "simulado": True, "casos": casos,
            "registros_academicos_excluidos": seguimiento["registros_academicos_excluidos"],
            "fuentes_seguimiento": seguimiento["fuentes_recibidas"],
            "muestras_publicas_sin_atribuir": {"imagen": foto is not None, "audio": wav is not None},
            "fusion": fusion_fase10.evaluar_fusion(opciones.solicitar_fusion, demo=True, wav=wav)}


router = APIRouter(tags=["Integración local de Predicción"], route_class=RutaIntegralLocal)


@router.post("/prediccion/orquestar")
async def orquestar_api(entrada: EntradaIntegral):
    try:
        return await run_in_threadpool(orquestar, entrada)
    except ValueError:
        raise HTTPException(422, "El seguimiento contiene referencias o datos incompatibles.") from None


@router.post("/prediccion/demostracion-integral")
async def demostracion_api(opciones: OpcionesDemo):
    return await run_in_threadpool(demostracion, opciones)
