"""Convierte las detecciones de VIDEO al contrato común de PREDICCIÓN."""
from math import isfinite


ALIAS = {
    "cell phone": "telefono",
    "celular": "telefono",
    "phone": "telefono",
    "headphones": "audifonos",
    "airpods": "audifonos",
    "watch": "reloj",
    "cuaderno/libro": "libro",
    "person": "persona",
    "backpack": "mochila",
}


def _numero(valor, campo, minimo=0, maximo=86400):
    if isinstance(valor, bool):
        raise ValueError(f"video.{campo}: se requiere un número")
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        raise ValueError(f"video.{campo}: se requiere un número") from None
    if not isfinite(numero) or not minimo <= numero <= maximo:
        raise ValueError(f"video.{campo}: fuera del intervalo [{minimo}, {maximo}]")
    return numero


def adaptar_video(datos):
    if not isinstance(datos, dict):
        raise ValueError("video debe ser un objeto")
    frames = datos.get("frames", [])
    if not isinstance(frames, list):
        raise ValueError("video.frames debe ser una lista")
    modelo = str(datos.get("modelo", "SistemaSupervisionExamenes/best.pt"))[:200]
    eventos = []
    for indice_frame, frame in enumerate(frames):
        if not isinstance(frame, dict):
            raise ValueError("Cada elemento de video.frames debe ser un objeto")
        frame_id = str(frame.get("frame_id", indice_frame))
        segundo = _numero(frame.get("segundo", frame.get("timestamp")), "timestamp")
        calidad = _numero(frame.get("calidad", 1), "calidad", 0, 1)
        detecciones = frame.get("detecciones", [])
        if not isinstance(detecciones, list):
            raise ValueError("video.frames[].detecciones debe ser una lista")
        personas = []
        for indice, deteccion in enumerate(detecciones):
            if not isinstance(deteccion, dict):
                raise ValueError("Cada detección de video debe ser un objeto")
            clase = deteccion.get("clase")
            if not isinstance(clase, str) or not clase.strip():
                raise ValueError("Cada detección de video requiere clase")
            senal = ALIAS.get(clase.strip().lower(), clase.strip().lower())
            confianza = _numero(deteccion.get("confianza"), "confianza", 0, 1)
            identificador = str(deteccion.get("id", f"{frame_id}:{indice}"))
            eventos.append({
                "id": f"video:{identificador}",
                "modalidad": "video",
                "senal": senal,
                "segundo": segundo,
                "confianza": confianza,
                "calidad": calidad,
                "modelo": modelo,
            })
            if senal == "persona":
                personas.append(confianza)
        if len(personas) > 1:
            personas.sort(reverse=True)
            eventos.append({
                "id": f"video:{frame_id}:multiples_personas",
                "modalidad": "video",
                "senal": "multiples_personas",
                "segundo": segundo,
                "confianza": personas[1],
                "calidad": calidad,
                "modelo": modelo,
            })
    return eventos
