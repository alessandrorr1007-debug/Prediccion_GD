"""Contrato y límites compartidos por las rutas de captura de AulaPredict."""
import json
from typing import Annotated

from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, StrictBool, ValidationError, field_validator

MAX_JSON_CAPTURA = 8 * 1024 * 1024
Coordenada = Annotated[float, Field(ge=-1_000_000, le=1_000_000, allow_inf_nan=False)]
Confianza = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]


class Caja(BaseModel):
    model_config = ConfigDict(extra="allow")

    x: Coordenada | None = None
    y: Coordenada | None = None
    w: Coordenada | None = None
    h: Coordenada | None = None
    x1: Coordenada | None = None
    y1: Coordenada | None = None
    x2: Coordenada | None = None
    y2: Coordenada | None = None

    @field_validator("x", "y", "w", "h", "x1", "y1", "x2", "y2", mode="before")
    @classmethod
    def coordenada_no_nula(cls, valor):
        if valor is None or isinstance(valor, bool):
            raise ValueError("Se requiere una coordenada numérica")
        return valor


class Objeto(Caja):
    box: Caja | None = None
    conf: Confianza = .88
    confianza: Confianza = .88


class Distractor(Caja):
    conf: Confianza = .90
    score: Confianza = .90


class ContextoCaptura(BaseModel):
    model_config = ConfigDict(extra="allow")

    acciones_detectadas: list[str] = Field(default_factory=list, max_length=1000)
    objetos: list[str | Objeto] = Field(default_factory=list, max_length=1000)
    distractorBox: Distractor | None = None
    distractor_box: Distractor | None = None
    estudiante_id: str | int | None = None
    alumno_id: str | int | None = None


class EntradaCaptura(BaseModel):
    imagen_b64: Annotated[str, Field(strict=True, min_length=1)]
    contexto_externo: ContextoCaptura | None = None


class EntradaVision(BaseModel):
    imagen_b64: Annotated[str, Field(strict=True, min_length=1)]
    modo: Annotated[str, Field(strict=True, min_length=1, max_length=80)] = "en_vivo"
    aplicar_mejora: StrictBool = True
    segundos_distraccion: Annotated[float, Field(ge=0, allow_inf_nan=False)] = 0.0

    @field_validator("segundos_distraccion", mode="before")
    @classmethod
    def segundos_no_booleanos(cls, valor):
        if isinstance(valor, bool):
            raise ValueError("Se requiere un número de segundos")
        return valor


async def leer_captura(request: Request, contrato: type[BaseModel]):
    contenido = bytearray()
    async for bloque in request.stream():
        if len(contenido) + len(bloque) > MAX_JSON_CAPTURA:
            raise HTTPException(413, "El JSON de captura supera 8 MiB")
        contenido.extend(bloque)
    try:
        datos = json.loads(contenido)
    except (ValueError, RecursionError):
        raise HTTPException(400, "Cuerpo JSON inválido") from None
    try:
        return contrato.model_validate(datos)
    except (ValidationError, RecursionError):
        raise HTTPException(422, "La entrada de captura tiene campos o tipos inválidos") from None
