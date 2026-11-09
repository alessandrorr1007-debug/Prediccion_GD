"""Decodificación compartida para el análisis visual de predicción."""
import base64
import os

MAX_PIXELES = 20_000_000
os.environ.setdefault("OPENCV_IO_MAX_IMAGE_PIXELS", str(MAX_PIXELES))

import cv2
import numpy as np


class ImagenInvalida(ValueError):
    pass


def decodificar_imagen(imagen_b64: str) -> np.ndarray:
    if "," in imagen_b64:
        cabecera, imagen_b64 = imagen_b64.split(",", 1)
        if not cabecera.startswith("data:image/") or not cabecera.endswith(";base64"):
            raise ImagenInvalida("Se esperaba una imagen en base64")
    try:
        datos = base64.b64decode("".join(imagen_b64.split()), validate=True)
    except ValueError:
        raise ImagenInvalida("Base64 de imagen inválido") from None
    if not datos:
        raise ImagenInvalida("La imagen está vacía")
    try:
        imagen = cv2.imdecode(np.frombuffer(datos, np.uint8), cv2.IMREAD_COLOR)
    except cv2.error:
        raise ImagenInvalida("No se pudo decodificar la imagen o excede el límite de píxeles") from None
    if imagen is None or imagen.shape[0] * imagen.shape[1] > MAX_PIXELES:
        raise ImagenInvalida("No se pudo decodificar la imagen o excede el límite de píxeles")
    return imagen
