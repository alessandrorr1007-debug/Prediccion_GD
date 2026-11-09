"""Composición local de los contratos de Predicción y demostración integral."""
import base64
import ipaddress
import json
import logging
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import AwareDatetime, Field, StrictBool, ValidationError, model_validator
from starlette.concurrency import run_in_threadpool

from . import analisis_experimental, fusion_fase10
from .seguimiento import analizar_estudiantes
from .seguimiento_api import RutaDemoLocal
from .seguimiento_contrato import Contrato, EntradaSeguimiento, Texto
from .validacion_contratos import errores_pydantic, validar_analisis

VERSION = Annotated[int, Field(strict=True, ge=1, le=1)]
FUENTES = ("imagen", "video", "audio")
FECHA = "2026-11-09T10:00:00-05:00"
EJEMPLOS = Path(__file__).resolve().parents[3] / "ejemplos"
logger = logging.getLogger(__name__)


class VentanaCaptura(Contrato):
    inicio: AwareDatetime
    fin: AwareDatetime

    @model_validator(mode="after")
    def orden_valido(self):
        if self.inicio > self.fin:
            raise ValueError("La ventana de captura está invertida")
        return self


class EntradaIntegral(Contrato):
    schema_version: VERSION
    sesion_id: Texto | None = None
    ventana_captura: VentanaCaptura | None = None
    # La validación por bloque permite preservar las demás fuentes ante un fallo local.
    analisis: Any = None
    seguimiento: Any = None
    solicitar_fusion: StrictBool = False


class OpcionesDemo(Contrato):
    solicitar_fusion: StrictBool = False
    caso: Literal["todos", "A", "B", "C", "D"] = "todos"


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


def evaluar_modalidades(entrada, sesion, ventana=None):
    excluidas = {}
    for nombre in FUENTES:
        fuente = getattr(entrada, nombre)
        if fuente is None:
            continue
        if sesion is not None and fuente.sesion_id != sesion:
            motivo = "sesion_faltante" if fuente.sesion_id is None else "sesion_distinta"
        elif ventana is not None and fuente.fecha_hora is None:
            motivo = "fecha_faltante"
        elif ventana is not None and not ventana.inicio <= fuente.fecha_hora <= ventana.fin:
            motivo = "captura_fuera_de_ventana"
        else:
            continue
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
    datos = entrada.analisis if entrada.analisis is not None else {"schema_version": 1}
    analisis, errores = validar_analisis(datos)
    resultado = evaluar_modalidades(analisis, entrada.sesion_id, entrada.ventana_captura)
    for nombre in FUENTES:
        if nombre in errores:
            resultado["fuentes"][nombre] = {"estado": "entrada_invalida", "identidad_verificada": False,
                                             "errores": errores[nombre]}
    if "academico" in errores:
        resultado["academico"] = {"estado": "entrada_invalida", "errores": errores["academico"]}
    for nombre, salida in {**resultado["fuentes"], "academico": resultado["academico"]}.items():
        if salida["estado"] in {"audio_invalido", "imagen_invalida", "error_inferencia"}:
            errores[nombre] = [{"campo": f"analisis.{nombre}", "codigo": salida["estado"]}]
    seguimiento, errores_fuente = None, []
    if entrada.seguimiento is not None:
        try:
            seguimiento = analizar_estudiantes(EntradaSeguimiento.model_validate(entrada.seguimiento),
                                              errores_fuente=errores_fuente)
        except ValidationError as error:
            errores["seguimiento"] = errores_pydantic(error, "seguimiento")
        except ValueError:
            errores["seguimiento"] = [{"campo": "seguimiento", "codigo": "referencias_incompatibles"}]
        except Exception as error:
            logger.warning("Seguimiento integral fallido: %s", type(error).__name__)
            errores["seguimiento"] = [{"campo": "seguimiento", "codigo": "error_ejecucion"}]
    return {"schema_version": 1, "sesion_id": entrada.sesion_id,
            "estado": "parcial" if errores or errores_fuente or resultado["fuentes_excluidas"] else "procesado",
            "errores": errores, "fuentes_seguimiento_excluidas": errores_fuente,
            "analisis": resultado, "seguimiento": seguimiento,
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
    mostrar_medios = opciones.caso in {"todos", "C"}
    foto = medio_demo(fusion_fase10.imagen_demo) if mostrar_medios else None
    wav = medio_demo(fusion_fase10.audio_demo) if mostrar_medios or opciones.solicitar_fusion else None
    medios = {}
    if foto is not None:
        medios["imagen"] = {"imagen_b64": base64.b64encode(foto).decode("ascii"), "modelo_facial": "real",
                            "origen": "NASA / scikit-image", "naturaleza": "real", "evento_id": "foto-publica",
                            "sesion_id": "muestra-visual-publica", "fecha_hora": FECHA}
        medios["video"] = medios["imagen"]  # Prueba de duplicación, no un video de estudiante.
    if mostrar_medios and wav is not None:
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
        if opciones.caso not in {"todos", letra}:
            continue
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
            "muestras_publicas_sin_atribuir": {"imagen": foto is not None, "audio": mostrar_medios and wav is not None},
            "fusion": fusion_fase10.evaluar_fusion(opciones.solicitar_fusion, demo=True, wav=wav)}


router = APIRouter(tags=["Integración local de Predicción"], route_class=RutaIntegralLocal)


@router.post("/prediccion/orquestar")
async def orquestar_api(entrada: EntradaIntegral):
    return await run_in_threadpool(orquestar, entrada)


@router.post("/prediccion/demostracion-integral")
async def demostracion_api(opciones: OpcionesDemo):
    return await run_in_threadpool(demostracion, opciones)
