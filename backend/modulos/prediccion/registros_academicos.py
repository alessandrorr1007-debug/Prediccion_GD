"""Atribución de registros explícitos de productores en la demo académica."""
from collections import defaultdict
from datetime import timedelta


def reunir_registros(registros, sesiones, inscritos, identidad_minima):
    grupos = defaultdict(list)
    for registro in registros:
        if registro.naturaleza == "real":
            raise ValueError("La demo local no admite registros académicos declarados reales")
        if registro.sesion_id not in sesiones:
            raise ValueError("Registro académico con sesión desconocida")
        grupos[registro.sesion_id, registro.tipo, registro.id].append(registro)

    por_estudiante = defaultdict(list)
    conflictos = defaultdict(list)
    excluidos = []
    for (sesion_id, tipo, identificador), grupo in grupos.items():
        versiones = {(r.estudiante_id, r.fecha, r.estado, r.cantidad) for r in grupo}
        if len(versiones) > 1:
            motivo = "versiones contradictorias"
            for estudiante_id, *_ in versiones:
                par = estudiante_id, sesion_id
                if par in inscritos:
                    conflictos[par].append(f"{tipo}:{identificador}: registros contradictorios; excluidos")
        else:
            elegibles = [
                r for r in grupo if r.verificada and (r.estudiante_id, sesion_id) in inscritos
                and (r.confianza is None or r.confianza >= identidad_minima)
            ]
            sesion = sesiones[sesion_id]
            fecha = (sesion.inicio + timedelta(seconds=sesion.segundo_actual)).date()
            if elegibles and elegibles[0].fecha <= fecha:
                por_estudiante[elegibles[0].estudiante_id, sesion_id].append(elegibles[0])
                continue
            motivo = "registro futuro" if elegibles else "sin identidad verificada suficiente"
        excluidos.append(dict(id=identificador, sesion_id=sesion_id, tipo=tipo, motivo=motivo,
                              origenes=sorted({r.origen for r in grupo})))
    return por_estudiante, conflictos, excluidos
