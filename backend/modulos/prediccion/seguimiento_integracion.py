"""Adapta resultados declarados al seguimiento, sin ejecutar modelos."""
from datetime import datetime, timedelta

from backend.modulos.imagen.adapter import adaptar_imagen
from backend.modulos.video.adapter import adaptar_video
from .seguimiento_contrato import ConteoCaptura, EntradaSeguimiento, Observacion


class ErrorFuente(ValueError):
    def __init__(self, indice, modulo, codigo, mensaje):
        super().__init__(mensaje)
        self.detalle = dict(indice=indice, modulo=modulo, codigo=codigo)


def _adaptar(fuente, sesion):
    datos = fuente.datos
    base = dict(sesion_id=fuente.sesion_id, modulo=fuente.modulo, origen=fuente.origen,
                naturaleza=fuente.naturaleza)
    if fuente.modulo == "captura":
        try:
            captura = ConteoCaptura.model_validate(datos)
        except ValueError:
            raise ValueError("CAPTURA requiere captura_id, segundo y personas_detectadas válidos") from None
        if fuente.evidencias:
            raise ValueError("Un conteo de escena no admite referencias de correlación individual")
        return [Observacion(**base, id=captura.captura_id, tipo="conteo_personas",
                            valor=str(captura.personas_detectadas), segundo=captura.segundo,
                            fecha_hora=sesion.inicio + timedelta(seconds=captura.segundo))]

    if datos.get("sesion_id") not in (None, sesion.sesion_id):
        raise ValueError("sesion_id de la fuente no coincide con la sesión declarada")
    if fuente.modulo == "imagen":
        if "origen_temporal" in datos:
            try:
                origen = datetime.fromisoformat(str(datos["origen_temporal"]).replace("Z", "+00:00"))
            except ValueError:
                raise ValueError("IMAGEN requiere origen_temporal ISO válido") from None
            inicio = sesion.inicio if origen.tzinfo is not None else sesion.inicio.replace(tzinfo=None)
            if origen != inicio:
                raise ValueError("IMAGEN origen_temporal no coincide con el inicio explícito de la sesión")
        eventos = adaptar_imagen(datos, exigir_origen_temporal=True)
        calidades_declaradas = ["calidad_normalizada" in frame for frame in datos.get("frames", [datos])]
    else:
        eventos = adaptar_video(datos)
        calidades_declaradas = ["calidad" in frame for frame in datos.get("frames", [])]

    calidad_unidad = ("declarada" if all(calidades_declaradas) and calidades_declaradas
                      else "no_distinguible" if any(calidades_declaradas) else "supuesto_heredado")
    conocidos = {evento["id"] for evento in eventos}
    if set(fuente.evidencias) - conocidos:
        raise ValueError("La referencia de correlación apunta a un evento no generado por el adaptador")
    return [
        Observacion(**base, id=e["id"], segundo=e["segundo"],
                    fecha_hora=sesion.inicio + timedelta(seconds=e["segundo"]),
                    tipo="objeto", valor=e["senal"], confianza=e["confianza"], calidad=e["calidad"],
                    calidad_origen=calidad_unidad if e["calidad"] == 1 else "declarada",
                    modelo=e["modelo"].strip() or None, evidencia_id=fuente.evidencias.get(e["id"]))
        for e in eventos
    ]


def reunir_observaciones(entrada: EntradaSeguimiento, errores_fuente=None):
    sesiones = {s.sesion_id: s for s in entrada.sesiones}
    observaciones = [*entrada.observaciones, *entrada.historial]
    if any(o.modulo == "audio" for o in observaciones):
        raise ValueError("AUDIO pendiente: no existe contrato productor ni adaptador; no se admiten detecciones acústicas")
    if any(item.naturaleza == "real" for item in (*observaciones, *entrada.contextos)):
        raise ValueError("La demo local solo admite datos sintéticos; se declaró evidencia real")
    for indice, fuente in enumerate(entrada.fuentes):
        try:
            if fuente.modulo == "audio":
                raise ErrorFuente(indice, "audio", "contrato_pendiente", "AUDIO pendiente: no existe contrato productor ni adaptador")
            if fuente.naturaleza == "real" or fuente.datos.get("simulado") is False or fuente.datos.get("naturaleza") == "real":
                raise ErrorFuente(indice, fuente.modulo, "datos_reales", "La demo local solo admite datos sintéticos; se declaró una fuente real")
            if fuente.sesion_id not in sesiones:
                raise ErrorFuente(indice, fuente.modulo, "sesion_desconocida", "Fuente de resultados referencia una sesión desconocida")
            observaciones.extend(_adaptar(fuente, sesiones[fuente.sesion_id]))
        except (ValueError, OverflowError, TypeError) as error:
            if isinstance(error, ErrorFuente):
                fallo = error
            else:
                mensaje = str(error) if type(error) is ValueError else "Campos o límites inválidos en la fuente"
                fallo = ErrorFuente(indice, fuente.modulo, "fuente_invalida", mensaje)
            if errores_fuente is None:
                raise fallo from None
            errores_fuente.append(fallo.detalle)
    return observaciones


def resumir_fuentes(fuentes, observaciones):
    def clave(item):
        return item.modulo, item.sesion_id, item.origen, item.naturaleza

    conteos = dict.fromkeys(map(clave, fuentes), 0)
    for observacion in observaciones:
        k = clave(observacion)
        conteos[k] = conteos.get(k, 0) + 1
    return [dict(modulo=m, sesion_id=s, origen=o, naturaleza=n, observaciones_recibidas=cantidad)
            for (m, s, o, n), cantidad in sorted(conteos.items())]
