"""Diagnóstico local de contratos usando los validadores y adaptadores de ejecución."""
import argparse
import base64
from collections import Counter
import json
from pathlib import Path

from pydantic import ValidationError

from backend.modulos.imagen.adapter import adaptar_imagen
from backend.modulos.video.adapter import adaptar_video
from .analisis_experimental import AudioExperimental, EntradaAcademica, EntradaExperimental, ImagenExperimental

LIMITE_JSON = 2 * 1024**2
MODELOS = {"imagen": ImagenExperimental, "video": ImagenExperimental, "audio": AudioExperimental,
           "academico": EntradaAcademica}
FORMATO_VISUAL = {
    "imagen": {"frames", "frame_id", "timestamp", "segundo", "objetos", "origen_temporal", "sesion_id",
               "modelo", "origen", "schema_version", "naturaleza", "simulado", "calidad_normalizada"},
    "video": {"frames", "frame_id", "timestamp", "segundo", "detecciones", "evento_id", "modulo", "modelos",
              "sesion_id", "modelo", "origen", "schema_version", "naturaleza", "simulado", "calidad"},
}


def errores_pydantic(error, prefijo):
    salida = []
    for detalle in error.errors(include_input=False, include_context=False, include_url=False):
        campo = ".".join(map(str, detalle["loc"]))
        if detalle["type"] == "extra_forbidden":
            campo = "campo_adicional"
        salida.append({"campo": f"{prefijo}.{campo}" if campo else prefijo, "codigo": detalle["type"]})
    return salida


def version_valida(valor):
    return type(valor) is int and valor == 1


def validar_analisis(datos):
    """Devuelve una entrada ejecutable y diagnósticos por componente."""
    vacia = EntradaExperimental(schema_version=1)
    if not isinstance(datos, dict):
        return vacia, {"analisis": [{"campo": "analisis", "codigo": "objeto_requerido"}]}
    if not version_valida(datos.get("schema_version")):
        return vacia, {"analisis": [{"campo": "analisis.schema_version", "codigo": "version_incompatible"}]}
    errores = {}
    if datos.keys() - (MODELOS.keys() | {"schema_version"}):
        errores["analisis"] = [{"campo": "analisis", "codigo": "campos_adicionales"}]
    validos = {}
    for nombre, modelo in MODELOS.items():
        if datos.get(nombre) is None:
            continue
        try:
            validos[nombre] = modelo.model_validate(datos[nombre])
        except ValidationError as error:
            errores[nombre] = errores_pydantic(error, f"analisis.{nombre}")
    return vacia.model_copy(update=validos), errores


def diagnosticar(modulo, datos, sesion=None):
    informe = {"modulo": modulo.upper(), "compatible": False, "formato_recibido": type(datos).__name__,
               "campos_compatibles": [], "campos_faltantes": [], "campos_adicionales": [],
               "errores": [], "advertencias": [], "transformaciones": []}
    errores = informe["errores"]
    if not isinstance(datos, dict):
        errores.append({"campo": "$", "motivo": "Se requiere un objeto JSON"})
        return informe
    if "schema_version" in datos and not version_valida(datos["schema_version"]):
        errores.append({"campo": "schema_version", "motivo": "Solo se admite el entero 1"})
    if sesion is not None and modulo != "seguimiento" and datos.get("sesion_id") != sesion:
        errores.append({"campo": "sesion_id", "motivo": "Ausente o distinta del alcance solicitado"})
    if modulo != "seguimiento" and "sesion_id" not in datos:
        informe["advertencias"].append("Sin sesión declarada, la fuente carece de alcance para correlación")
    if modulo in FORMATO_VISUAL and "imagen_b64" not in datos:
        informe["formato_recibido"] = "exportacion_visual"
        campos = FORMATO_VISUAL[modulo]
        informe["campos_compatibles"] = sorted(datos.keys() & campos)
        informe["campos_adicionales"] = sorted(datos.keys() - campos)
        if "frames" not in datos:
            requeridos = {"frame_id", "timestamp", "objetos"} if modulo == "imagen" else {
                "schema_version", "modulo", "evento_id", "frame_id", "timestamp", "detecciones"}
            informe["campos_faltantes"] = sorted(requeridos - datos.keys())
        try:
            eventos = adaptar_imagen(datos, exigir_origen_temporal=True) if modulo == "imagen" else adaptar_video(datos)
            repetidos = sum(n - 1 for n in Counter(e["id"] for e in eventos).values())
            if repetidos:
                informe["advertencias"].append(f"{repetidos} identificadores de evento repetidos; revisar duplicados y contradicciones")
            informe["transformaciones"].append(f"{len(eventos)} observaciones normalizadas con tiempo en segundos")
        except (ValueError, OverflowError, TypeError) as error:
            errores.append({"campo": modulo, "motivo": str(error) if type(error) is ValueError else "Tipos o límites inválidos"})
    else:
        diagnosticar_modelo(modulo, datos, informe)
    informe["compatible"] = not errores
    return informe


def diagnosticar_modelo(modulo, datos, informe):
    from .seguimiento import analizar_estudiantes
    from .seguimiento_contrato import EntradaSeguimiento

    modelo = EntradaSeguimiento if modulo == "seguimiento" else MODELOS[modulo]
    entrada = datos if modulo == "seguimiento" else {k: v for k, v in datos.items() if k != "schema_version"}
    campos = modelo.model_fields
    informe["formato_recibido"] = "seguimiento" if modulo == "seguimiento" else "senal_experimental"
    informe["campos_compatibles"] = sorted(entrada.keys() & campos.keys())
    informe["campos_adicionales"] = sorted(entrada.keys() - campos.keys())
    informe["campos_faltantes"] = sorted(k for k, campo in campos.items() if campo.is_required() and k not in entrada)
    try:
        validada = modelo.model_validate(entrada)
        if modulo == "seguimiento":
            salida = analizar_estudiantes(validada)
            informe["transformaciones"].append(f"{len(salida['resultados'])} pares estudiante/sesión evaluados por reglas")
            informe["advertencias"].append(f"Duplicados de observación omitidos: {salida['duplicados_omitidos']}")
            informe["advertencias"].append(f"Registros académicos excluidos: {len(salida['registros_academicos_excluidos'])}")
        elif modulo == "audio" and validada.wav_b64 is not None:
            from backend.entrenamiento_prediccion.rasgos_fase7 import SenalInsuficiente, preparar_audio

            valor = validada.wav_b64
            if valor.startswith(("data:audio/wav;base64,", "data:audio/x-wav;base64,")):
                valor = valor.split(",", 1)[1]
            try:
                preparar_audio(base64.b64decode(valor, validate=True))
            except SenalInsuficiente:
                informe["advertencias"].append("WAV válido con señal insuficiente")
            informe["transformaciones"].append("Validación PCM16 y preparación a 16 kHz sin inferencia")
        elif modulo in FORMATO_VISUAL:
            from backend.entrenamiento_prediccion.imagenes import decodificar_imagen

            decodificar_imagen(validada.imagen_b64)
            informe["transformaciones"].append("Decodificación de imagen sin inferencia")
        elif modulo == "audio":
            informe["advertencias"].append("Los descriptores no habilitan el clasificador WAV")
    except ValidationError as error:
        informe["errores"].extend(errores_pydantic(error, modulo))
    except (ValueError, OverflowError):
        informe["errores"].append({"campo": modulo, "motivo": "Contenido inválido o referencias incompatibles"})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("modulo", choices=("imagen", "video", "audio", "seguimiento"))
    parser.add_argument("archivo", type=Path)
    parser.add_argument("--sesion")
    args = parser.parse_args()
    try:
        with args.archivo.open("rb") as archivo:
            contenido = archivo.read(LIMITE_JSON + 1)
        if len(contenido) > LIMITE_JSON:
            raise ValueError
        informe = diagnosticar(args.modulo, json.loads(contenido), args.sesion)
    except (OSError, ValueError, RecursionError):
        informe = {"modulo": args.modulo.upper(), "compatible": False,
                   "errores": [{"campo": "$", "motivo": "Archivo ilegible, JSON inválido o mayor de 2 MiB"}], "advertencias": []}
    print(json.dumps(informe, indent=2, ensure_ascii=True))
    return 0 if informe["compatible"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
