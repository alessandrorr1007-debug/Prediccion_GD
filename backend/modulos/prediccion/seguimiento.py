"""Motor B sin estado: prioridades explicables, nunca diagnóstico o sanción."""
from collections import defaultdict
from datetime import timedelta
from statistics import mean

from backend.modulos.video.adapter import ALIAS
from .registros_academicos import reunir_registros
from .seguimiento_contrato import EntradaSeguimiento, SalidaSeguimiento
from .seguimiento_integracion import reunir_observaciones, resumir_fuentes


def _clave(o):
    return o.sesion_id, o.modulo, o.id


def _senal(o):
    return ALIAS.get(o.valor.lower(), o.valor.lower())


def _detalle_observacion(o):
    detalle = o.model_dump(mode="json")
    detalle["fecha_hora"] = o.fecha_hora.isoformat()
    if o.calidad is None:
        detalle["calidad_origen"] = "no_informada"
    return detalle


def _muestras(observaciones):
    """Correlación explícita o proximidad <=1s. Opuestos invalidan la muestra."""
    grupos = []
    for o in sorted(observaciones, key=lambda o: (o.segundo, o.modulo, o.id)):
        grupo = next((g for g in grupos if
                      (o.evidencia_id is not None and any(x.evidencia_id == o.evidencia_id for x in g))
                      or abs(o.segundo - g[0].segundo) <= 1), None)
        if grupo is None:
            grupos.append([o])
        else:
            grupo.append(o)
    return grupos


def _separadas(grupos, separacion, presente=True):
    seleccion = []
    for grupo in grupos:
        if {o.presente for o in grupo} != {presente}:
            continue
        if not seleccion or grupo[0].segundo - seleccion[-1][0].segundo >= separacion:
            seleccion.append(grupo)
    return seleccion


def _registros(registros, fecha, nombre, contradicciones):
    if registros is None:
        return []
    grupos = defaultdict(list)
    for registro in registros:
        if registro.fecha <= fecha:
            grupos[registro.id].append(registro)
    salida = []
    for identificador, grupo in grupos.items():
        if len({(r.fecha, r.estado) for r in grupo}) > 1:
            contradicciones.append(f"{nombre}:{identificador}: registros contradictorios; excluidos")
        else:
            salida.append(grupo[0])
    return salida


def analizar_estudiantes(datos, *, errores_fuente=None):
    entrada = datos if isinstance(datos, EntradaSeguimiento) else EntradaSeguimiento.model_validate(datos)
    reglas = entrada.reglas
    estudiantes = {e.estudiante_id: e for e in entrada.estudiantes}
    sesiones = {s.sesion_id: s for s in entrada.sesiones}
    if len(estudiantes) != len(entrada.estudiantes) or len(sesiones) != len(entrada.sesiones):
        raise ValueError("No se admiten IDs de estudiante o sesión repetidos")
    inscritos = set()
    for estudiante in entrada.estudiantes:
        if len(set(estudiante.sesiones)) != len(estudiante.sesiones) or set(estudiante.sesiones) - sesiones.keys():
            raise ValueError("Inscripción con sesiones repetidas o desconocidas")
        inscritos.update((estudiante.estudiante_id, s) for s in estudiante.sesiones)
    contextos = {}
    for contexto in entrada.contextos:
        par = contexto.estudiante_id, contexto.sesion_id
        if par not in inscritos or par in contextos:
            raise ValueError("Contexto duplicado o sin inscripción explícita de estudiante y sesión")
        contextos[par] = contexto
    registros_por_par, conflictos_academicos, registros_excluidos = reunir_registros(
        entrada.registros_academicos, sesiones, inscritos, reglas.identidad_minima)
    asistencias_conflictivas = {(r["sesion_id"], r["id"]) for r in registros_excluidos
                               if r["tipo"] == "asistencia" and r["motivo"] == "versiones contradictorias"}

    originales = reunir_observaciones(entrada, errores_fuente)
    indices_excluidos = {error["indice"] for error in (errores_fuente or ())}
    grupos_excluidos = {(entrada.fuentes[i].sesion_id, entrada.fuentes[i].modulo) for i in indices_excluidos}
    unicas, conflictivas = {}, set()
    duplicados = 0
    for o in originales:
        valor = _senal(o)
        if valor != o.valor:
            o = o.model_copy(update={"valor": valor})
        if o.sesion_id not in sesiones:
            raise ValueError("Observación con sesión desconocida")
        sesion = sesiones[o.sesion_id]
        if abs((o.fecha_hora - sesion.inicio).total_seconds() - o.segundo) > 1:
            raise ValueError("fecha_hora no coincide con inicio de sesión + segundo (tolerancia 1s)")
        clave = _clave(o)
        if clave in unicas:
            if unicas[clave] == o:
                duplicados += 1
            else:
                conflictivas.add(clave)
        else:
            unicas[clave] = o

    vinculos = defaultdict(list)
    for asociacion in entrada.asociaciones:
        if (asociacion.sesion_id, asociacion.modulo) in grupos_excluidos:
            continue
        if (asociacion.estudiante_id, asociacion.sesion_id) not in inscritos:
            raise ValueError("Asociación sin inscripción explícita del estudiante en la sesión")
        clave = asociacion.sesion_id, asociacion.modulo, asociacion.observacion_id
        if clave not in unicas:
            raise ValueError("Asociación referencia una observación inexistente")
        vinculos[clave].append(asociacion)

    agrupadas = defaultdict(list)
    atribuciones = {}
    pares_verificados = set()
    sin_atribuir, descartadas = [], []
    conflictos_por_par = defaultdict(list)
    for clave, o in unicas.items():
        referencia = dict(_detalle_observacion(o), identidad_verificada=False)
        asociaciones = vinculos[clave]
        if clave in conflictivas:
            descartadas.append(dict(referencia, estado="observacion_contradictoria", motivo="mismo ID con contenidos contradictorios"))
            for a in asociaciones:
                conflictos_por_par[a.estudiante_id, a.sesion_id].append(f"evento:{o.id}: contenidos contradictorios; excluido")
            continue
        if o.tipo == "conteo_personas":
            sin_atribuir.append(dict(referencia, estado="identidad_no_aplicable", motivo="conteo de escena sin identidad individual"))
            continue
        verificadas = [a for a in asociaciones if a.verificada]
        identidades = {a.estudiante_id for a in verificadas}
        if len(identidades) > 1:
            sin_atribuir.append(dict(referencia, estado="identidad_ambigua", motivo="identidad ambigua"))
            for estudiante_id in identidades:
                conflictos_por_par[estudiante_id, o.sesion_id].append(f"evento:{o.id}: asociaciones de identidad incompatibles")
            continue
        if not any(a.confianza >= reglas.identidad_minima for a in verificadas):
            sin_atribuir.append(dict(referencia, estado="identidad_desconocida", motivo="sin asociación verificada suficiente"))
            continue
        asociacion = max(verificadas, key=lambda a: (a.confianza, a.referencia, a.metodo))
        estudiante_id = asociacion.estudiante_id
        pares_verificados.add((estudiante_id, o.sesion_id))
        identidad = dict(estudiante_id=estudiante_id, identidad_verificada=True,
                         asociacion=dict(metodo=asociacion.metodo, referencia=asociacion.referencia,
                                         confianza=asociacion.confianza))
        referencia.update(identidad)
        sesion = sesiones[o.sesion_id]
        if not 0 <= sesion.segundo_actual - o.segundo <= reglas.ventana_segundos:
            descartadas.append(dict(referencia, estado="fuera_de_ventana", motivo="fuera de ventana o futura"))
            continue
        confianza_insuficiente = o.confianza is None or o.confianza < reglas.confianza_minima
        if confianza_insuficiente or o.calidad is None or o.calidad < reglas.calidad_minima:
            estado = "confianza_insuficiente" if confianza_insuficiente else "calidad_insuficiente"
            descartadas.append(dict(referencia, estado=estado, motivo="confianza/calidad insuficiente o calidad desconocida"))
            continue
        if o.tipo == "objeto" and _senal(o) not in {
                "telefono", "persona", "libro", "cuaderno", "audifonos", "reloj", "mochila", "laptop", "multiples_personas"}:
            descartadas.append(dict(referencia, motivo="objeto desconocido: no hay regla ni interpretación disponible"))
            continue
        agrupadas[estudiante_id, o.sesion_id].append(o)
        atribuciones[clave] = identidad

    resultados = []
    for estudiante_id, sesion_id in sorted(inscritos):
        estudiante, sesion = estudiantes[estudiante_id], sesiones[sesion_id]
        observaciones = agrupadas[estudiante_id, sesion_id]
        contexto = contextos.get((estudiante_id, sesion_id))
        par = estudiante_id, sesion_id
        contradicciones = conflictos_por_par[par] + conflictos_academicos[par]
        faltantes = []
        activadas = []
        evidencia = defaultdict(list)
        por_senal = defaultdict(list)

        def activar(nombre, puntos, explicacion, referencias):
            if puntos:
                activadas.append(dict(regla=nombre, puntos=puntos, explicacion=explicacion, referencias=referencias))

        for o in sorted(observaciones, key=lambda x: (x.segundo, x.modulo, x.id)):
            detalle = dict(_detalle_observacion(o), **atribuciones[_clave(o)])
            evidencia[o.modulo].append(detalle)
            por_senal[o.tipo, _senal(o)].append(o)
        if not observaciones:
            faltantes.append("observaciones recientes con identidad verificada y confianza/calidad suficientes")
        if not any(o.tipo == "objeto" for o in observaciones):
            faltantes.append("observaciones de objetos para reglas de recurrencia")
        tareas, reuniones = [], []
        fecha = (sesion.inicio + timedelta(seconds=sesion.segundo_actual)).date()
        recibidos = registros_por_par[par]
        participaciones = [r for r in recibidos if r.tipo == "participacion"]
        asistencia_externa = {r.id: r for r in recibidos if r.tipo == "asistencia"}
        asistencia_previa = contexto.asistencia if contexto else None
        asistencia = _registros(
            [r for r in (asistencia_previa or []) if (sesion_id, r.id) not in asistencias_conflictivas]
            + list(asistencia_externa.values()), fecha, "asistencia", contradicciones)
        if contexto is None:
            faltantes.append("contexto académico explícito")
        else:
            for campo in ("tareas", "reuniones", "asistencia", "evaluacion_proxima"):
                if getattr(contexto, campo) is None and (campo != "asistencia" or not asistencia):
                    faltantes.append(campo)
            tareas = _registros(contexto.tareas, fecha, "tarea", contradicciones)
            reuniones = _registros(contexto.reuniones, fecha, "reunion", contradicciones)
            for tipo, registros in (("tarea", tareas), ("reunion", reuniones)):
                for registro in registros:
                    evidencia["contexto"].append(dict(id=registro.id, tipo=tipo, fecha=registro.fecha.isoformat(),
                        estado=registro.estado, origen=contexto.origen, naturaleza=contexto.naturaleza,
                        sesion_id=sesion_id, estudiante_id=estudiante_id))
            if contexto.evaluacion_proxima is not None:
                evidencia["contexto"].append(dict(tipo="evaluacion_proxima", valor=contexto.evaluacion_proxima,
                    origen=contexto.origen, naturaleza=contexto.naturaleza, sesion_id=sesion_id, estudiante_id=estudiante_id))
            if contexto.evento_familiar is not None and contexto.evento_familiar.fecha <= fecha:
                evidencia["contexto"].append(dict(tipo="evento_familiar", origen=contexto.origen,
                    naturaleza="sintetica", sesion_id=sesion_id, estudiante_id=estudiante_id,
                    evento_familiar=contexto.evento_familiar.model_dump(mode="json")))
        origenes_asistencia = {}
        for r in asistencia:
            externo = asistencia_externa.get(r.id)
            origen = externo.origen if externo else contexto.origen
            origenes_asistencia[r.id] = origen
            detalle = dict(id=r.id, tipo="asistencia", fecha=r.fecha.isoformat(),
                estado=r.estado, origen=origen, naturaleza=externo.naturaleza if externo else contexto.naturaleza,
                sesion_id=sesion_id, estudiante_id=estudiante_id)
            if externo:
                detalle.update(identidad_verificada=True, confianza_identidad=externo.confianza)
            evidencia["contexto"].append(detalle)
        if (asistencia_previa is not None or asistencia_externa) and len(asistencia) < 5:
            faltantes.append("asistencia: al menos cinco registros válidos para evaluar el patrón")
        for r in participaciones:
            evidencia["contexto"].append(dict(id=r.id, tipo="participacion", fecha=r.fecha.isoformat(),
                valor=r.cantidad, origen=r.origen, naturaleza=r.naturaleza, sesion_id=sesion_id,
                estudiante_id=estudiante_id, identidad_verificada=True, confianza_identidad=r.confianza))
        pendientes = [t for t in tareas if t.estado == "pendiente"]
        incumplidas = [r for r in reuniones if r.estado == "incumplida"]
        if len(pendientes) >= 2:
            activar("tareas_pendientes", reglas.puntos_tareas,
                    f"{len(pendientes)} tareas constan pendientes; no se presupone su causa ni una nota futura.",
                    [f"contexto:{contexto.origen}:tarea:{t.id}" for t in pendientes])
        if incumplidas:
            activar("reunion_incumplida", reglas.puntos_reuniones,
                    "Existe una reunión registrada como incumplida; verificar el registro.",
                    [f"contexto:{contexto.origen}:reunion:{r.id}" for r in incumplidas])
        ausentes = [a for a in asistencia if a.estado == "ausente"]
        if len(asistencia) >= 5 and len(ausentes) >= 2:
            activar("inasistencias_registradas", reglas.puntos_asistencia,
                    f"{len(ausentes)} ausencias entre {len(asistencia)} registros aportados; no se infiere deserción.",
                    [f"contexto:{origenes_asistencia[a.id]}:asistencia:{a.id}" for a in ausentes])

        telefonos = [o for o in observaciones if o.tipo == "objeto" and _senal(o) == "telefono"]
        grupos = _muestras(telefonos)
        for g in grupos:
            if len({o.presente for o in g}) > 1:
                contradicciones.append("teléfono: observaciones opuestas correlacionadas; muestra excluida")
        muestras = _separadas(grupos, reglas.separacion_segundos)
        permitidos = {ALIAS.get(p.lower(), p.lower()) for p in sesion.objetos_permitidos}
        recurrente = len(muestras) >= reglas.minimo_observaciones and "telefono" not in permitidos
        referencias = [f"{o.modulo}:{o.id}" for g in muestras for o in g]
        if recurrente:
            activar("presencia_recurrente_celular", reglas.puntos_recurrencia,
                    f"{len(muestras)} muestras separadas al menos {reglas.separacion_segundos:g}s registran teléfono no permitido; no demuestra uso ni distracción.", referencias)
        if recurrente and pendientes and incumplidas:
            activar("concurrencia_academica", reglas.puntos_concurrencia,
                    "Coinciden recurrencia observada, tareas pendientes y reunión incumplida; revisar conjuntamente sin atribuir causalidad.",
                    referencias + [f"tarea:{t.id}" for t in pendientes] + [f"reunion:{r.id}" for r in incumplidas])
        if contexto is not None and contexto.evaluacion_proxima and (recurrente or len(pendientes) >= 2):
            activar("evaluacion_proxima", reglas.puntos_evaluacion,
                    "Hay una evaluación próxima explícitamente indicada y factores de seguimiento; verificar necesidades de apoyo.", [f"contexto:{contexto.origen}:evaluacion_proxima"])

        adversos = [r for r in evidencia.get("contexto", ())
                    if r.get("estado") in {"pendiente", "ausente", "incumplida"}]
        validas = set()
        for (tipo, valor), eventos in por_senal.items():
            permitido = tipo == "objeto" and (valor in permitidos or valor == "persona")
            for muestra in (grupos if (tipo, valor) == ("objeto", "telefono") else _muestras(eventos)):
                estados = {o.presente for o in muestra}
                if len(estados) > 1 and (tipo, valor) != ("objeto", "telefono"):
                    contradicciones.append(f"{valor}: observaciones opuestas correlacionadas; muestra excluida")
                if adversos and not permitido and estados == {True}:
                    validas.update((o.modulo, o.id) for o in muestra)
        coincidencia = None
        if validas:
            evaluacion = [r for r in evidencia["contexto"]
                          if r["tipo"] == "evaluacion_proxima" and r["valor"] is True]
            coincidencia = dict(
                motivo="Coinciden observaciones atribuidas y registros académicos adversos en la sesión. La coincidencia se documenta sin asignar puntos.",
                observaciones=[o for modulo, items in evidencia.items()
                               if modulo != "contexto" for o in items if (modulo, o["id"]) in validas],
                registros_academicos=adversos + evaluacion,
            )

        # No compara personas. Requiere tres sesiones previas finalizadas de la misma
        # actividad con muestras explícitas de presencia/ausencia y mismo permiso.
        bases = []
        inicios_base = set()
        evidencias_base = set()
        for anterior_id in estudiante.sesiones:
            anterior = sesiones[anterior_id]
            if (not anterior.finalizada or anterior.inicio >= sesion.inicio or anterior.actividad != sesion.actividad
                    or anterior.objetos_permitidos != sesion.objetos_permitidos):
                continue
            previas = [o for o in agrupadas[estudiante_id, anterior_id] if o.tipo == "objeto" and _senal(o) == "telefono"]
            if ({o.modulo for o in previas} != {o.modulo for o in telefonos}
                    or abs(min(anterior.segundo_actual, reglas.ventana_segundos)
                           - min(sesion.segundo_actual, reglas.ventana_segundos)) > 1):
                continue
            bloques = _muestras(previas)
            positivas = _separadas(bloques, reglas.separacion_segundos)
            negativas = _separadas(bloques, reglas.separacion_segundos, presente=False)
            ids_evidencia = {o.evidencia_id for g in positivas + negativas for o in g if o.evidencia_id}
            if (len(positivas) + len(negativas) >= reglas.minimo_observaciones
                    and anterior.inicio not in inicios_base and not (ids_evidencia & evidencias_base)):
                bases.append((anterior_id, len(positivas) / (len(positivas) + len(negativas))))
                inicios_base.add(anterior.inicio)
                evidencias_base.update(ids_evidencia)
        negativos = _separadas(grupos, reglas.separacion_segundos, presente=False)
        if recurrente and len(bases) >= 3:
            tasa = len(muestras) / (len(muestras) + len(negativos))
            if tasa - mean(t for _, t in bases) >= .5:
                activar("cambio_patron_observado", reglas.puntos_cambio_patron,
                        "La fracción de muestras con teléfono sube al menos 0.5 frente a tres o más sesiones previas comparables; es un cambio en observaciones, no una conclusión conductual.",
                        referencias + [f"sesion:{s}" for s, _ in bases])
        elif not sesion.finalizada:
            faltantes.append("tres sesiones previas comparables para evaluar cambios de patrón")

        suficientes = bool(any(o.tipo == "objeto" for o in observaciones) or tareas or reuniones or asistencia)
        puntos = min(100, sum(a["puntos"] for a in activadas)) if suficientes else None
        reglas_academicas = [a for a in activadas if a["regla"] in {
            "tareas_pendientes", "reunion_incumplida", "inasistencias_registradas"
        } or (a["regla"] == "evaluacion_proxima" and len(pendientes) >= 2)]
        prioridad_academica = min(100, sum(a["puntos"] for a in reglas_academicas)) if (
            tareas or reuniones or len(asistencia) >= 5) else None
        indicadores = dict(
            metodo="reglas_academicas", prioridad_academica=prioridad_academica,
            estado="datos_insuficientes" if prioridad_academica is None else "evaluado",
            asistencia_registros=len(asistencia) if asistencia_previa is not None or asistencia else None,
            ausencias=len(ausentes) if asistencia else None,
            participaciones=sum(r.cantidad for r in participaciones) if participaciones else None,
            reglas=reglas_academicas,
        )
        nivel = "datos_insuficientes" if puntos is None else (
            "alto" if puntos >= reglas.umbral_alto else "moderado" if puntos >= reglas.umbral_moderado else "bajo")
        recomendaciones = (["Verificar con el docente las evidencias y el estado de las entregas; ofrecer una conversación de apoyo sin prejuzgar."]
                           if activadas else ["Solicitar o verificar los datos faltantes." if puntos is None else
                                              "No se activaron reglas; continuar observación sin concluir ausencia de dificultades."])
        if contradicciones:
            recomendaciones.append("Resolver las observaciones o registros contradictorios antes de tomar decisiones.")
        avisar = ["docente", "tutor"] if nivel == "alto" else (["docente"] if activadas else [])
        resultados.append(dict(estudiante_id=estudiante_id, nombre=estudiante.nombre, sesion_id=sesion_id,
            tiene_observaciones_verificadas=(estudiante_id, sesion_id) in pares_verificados,
            actividad=sesion.actividad, indice_prioridad=puntos, nivel_revision=nivel,
            reglas_activadas=activadas, evidencia_por_modulo=dict(evidencia), datos_faltantes=faltantes,
            indicadores_academicos=indicadores,
            coincidencia_contextual=coincidencia,
            contradicciones=contradicciones,
            limitaciones=["Caso sintético: prioridad heurística sin calibración, no es probabilidad de desaprobación ni diagnóstico.",
                "Solo usa observaciones y contexto aportados para esta persona/sesión; datos faltantes no equivalen a ausencia de dificultades.",
                "La asociación de identidad es una declaración referenciada del integrador, sin verificación biométrica.",
                "Una detección de celular no demuestra uso ni falta de atención; las emociones no asignan puntos."],
            recomendaciones=recomendaciones, avisar_a=avisar,
            requiere_revision_humana=True))

    return SalidaSeguimiento(version_motor="seguimiento-1.0.0", metodo="reglas_configurables_no_calibradas", reglas_aplicadas=reglas,
        resultados=resultados, observaciones_sin_atribuir=sin_atribuir, observaciones_descartadas=descartadas,
        duplicados_omitidos=duplicados, fuentes_recibidas=resumir_fuentes(
            [f for i, f in enumerate(entrada.fuentes) if i not in indices_excluidos], originales),
        registros_academicos_excluidos=registros_excluidos,
        limitaciones=["Demostración sintética sin autenticación: no admite datos reales ni almacena historiales.",
            "Identidad declarada mediante referencia revisada; PREDICCIÓN no reconoce rostros ni verifica documentos externos.",
            "No predice notas, desaprobación, fraude, estados psicológicos ni deserción; siempre revisión humana.",
            "Emociones son observaciones inciertas y no aportan puntos; AUDIO sigue pendiente.",
            "Resultados correlacionados requieren evidencia_id común si no son simultáneos; no se presume independencia.",
            "Los adaptadores heredados usan calidad 1 provisional cuando el productor no normaliza calidad.",
            "Asistencia, tareas y reuniones usan únicamente registros proporcionados; no hay conexión institucional.",
            "Cambios de patrón comparan muestras aportadas, no cobertura continua ni comportamiento real."],
        estado_modulos={"imagen": "objetos; identidad/emociones no acreditadas por productor",
                        "video": "detecciones; seguimiento local no es identidad", "audio": "pendiente",
                        "captura": "conteo de escena u observaciones normalizadas sin identidad implícita"}).model_dump(mode="json")
