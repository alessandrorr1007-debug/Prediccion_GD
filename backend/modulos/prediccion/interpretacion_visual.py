"""Motor desacoplado de interpretaciones visuales y evidencia requerida."""

NOMBRES_CATEGORIAS = {
    "alegria": "alegría",
    "felicidad": "alegría",
    "tristeza": "tristeza",
    "enojo": "enojo",
    "neutral": "neutral",
    "calma": "calma",
    "miedo": "miedo",
    "sorpresa": "sorpresa",
    "asco": "asco",
    "disgusto": "asco",
}

HIPOTESIS_CONTEXTUALES_GENERALES = [
    "Cansancio o fatiga acumulada",
    "Estrés o carga relacionada con actividades académicas",
    "Concentración o expresión facial habitual en reposo",
    "Situaciones personales externas no observables ni evaluadas por el sistema",
]

LIMITACIONES_BASE_IMAGEN = [
    "La expresión facial observada es compatible con varias interpretaciones. No permite establecer por sí sola el estado emocional real del estudiante.",
    "El sistema no afirma ni diagnostica problemas familiares, depresión, ansiedad, estrés clínico, dificultades económicas ni rendimiento futuro a partir de una fotografía.",
    "La identidad permanece desconocida salvo verificación explícita; una observación visual no se atribuye a historiales académicos sin enlace autorizado.",
]

EVIDENCIA_ADICIONAL_BASE = (
    "Para analizar posibles relaciones con el desempeño académico se requieren registros de asistencia, "
    "participación, evaluaciones u otras evidencias pertinentes."
)

TEXTO_INTERPRETACION_FACIAL = (
    "La expresión facial observada es compatible con varias interpretaciones. "
    "No permite establecer por sí sola el estado emocional real del estudiante."
)

GUIA_OBJETOS = {
    "telefono": {
        "observacion": "Se detectó un teléfono móvil en la imagen.",
        "interpretacion": "La presencia del dispositivo podría justificar revisar si existe una actividad autorizada o una posible interrupción de la atención.",
        "limite": "Una fotografía aislada no demuestra distracción, falta de participación ni bajo rendimiento académico.",
    },
    "reloj": {
        "observacion": "Se detectó un reloj visible en la imagen.",
        "interpretacion": "Su presencia constituye una observación de entorno neutral; requiere verificar contexto de la actividad o reglamento aplicable.",
        "limite": "La detección de un reloj no implica uso indebido ni conducta académica irregular.",
    },
    "audifonos": {
        "observacion": "Se detectaron audífonos visibles en la imagen.",
        "interpretacion": "Podría justificarse verificar si el uso de audio forma parte de una actividad autorizada o si interfiere con la atención presencial.",
        "limite": "Una captura puntual no acredita desatención ni afecta por sí sola indicadores académicos.",
    },
    "laptop": {
        "observacion": "Se detectó un computador portátil en el encuadre.",
        "interpretacion": "Elemento contextual compatible con trabajo en aula o evaluación digital según las reglas de la sesión.",
        "limite": "Su presencia no indica conducta anómala por sí sola.",
    },
    "libro": {
        "observacion": "Se detectó un libro en la imagen.",
        "interpretacion": "Material de apoyo visible cuyo uso permitido o restringido depende del contexto de la clase o evaluación.",
        "limite": "No permite inferir desempeño académico ni intención sin reglas de sesión.",
    },
    "cuaderno": {
        "observacion": "Se detectó un cuaderno en la imagen.",
        "interpretacion": "Material habitual de estudio o toma de notas según la actividad docente en curso.",
        "limite": "No constituye indicador de riesgo académico.",
    },
    "mochila": {
        "observacion": "Se detectó una mochila en el área capturada.",
        "interpretacion": "Objeto de entorno sin implicación directa sobre la atención o expresión.",
        "limite": "No aporta evidencia sobre participación o resultados académicos.",
    },
}


def _nombre(cat):
    return NOMBRES_CATEGORIAS.get(str(cat).lower(), str(cat).lower())


def construir_interpretacion_visual(resultado_imagen, objeto_det=None, *, resultado_audio=None, resultado_academico=None):
    """Transforma salidas de modelos en observaciones, hipótesis, predicciones, limitaciones y evidencia requerida."""
    observaciones = []
    clasificaciones = []
    hipotesis = []
    predicciones = []
    limitaciones = list(LIMITACIONES_BASE_IMAGEN)
    evidencia_requerida = [EVIDENCIA_ADICIONAL_BASE]

    if not resultado_imagen or resultado_imagen.get("estado") == "sin_entrada":
        return {
            "version": "1.0.0",
            "observaciones": [],
            "clasificaciones": [],
            "hipotesis": [],
            "predicciones": [],
            "limitaciones": limitaciones,
            "evidencia_requerida": evidencia_requerida,
            "resumen": {
                "observacion_visual": "No se recibió fotografía ni fotograma para evaluación visual.",
                "interpretacion": "Las demás modalidades pueden evaluarse de forma independiente sin requerir imagen.",
                "informacion_adicional_necesaria": EVIDENCE_IF_NEEDED(resultado_audio, resultado_academico),
            },
        }

    estado = resultado_imagen.get("estado")
    det_facial = resultado_imagen.get("deteccion_facial")
    rostros = int(resultado_imagen.get("rostros_detectados") or 0)
    puntajes = resultado_imagen.get("puntajes_calibrados") or resultado_imagen.get("puntajes_no_calibrados") or {}
    criterio = resultado_imagen.get("criterio_abstencion") or {}
    hip_modelo = resultado_imagen.get("hipotesis") or {}
    modelo_info = resultado_imagen.get("modelo") or {}
    objetos = objeto_det if objeto_det is not None else resultado_imagen.get("deteccion_objetos")

    # 1. Observaciones fácticas de rostros y encuadre
    if rostros == 1:
        cal = resultado_imagen.get("calidad_entrada") or {}
        rec = cal.get("recorte_px")
        detalle_rec = f" (recorte {rec[0]} × {rec[1]} px)" if isinstance(rec, list) and len(rec) == 2 else ""
        observaciones.append({
            "tipo": "rostro",
            "hecho": f"Se detectó 1 rostro frontal en la imagen{detalle_rec} con identidad desconocida.",
            "respaldo": resultado_imagen.get("detector_facial", "opencv_haar_frontalface_alt"),
        })
    elif rostros > 1:
        observaciones.append({
            "tipo": "rostro",
            "hecho": f"Se detectaron {rostros} rostros en la imagen; la clasificación individual automática se omite.",
            "respaldo": resultado_imagen.get("detector_facial", "opencv_haar_frontalface_alt"),
        })
    elif det_facial == "sin_recorte_facial":
        observaciones.append({
            "tipo": "rostro",
            "hecho": "Se recibieron detecciones externas sin una captura para evaluar rostros.",
            "respaldo": "detecciones_externas",
        })
    elif estado != "imagen_invalida":
        observaciones.append({
            "tipo": "rostro",
            "hecho": "No se detectó ningún rostro frontal visible en el encuadre.",
            "respaldo": resultado_imagen.get("detector_facial", "opencv_haar_frontalface_alt"),
        })

    if isinstance(objetos, dict):
        for senal in objetos.get("senales_encuadre") or []:
            cod = senal.get("codigo")
            if cod in {"rostro_pequeno", "rostro_parcial_o_borde", "iluminacion_baja", "sobreexposicion", "nitidez_reducida"}:
                observaciones.append({
                    "tipo": "calidad_visual",
                    "codigo": cod,
                    "hecho": senal.get("descripcion"),
                    "respaldo": senal.get("origen", "opencv_calidad_visual"),
                })

    # 2. Clasificación / Hipótesis de expresión facial
    observacion_visual = ""
    interpretacion_texto = TEXTO_INTERPRETACION_FACIAL

    top_cat = None
    top_pct = None
    if puntajes:
        top_cat, top_prob = max(puntajes.items(), key=lambda kv: kv[1])
        top_pct = round(float(top_prob) * 100, 1)
    elif hip_modelo.get("categoria") and hip_modelo.get("probabilidad") is not None:
        top_cat = hip_modelo["categoria"]
        top_pct = round(float(hip_modelo["probabilidad"]) * 100, 1)

    if estado == "estimacion_experimental" and top_cat is not None:
        cat_txt = _nombre(resultado_imagen.get("expresion") or top_cat)
        observacion_visual = (
            f"La expresión facial observable con mayor compatibilidad es {cat_txt} ({top_pct:.1f} %), "
            f"superando el umbral de confianza (≥ 55 %) y el margen mínimo (≥ 10 %)."
        )
        observaciones.append({
            "tipo": "expresion_concluyente",
            "hecho": observacion_visual,
            "respaldo": f"{modelo_info.get('algoritmo', 'facial')} ({modelo_info.get('version', 'vigente')})",
            "confianza": round(float(top_pct) / 100.0, 4),
        })
        clasificaciones.append({
            "tarea": "expresion_facial_observable",
            "estado": "concluyente",
            "categoria": cat_txt,
            "probabilidad": round(float(top_pct) / 100.0, 4),
            "calibrado": "puntajes_calibrados" in resultado_imagen,
            "modelo_version": modelo_info.get("version"),
            "algoritmo": modelo_info.get("algoritmo"),
        })
        if cat_txt in {"tristeza", "enojo"}:
            for causa in HIPOTESIS_CONTEXTUALES_GENERALES:
                hipotesis.append({
                    "tipo": "posibilidad_general_no_evaluada",
                    "descripcion": causa,
                    "es_prediccion_individual": False,
                    "probabilidad_asignada": None,
                })
    elif estado == "abstencion" and top_cat is not None:
        cat_txt = _nombre(top_cat)
        observacion_visual = (
            f"La categoría con mayor probabilidad es {cat_txt} ({top_pct:.1f} %). "
            f"Sin embargo, la confianza no supera el umbral necesario para una clasificación concluyente."
        )
        observaciones.append({
            "tipo": "expresion_top1",
            "hecho": observacion_visual,
            "respaldo": f"{modelo_info.get('algoritmo', 'facial')} ({modelo_info.get('version', 'vigente')})",
            "confianza": round(float(top_pct) / 100.0, 4),
        })
        clasificaciones.append({
            "tarea": "expresion_facial_observable",
            "estado": "abstencion",
            "categoria_hipotesis": cat_txt,
            "probabilidad_maxima": round(float(top_pct) / 100.0, 4),
            "calibrado": "puntajes_calibrados" in resultado_imagen,
            "criterio_abstencion": criterio,
            "modelo_version": modelo_info.get("version"),
        })
        hipotesis.append({
            "tipo": "hipotesis_facial_no_concluyente",
            "descripcion": f"Hipótesis preliminar no concluyente hacia expresión «{cat_txt}» ({top_pct:.1f} %); la evidencia es insuficiente para confirmar la categoría.",
            "es_prediccion_individual": False,
            "probabilidad_asignada": round(float(top_pct) / 100.0, 4),
        })
        for causa in HIPOTESIS_CONTEXTUALES_GENERALES:
            hipotesis.append({
                "tipo": "posibilidad_general_no_evaluada",
                "descripcion": causa,
                "es_prediccion_individual": False,
                "probabilidad_asignada": None,
            })
    elif estado == "evidencia_insuficiente":
        if det_facial == "multiples_rostros":
            observacion_visual = (
                f"Se detectaron {rostros} rostros en la fotografía; el sistema evita clasificar una expresión individual "
                "cuando hay varias personas en el mismo encuadre."
            )
            interpretacion_texto = (
                "La presencia de múltiples rostros impide atribuir una expresión única sin detección y seguimiento individual autorizado."
            )
        elif det_facial == "rostro_pequeno":
            observacion_visual = "Se detectó un rostro con tamaño inferior a 64 × 64 píxeles; la resolución es insuficiente para evaluar expresiones."
            interpretacion_texto = "Con tan pocos píxeles en el rostro, las características faciales pierden precisión y deben omitirse."
        elif det_facial == "calidad_insuficiente":
            observacion_visual = "La calidad visual declarada (< 0.40) es insuficiente para una clasificación fiable."
            interpretacion_texto = "Evita emitir clasificaciones sobre capturas degradadas o borrosas."
        else:
            observacion_visual = "No se detectó un rostro frontal visible en la fotografía (posible persona fuera del encuadre, perfil lateral o iluminación escasa)."
            interpretacion_texto = "Sin rostro frontal visible no es posible estimar expresiones faciales ni debe asumirse un estado del estudiante."
    elif estado == "modelo_no_disponible":
        observacion_visual = "Se detectó 1 rostro válido, pero el clasificador facial real no se encuentra disponible en este entorno."
        interpretacion_texto = "El detector geométrico operó normalmente; la clasificación de expresión quedó omitida hasta habilitar los pesos."
    elif estado == "imagen_invalida":
        observacion_visual = resultado_imagen.get("motivo") or "El archivo enviado no corresponde a una imagen válida."
        interpretacion_texto = "No se pudo decodificar la fotografía enviada."

    # 3. Objetos visibles detectados de forma separada (YOLOv8n / adaptadores externos)
    if isinstance(objetos, dict):
        detectados = objetos.get("objetos_no_persona") or []
        for obj in detectados:
            clase = obj.get("clase", "")
            conf_pct = round(float(obj.get("confianza", 0)) * 100, 1)
            guia = GUIA_OBJETOS.get(clase)
            obs_txt = guia["observacion"] if guia else f"Se detectó un objeto «{obj.get('etiqueta', clase)}» en la imagen."
            obs_txt = f"{obs_txt[:-1]} (confianza {conf_pct:.1f} %)."
            observaciones.append({
                "tipo": "objeto",
                "clase": clase,
                "hecho": obs_txt,
                "respaldo": f"{obj.get('origen', 'detector_objetos')} ({objetos.get('modelo', {}).get('nombre', 'best.pt')})",
                "confianza": obj.get("confianza"),
            })
            if guia:
                hipotesis.append({
                    "tipo": "interpretacion_contextual_objeto",
                    "clase": clase,
                    "descripcion": guia["interpretacion"],
                    "es_prediccion_individual": False,
                    "probabilidad_asignada": None,
                })
                if guia["limite"] not in limitaciones:
                    limitaciones.append(guia["limite"])
        if objetos.get("estado") in {"modelo_no_disponible", "error_inferencia"}:
            limitaciones.append("El detector local de objetos no estuvo disponible para esta captura; únicamente se evaluó el rostro.")

    # 4. Evidencia adicional solicitada y predicciones respaldadas
    if not resultado_academico or resultado_academico.get("estado") != "estimacion_experimental":
        pass  # El mensaje base de evidencia académica ya está incluido en evidencia_requerida.
    else:
        prob_no = float(resultado_academico.get("probabilidad_no_aprueba", 0.0))
        predicciones.append({
            "tipo": "desempeno_academico_independiente",
            "desenlace": resultado_academico.get("desenlace", "G3 < 10/20"),
            "desenlace_estimado": resultado_academico.get("desenlace_estimado"),
            "probabilidad_no_aprueba": round(prob_no, 4),
            "nota": "Calculado exclusivamente a partir de calificaciones G1/G2; independiente de la fotografía.",
        })

    if not resultado_audio or resultado_audio.get("estado") in {None, "sin_entrada"}:
        evidencia_requerida.append("Audio PCM16 compatible si se desea evaluar de forma independiente la modalidad acústica (RAVDESS).")
    evidencia_requerida.append("Secuencias temporales del módulo VIDEO si se requiere analizar continuidad de atención o permanencia de objetos.")

    return {
        "version": "1.0.0",
        "observaciones": observaciones,
        "clasificaciones": clasificaciones,
        "hipotesis": hipotesis,
        "predicciones": predicciones,
        "limitaciones": limitaciones,
        "evidencia_requerida": evidencia_requerida,
        "resumen": {
            "observacion_visual": observacion_visual,
            "interpretacion": interpretacion_texto,
            "informacion_adicional_necesaria": EVIDENCE_IF_NEEDED(resultado_audio, resultado_academico),
        },
    }


def EVIDENCE_IF_NEEDED(resultado_audio, resultado_academico):
    if resultado_academico and resultado_academico.get("estado") in {"estimacion_experimental", "abstencion"}:
        return (
            "Se dispone de evaluación académica paralela e independiente; recuerda no combinar ni atribuir "
            "expresiones faciales a causalidad escolar sin evidencia longitudinal."
        )
    return EVIDENCIA_ADICIONAL_BASE
