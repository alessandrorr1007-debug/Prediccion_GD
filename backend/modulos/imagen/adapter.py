"""Convierte la exportación JSON de IMAGEN al contrato de PREDICCIÓN."""
from datetime import datetime
from math import isfinite

from backend.modulos.video.adapter import ALIAS


ESTADOS_VALIDOS = {"confirmada", "recuperada"}


def _numero(valor, campo, minimo=0, maximo=1):
    if isinstance(valor, bool):
        raise ValueError(f"imagen.{campo}: se requiere un número")
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        raise ValueError(f"imagen.{campo}: se requiere un número") from None
    if not isfinite(numero) or not minimo <= numero <= maximo:
        raise ValueError(f"imagen.{campo}: fuera del intervalo [{minimo}, {maximo}]")
    return numero


def _segundos(frames):
    valores = [frame.get("segundo", frame.get("timestamp")) for frame in frames]
    if all(isinstance(valor, (int, float)) and not isinstance(valor, bool) for valor in valores):
        return [_numero(valor, "timestamp", 0, 86400) for valor in valores]
    try:
        fechas = [datetime.fromisoformat(str(valor).replace("Z", "+00:00")) for valor in valores]
    except (TypeError, ValueError):
        raise ValueError("imagen.frames[].timestamp debe ser numérico o una fecha ISO consistente") from None
    origen = min(fechas)
    return [(fecha - origen).total_seconds() for fecha in fechas]


def _confianza(objeto):
    for campo in ("confianza_procesada", "confianza_capturada", "confianza_video", "confianza"):
        if objeto.get(campo) is not None:
            return _numero(objeto[campo], campo)
    raise ValueError("Cada objeto de imagen requiere una confianza")


def adaptar_imagen(datos):
    if not isinstance(datos, dict):
        raise ValueError("imagen debe ser un objeto")
    frames = datos.get("frames", [])
    if not isinstance(frames, list):
        raise ValueError("imagen.frames debe ser una lista")
    if not all(isinstance(frame, dict) for frame in frames):
        raise ValueError("Cada elemento de imagen.frames debe ser un objeto")
    segundos = _segundos(frames) if frames else []
    modelo = str(datos.get("modelo", "SistemaSupervisionExamenes-Imagen"))[:200]
    eventos = []
    for indice_frame, (frame, segundo) in enumerate(zip(frames, segundos)):
        frame_id = str(frame.get("frame_id", indice_frame))
        calidad = frame.get("calidad_normalizada", 1)
        calidad = _numero(calidad, "calidad_normalizada")
        objetos = frame.get("objetos", [])
        if not isinstance(objetos, list):
            raise ValueError("imagen.frames[].objetos debe ser una lista")
        for indice, objeto in enumerate(objetos):
            if not isinstance(objeto, dict):
                raise ValueError("Cada objeto detectado por imagen debe ser un objeto JSON")
            estado = objeto.get("estado")
            if estado is not None and estado not in ESTADOS_VALIDOS:
                continue
            clase = objeto.get("clase")
            if not isinstance(clase, str) or not clase.strip():
                raise ValueError("Cada objeto de imagen requiere clase")
            identificador = str(objeto.get("id", f"{frame_id}:{indice}"))
            eventos.append({
                "id": f"imagen:{frame_id}:{identificador}",
                "modalidad": "imagen",
                "senal": ALIAS.get(clase.strip().lower(), clase.strip().lower()),
                "segundo": segundo,
                "confianza": _confianza(objeto),
                "calidad": calidad,
                "modelo": modelo,
            })
    return eventos
