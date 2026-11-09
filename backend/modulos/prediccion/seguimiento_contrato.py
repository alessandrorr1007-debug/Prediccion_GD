"""Contrato de demostración del motor B; no implica identidad biométrica."""
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StringConstraints, field_validator, model_validator

Texto = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Numero = Annotated[float, Field(strict=True, ge=0, allow_inf_nan=False)]
Unidad = Annotated[float, Field(strict=True, ge=0, le=1, allow_inf_nan=False)]
Segundo = Annotated[float, Field(strict=True, ge=0, le=86400, allow_inf_nan=False)]
ModuloObservacion = Literal["imagen", "video", "audio", "captura"]
Naturaleza = Literal["real", "sintetica", "desconocida"]
EMOCIONES = {"alegria", "tristeza", "miedo", "enojo", "sorpresa", "asco", "neutral"}
ALIAS_EMOCIONES = {"felicidad": "alegria", "disgusto": "asco"}


def normalizar_emocion(valor: str) -> str:
    etiqueta = valor.lower()
    return ALIAS_EMOCIONES.get(etiqueta, etiqueta)


class Contrato(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Estudiante(Contrato):
    estudiante_id: Texto
    nombre: Texto | None = None
    sesiones: list[Texto] = Field(min_length=1, max_length=100)


class Sesion(Contrato):
    sesion_id: Texto
    actividad: Literal["clase", "examen", "taller"]
    inicio: datetime
    segundo_actual: Segundo
    objetos_permitidos: list[Texto] = Field(default_factory=list, max_length=50)
    # Solo sesiones completas y comparables se usan como referencia histórica.
    finalizada: StrictBool = False

    @model_validator(mode="after")
    def zona_explicita(self):
        if self.inicio.tzinfo is None:
            raise ValueError("La sesión requiere inicio con zona horaria explícita")
        return self


class Observacion(Contrato):
    id: Texto
    sesion_id: Texto
    modulo: ModuloObservacion
    segundo: Segundo
    duracion_segundos: Segundo | None = None
    fecha_hora: datetime
    origen: Texto
    tipo: Literal["objeto", "emocion", "senal_voz", "conteo_personas"]
    valor: Texto
    presente: StrictBool = True
    porcentaje: Annotated[float, Field(strict=True, ge=0, le=100, allow_inf_nan=False)] | None = None
    confianza: Unidad | None = None
    calidad: Unidad | None = None
    evidencia_id: Texto | None = None
    naturaleza: Naturaleza = "desconocida"
    modelo: Texto | None = None
    calidad_origen: Literal["declarada", "supuesto_heredado", "no_distinguible"] = "declarada"

    @model_validator(mode="after")
    def validar_tipo(self):
        if self.fecha_hora.tzinfo is None:
            raise ValueError("La observación requiere fecha_hora con zona horaria explícita")
        if self.tipo == "emocion":
            self.valor = normalizar_emocion(self.valor)
            if self.valor not in EMOCIONES or self.porcentaje is None:
                raise ValueError("Emoción requiere una de las siete clases y porcentaje; no es un diagnóstico")
        if self.tipo != "emocion" and self.porcentaje is not None:
            raise ValueError("porcentaje solo corresponde a una clasificación emocional")
        if self.tipo == "senal_voz" and self.modulo != "audio":
            raise ValueError("senal_voz requiere el módulo AUDIO, que permanece pendiente")
        if self.tipo == "conteo_personas" and (
            self.modulo != "captura" or not self.valor.isascii() or not self.valor.isdecimal()
            or len(self.valor) > 5 or int(self.valor) > 10000
        ):
            raise ValueError("conteo_personas requiere una captura y un conteo de 0 a 10000")
        return self


class Asociacion(Contrato):
    observacion_id: Texto
    modulo: ModuloObservacion
    sesion_id: Texto
    estudiante_id: Texto
    metodo: Literal["revision_manual", "registro_institucional"]
    referencia: Texto
    verificada: StrictBool
    confianza: Unidad


class Asistencia(Contrato):
    id: Texto
    fecha: date
    estado: Literal["presente", "ausente", "justificada"]


class RegistroAcademico(Contrato):
    id: Texto
    sesion_id: Texto
    estudiante_id: Texto | None = None
    fecha: date
    origen: Texto
    naturaleza: Naturaleza = "desconocida"
    verificada: StrictBool = False
    confianza: Unidad | None = None
    tipo: Literal["asistencia", "participacion"]
    estado: Literal["presente", "ausente", "justificada"] | None = None
    cantidad: Annotated[int, Field(strict=True, ge=0, le=1000)] | None = None

    @model_validator(mode="after")
    def validar_tipo(self):
        if self.tipo == "asistencia" and (self.estado is None or self.cantidad is not None):
            raise ValueError("Asistencia requiere estado")
        if self.tipo == "participacion" and (self.cantidad is None or self.estado is not None):
            raise ValueError("Participación requiere cantidad")
        return self


class Tarea(Contrato):
    id: Texto
    fecha: date
    estado: Literal["pendiente", "entregada"]


class Reunion(Contrato):
    id: Texto
    fecha: date
    estado: Literal["incumplida", "realizada", "cancelada"]


class EventoFamiliar(Contrato):
    declarado: StrictBool
    tipo: Literal["situacion_personal"]
    fecha: date
    referencia: Texto
    simulado: StrictBool

    @model_validator(mode="after")
    def declaracion_sintetica(self):
        if not self.declarado or not self.simulado:
            raise ValueError("El evento familiar debe estar declarado y ser simulado")
        return self


class ContextoAcademico(Contrato):
    estudiante_id: Texto
    sesion_id: Texto
    origen: Texto
    naturaleza: Naturaleza = "desconocida"
    asistencia: list[Asistencia] | None = Field(default=None, max_length=366)
    tareas: list[Tarea] | None = Field(default=None, max_length=1000)
    reuniones: list[Reunion] | None = Field(default=None, max_length=1000)
    evaluacion_proxima: StrictBool | None = None
    evento_familiar: EventoFamiliar | None = None


class FuenteResultados(Contrato):
    """Envuelve un resultado producido fuera del seguimiento."""
    modulo: ModuloObservacion
    sesion_id: Texto
    origen: Texto
    naturaleza: Naturaleza = "desconocida"
    datos: dict
    # El integrador aporta una referencia compartida cuando conoce la correlación.
    evidencias: dict[str, Texto] = Field(default_factory=dict)


class ConteoCaptura(Contrato):
    captura_id: Texto
    segundo: Segundo
    personas_detectadas: Annotated[int, Field(strict=True, ge=0, le=10000)]


class ReglasSeguimiento(Contrato):
    ventana_segundos: Annotated[float, Field(strict=True, ge=10, le=3600)] = 60
    confianza_minima: Unidad = .6
    calidad_minima: Unidad = .4
    identidad_minima: Annotated[float, Field(strict=True, ge=.9, le=1, allow_inf_nan=False)] = .9
    minimo_observaciones: Annotated[int, Field(strict=True, ge=3, le=100)] = 3
    separacion_segundos: Annotated[float, Field(strict=True, ge=1, le=60)] = 5
    puntos_recurrencia: Annotated[int, Field(strict=True, ge=0, le=100)] = 35
    puntos_tareas: Annotated[int, Field(strict=True, ge=0, le=100)] = 20
    puntos_reuniones: Annotated[int, Field(strict=True, ge=0, le=100)] = 10
    puntos_asistencia: Annotated[int, Field(strict=True, ge=0, le=100)] = 15
    puntos_concurrencia: Annotated[int, Field(strict=True, ge=0, le=100)] = 15
    puntos_evaluacion: Annotated[int, Field(strict=True, ge=0, le=100)] = 10
    puntos_cambio_patron: Annotated[int, Field(strict=True, ge=0, le=100)] = 10
    umbral_moderado: Annotated[int, Field(strict=True, ge=1, le=99)] = 30
    umbral_alto: Annotated[int, Field(strict=True, ge=2, le=100)] = 60

    @model_validator(mode="after")
    def validar_umbrales(self):
        if self.umbral_moderado >= self.umbral_alto:
            raise ValueError("umbral_moderado debe ser menor que umbral_alto")
        if (self.minimo_observaciones - 1) * self.separacion_segundos > self.ventana_segundos:
            raise ValueError("La ventana no permite la recurrencia configurada")
        return self


class EntradaSeguimiento(Contrato):
    schema_version: Literal[1]
    simulado: Literal[True]
    descripcion: Texto
    estudiantes: list[Estudiante] = Field(min_length=1, max_length=100)
    sesiones: list[Sesion] = Field(min_length=1, max_length=100)
    observaciones: list[Observacion] = Field(default_factory=list, max_length=5000)
    historial: list[Observacion] = Field(default_factory=list, max_length=5000)
    asociaciones: list[Asociacion] = Field(default_factory=list, max_length=10000)
    contextos: list[ContextoAcademico] = Field(default_factory=list, max_length=1000)
    registros_academicos: list[RegistroAcademico] = Field(default_factory=list, max_length=5000)
    fuentes: list[FuenteResultados] = Field(default_factory=list, max_length=100)
    reglas: ReglasSeguimiento = Field(default_factory=ReglasSeguimiento)

    @field_validator("schema_version", "simulado", mode="before")
    @classmethod
    def marcadores_estrictos(cls, valor, info):
        if info.field_name == "simulado" and valor is not True:
            raise ValueError("Solo se admiten demostraciones simulado=true; datos reales requieren autenticación y otro alcance")
        if info.field_name == "schema_version" and (type(valor) is not int or valor != 1):
            raise ValueError("Solo se admite schema_version entero 1")
        return valor


class ReglaActivada(Contrato):
    regla: str
    puntos: int
    explicacion: str
    referencias: list[str]


class CoincidenciaContextual(Contrato):
    motivo: str
    observaciones: list[dict]
    registros_academicos: list[dict]


class ResultadoEstudiante(Contrato):
    estudiante_id: str
    nombre: str | None
    sesion_id: str
    actividad: str
    tiene_observaciones_verificadas: bool = False
    indice_prioridad: int | None
    nivel_revision: Literal["datos_insuficientes", "bajo", "moderado", "alto"]
    reglas_activadas: list[ReglaActivada]
    evidencia_por_modulo: dict[str, list[dict]]
    indicadores_academicos: dict = Field(default_factory=dict)
    coincidencia_contextual: CoincidenciaContextual | None = None
    datos_faltantes: list[str]
    contradicciones: list[str]
    limitaciones: list[str]
    recomendaciones: list[str]
    avisar_a: list[str]
    requiere_revision_humana: Literal[True] = True


class FuenteRecibida(Contrato):
    modulo: ModuloObservacion
    sesion_id: Texto
    origen: Texto
    naturaleza: Naturaleza
    observaciones_recibidas: int


class SalidaSeguimiento(Contrato):
    version_motor: str
    simulado: Literal[True] = True
    metodo: str
    reglas_aplicadas: ReglasSeguimiento
    resultados: list[ResultadoEstudiante]
    observaciones_sin_atribuir: list[dict]
    observaciones_descartadas: list[dict]
    duplicados_omitidos: int
    limitaciones: list[str]
    estado_modulos: dict[str, str]
    fuentes_recibidas: list[FuenteRecibida] = Field(default_factory=list)
    registros_academicos_excluidos: list[dict] = Field(default_factory=list)
