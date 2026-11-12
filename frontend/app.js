"use strict";

const elemento = (id) => (typeof document !== "undefined" && document.getElementById ? document.getElementById(id) : null);

// ============================================================================
// AulaPredict · Módulo Especializado de Predicción Facial y Recepción Automática
// Cámara local / fotografía + Evaluación independiente + Proyección Académica
// ============================================================================

let modoCapturaCongelada = false;
let panelEstudiantesExpandido = false;
let animCanvasId = null;

let ultimoResultadoImagen = null;
let ultimoResultadoVideo = null;
let ultimoResultadoAudio = null;
let ultimoResultadoAcademico = null;
let ultimaInterpretacionVisual = null;
let ultimaFusion = null;
let ultimaSincronizacion = null;
let ultimaSecuenciaRecepcion = 0;

function obtenerBaseBackend() {
  return typeof location !== "undefined" && location.origin && location.protocol !== "file:"
    ? location.origin
    : "http://127.0.0.1:8001";
}

function resolverIdentidadVisual(visual) {
  if (!visual || typeof visual !== "object") return "Identidad desconocida";
  if (visual.estado_identidad === "ambigua") return "Identidad ambigua / contradictoria";
  if (visual.identidad_verificada === true && visual.estudiante_id) {
    return `Identidad verificada: ${visual.estudiante_id}`;
  }
  return "Identidad desconocida";
}

const GUIA_OBJETOS_UI = {
  telefono: { icono: "📱", texto: "Se detectó un teléfono móvil; la presencia del dispositivo podría justificar revisar si hay actividad autorizada o posible interrupción de atención.", limite: "Una fotografía aislada no demuestra distracción ni bajo rendimiento." },
  reloj: { icono: "⌚", texto: "Se detectó un reloj visible; observación neutral sujeta al reglamento o actividad de aula.", limite: "Detectar un reloj no acredita conducta académica irregular." },
  audifonos: { icono: "🎧", texto: "Se detectaron audífonos; requiere confirmar si corresponden a material de clase o uso restringido.", limite: "Una captura puntual no demuestra desatención." },
  laptop: { icono: "💻", texto: "Se detectó un computador portátil en el encuadre; compatible con trabajo digital según contexto de sesión.", limite: "Su presencia no implica conducta anómala." },
  libro: { icono: "📖", texto: "Se detectó un libro en la imagen; elemento de apoyo sujeto a las reglas de la actividad.", limite: "No permite inferir desempeño sin contexto docente." },
  cuaderno: { icono: "📓", texto: "Se detectó un cuaderno en la captura; material habitual de estudio.", limite: "No constituye indicador de riesgo académico." },
  mochila: { icono: "🎒", texto: "Se detectó una mochila en el entorno.", limite: "Sin implicación directa sobre atención o rendimiento." }
};

const POSIBILIDADES_GENERALES_UI = [
  "Cansancio o fatiga acumulada",
  "Estrés o carga relacionada con actividades académicas",
  "Concentración o expresión facial habitual en reposo",
  "Situaciones personales externas no observables ni evaluadas por el sistema"
];

function construirInterpretacionLocal(img, acad, aud, backendInterp = null) {
  if (backendInterp && typeof backendInterp === "object" && backendInterp.resumen) {
    return backendInterp;
  }
  const obs = [];
  const hip = [];
  const lim = [
    "La expresión facial observada es compatible con varias interpretaciones. No permite establecer por sí sola el estado emocional real del estudiante.",
    "El sistema no afirma ni diagnostica problemas familiares, depresión, ansiedad, estrés clínico ni rendimiento futuro a partir de una fotografía."
  ];
  const hipImg = extraerHipotesis(img);
  const detObj = img?.deteccion_objetos;
  const objetos = detObj?.objetos_no_persona || [];
  let obsTexto = "No se recibió fotografía ni fotograma para evaluación visual.";
  let interpTexto = "Las demás modalidades pueden evaluarse de forma independiente sin requerir imagen.";
  if (img) {
    const rostros = img.rostros_detectados ?? (img.deteccion_facial === "sin_rostro" ? 0 : 1);
    interpTexto = "La expresión facial observada es compatible con varias interpretaciones. No permite establecer por sí sola el estado emocional real del estudiante.";
    if (img.deteccion_facial === "sin_recorte_facial") {
      obsTexto = "Se recibieron detecciones externas sin una captura facial.";
      interpTexto = "Las detecciones de objetos se pueden mostrar con la procedencia del productor.";
    } else if (img.estado === "estimacion_experimental" && hipImg) {
      obsTexto = `Expresión facial observable con mayor compatibilidad: ${hipImg.label.toLowerCase()} (${hipImg.pctTexto}).`;
      if (["tristeza", "enojo"].includes(hipImg.categoria)) {
        POSIBILIDADES_GENERALES_UI.forEach(d => hip.push({ tipo: "posibilidad_general_no_evaluada", descripcion: d, es_prediccion_individual: false, probabilidad_asignada: null }));
      }
    } else if (img.estado === "abstencion" && hipImg) {
      obsTexto = `La categoría con mayor probabilidad es ${hipImg.label.toLowerCase()} (${hipImg.pctTexto}). Sin embargo, la confianza no supera el umbral necesario para una clasificación concluyente.`;
      POSIBILIDADES_GENERALES_UI.forEach(d => hip.push({ tipo: "posibilidad_general_no_evaluada", descripcion: d, es_prediccion_individual: false, probabilidad_asignada: null }));
    } else if (img.deteccion_facial === "multiples_rostros" || rostros > 1) {
      obsTexto = `Se detectaron ${rostros} rostros en la imagen; no se clasifica una expresión individual.`;
      interpTexto = "Múltiples rostros impiden atribuir una única expresión o identidad sin seguimiento autorizado.";
    } else if (img.deteccion_facial === "rostro_pequeno") {
      obsTexto = "Se detectó 1 rostro con tamaño inferior a 64 × 64 px; resolución insuficiente para clasificar.";
    } else if (img.deteccion_facial === "sin_rostro" || rostros === 0) {
      obsTexto = "No se detectó un rostro frontal visible en la fotografía.";
      interpTexto = "Sin rostro frontal visible no es posible estimar expresión facial.";
    }
    for (const o of objetos) {
      const conf = typeof o.confianza === "number" ? `${(o.confianza * 100).toFixed(1)}%` : "—";
      const guia = GUIA_OBJETOS_UI[o.clase];
      obs.push({ tipo: "objeto", clase: o.clase, hecho: `${o.etiqueta || formatearCategoria(o.clase)} (${conf})`, confianza: o.confianza });
      if (guia) {
        hip.push({ tipo: "interpretacion_contextual_objeto", clase: o.clase, descripcion: guia.texto, es_prediccion_individual: false, probabilidad_asignada: null });
        if (!lim.includes(guia.limite)) lim.push(guia.limite);
      }
    }
    if (detObj?.estado === "modelo_no_disponible" || detObj?.estado === "error_inferencia") {
      lim.push("El detector local de objetos no estuvo disponible para esta captura; únicamente se evaluó el rostro.");
    }
  }
  const evReq = acad && acad.estado === "estimacion_experimental"
    ? "Se dispone de evaluación académica paralela e independiente; recuerda no atribuir causalidad escolar desde expresiones faciales."
    : "Para analizar posibles relaciones con el desempeño académico se requieren registros de asistencia, participación, evaluaciones u otras evidencias pertinentes.";
  return {
    observaciones: obs,
    hipotesis: hip,
    limitaciones: lim,
    evidencia_requerida: [evReq],
    resumen: { observacion_visual: obsTexto, interpretacion: interpTexto, informacion_adicional_necesaria: evReq }
  };
}

function escaparHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const ETIQUETAS_LEGIBLES = {
  alegria: "Alegría",
  enojo: "Enojo",
  neutral: "Neutral",
  tristeza: "Tristeza",
  calma: "Calma",
  asco: "Asco",
  miedo: "Miedo",
  sorpresa: "Sorpresa",
  aprueba: "Aprueba",
  no_aprueba: "No aprueba",
  telefono: "Teléfono móvil",
  audifonos: "Audífonos",
  laptop: "Computador portátil"
};

const ERRORES_CAPTURA = {
  400: "El servidor no pudo leer la solicitud.",
  413: "La imagen supera el tamaño admitido por el servidor.",
  422: "El servidor rechazó el formato de la imagen.",
  500: "El motor de predicción no pudo analizar la imagen. Verifica el servidor y sus modelos."
};

const ESTADOS_FACIALES = {
  estimacion_experimental: "Rostro detectado · Clasificación observable disponible",
  abstencion: "Rostro detectado · Abstención preventiva por incertidumbre",
  evidencia_insuficiente: "Evidencia facial insuficiente",
  imagen_invalida: "El servidor no pudo decodificar la foto",
  modelo_no_disponible: "Rostro detectado · Modelo facial no disponible",
  error_inferencia: "Error técnico durante el análisis facial"
};

const ESTADOS_DETECCION_FACIAL = {
  sin_rostro: "No se detectó ningún rostro. Prueba con un rostro frontal visible.",
  rostro_pequeno: "Rostro detectado · Demasiado pequeño para clasificar",
  multiples_rostros: "Se detectaron varios rostros. Prueba con un solo rostro.",
  calidad_insuficiente: "Rostro detectado · Calidad insuficiente"
};

function formatearCategoria(categoria, preservarSinTilde = false) {
  if (!categoria) return "Sin clasificar";
  if (preservarSinTilde) {
    return categoria.charAt(0).toUpperCase() + categoria.slice(1).replaceAll("_", " ");
  }
  return ETIQUETAS_LEGIBLES[categoria] || (categoria.charAt(0).toUpperCase() + categoria.slice(1).replaceAll("_", " "));
}

function traducirMotivosAbstencion(criterio) {
  const motivos = criterio?.motivos;
  if (!motivos || !motivos.length) return "confianza o margen insuficientes";
  const umbralTxt = criterio?.umbral != null ? `${(criterio.umbral * 100).toFixed(0)}%` : "55%";
  const margenTxt = criterio?.margen_minimo != null ? `${(criterio.margen_minimo * 100).toFixed(0)}%` : "10%";
  return motivos.map(m =>
    m === "probabilidad_insuficiente" ? `probabilidad insuficiente (< ${umbralTxt})`
      : m === "margen_insuficiente" ? `margen insuficiente (< ${margenTxt})`
        : m.replaceAll("_", " ")
  ).join(" y ");
}

function extraerHipotesis(resultado) {
  if (!resultado) return null;
  const puntajes = resultado.puntajes_calibrados || resultado.puntajes_no_calibrados;
  let categoria = resultado.hipotesis?.categoria ?? null;
  let probabilidad = resultado.hipotesis?.probabilidad ?? null;
  if ((!categoria || typeof probabilidad !== "number") && puntajes) {
    const ordenado = Object.entries(puntajes).sort((a, b) => b[1] - a[1]);
    if (ordenado.length) {
      categoria = ordenado[0][0];
      probabilidad = ordenado[0][1];
    }
  }
  if (!categoria && (resultado.expresion || resultado.expresion_vocal || resultado.desenlace_estimado)) {
    categoria = resultado.expresion || resultado.expresion_vocal || resultado.desenlace_estimado;
  }
  if (!categoria) return null;
  const pct = typeof probabilidad === "number" ? `${(probabilidad * 100).toFixed(1)}%` : "—";
  const pctNum = typeof probabilidad === "number" ? Math.max(0, Math.min(100, probabilidad * 100)) : 0;
  return {
    categoria,
    label: formatearCategoria(categoria),
    probabilidad,
    pctTexto: pct,
    pctNum,
    concluyente: resultado.estado === "estimacion_experimental",
    motivosTexto: traducirMotivosAbstencion(resultado.criterio_abstencion),
    puntajesOrdenados: puntajes ? Object.entries(puntajes).sort((a, b) => b[1] - a[1]) : []
  };
}

function describirModeloExperimental(modelo) {
  if (!modelo) return "HOG+SVM · fase8-1.0 · CMU Face Images";
  const fuente = modelo.origen ?? modelo.dataset?.nombre ?? modelo.dataset?.fuente ?? modelo.dataset?.dominio;
  return [modelo.nombre ?? modelo.algoritmo, modelo.version, fuente].filter(Boolean).join(" · ");
}

function lineasDemoModelo(nombre, resultado) {
  const lineas = [`${nombre} · ${String(resultado.estado || "").replaceAll("_", " ")}`];
  if (resultado.modelo) lineas.push(describirModeloExperimental(resultado.modelo));
  const categoria = resultado.expresion ?? resultado.expresion_vocal ?? resultado.desenlace_estimado;
  if (categoria) lineas.push(`Categoría · ${categoria}`);
  if (Number.isInteger(resultado.rostros_detectados)) lineas.push(`Rostros detectados · ${resultado.rostros_detectados}`);
  if (resultado.motivo) lineas.push(String(resultado.motivo).replaceAll("_", " "));
  if (resultado.criterio_abstencion?.motivos?.length) {
    lineas.push(resultado.criterio_abstencion.motivos.join(", ").replaceAll("_", " "));
  }
  if (resultado.puntajes_calibrados) {
    lineas.push(`Probabilidades · ${Object.entries(resultado.puntajes_calibrados).map(([k, p]) => `${k} ${p.toFixed(3)}`).join(" · ")}`);
  }
  return lineas;
}

function listaAccesible(contenedor, titulo, textos) {
  if (!contenedor || !textos || !textos.length || typeof document?.createElement !== "function") return;
  const encabezado = document.createElement("h4");
  encabezado.textContent = titulo;
  const ul = document.createElement("ul");
  for (const texto of textos) {
    const li = document.createElement("li");
    li.textContent = texto;
    ul.append(li);
  }
  contenedor.append(encabezado, ul);
}

function setBarraExpresion(pctId, barId, prob) {
  const pctEl = elemento(pctId);
  const barEl = elemento(barId);
  const texto = typeof prob === "number" ? `${(prob * 100).toFixed(1)}%` : "0%";
  const ancho = typeof prob === "number" ? `${Math.max(0, Math.min(100, prob * 100)).toFixed(1)}%` : "0%";
  if (pctEl) pctEl.textContent = texto;
  if (barEl) barEl.style.width = ancho;
}

// ============================================================================
// RENDERIZADO DE PANELES DE DETECCIÓN, RECONOCIMIENTO Y RESULTADOS
// ============================================================================

function renderizarChipsObjetos(visual) {
  const detObj = visual?.deteccion_objetos;
  if (!detObj) return "";
  const objs = detObj.objetos_no_persona || [];
  const senales = (detObj.senales_encuadre || []).filter(s => ["rostro_parcial_o_borde", "iluminacion_baja", "sobreexposicion", "nitidez_reducida"].includes(s.codigo));
  if (!objs.length && !senales.length) return "";
  const chipsObj = objs.map(o => {
    const ic = GUIA_OBJETOS_UI[o.clase]?.icono || "📦";
    const pct = typeof o.confianza === "number" ? ` ${(o.confianza * 100).toFixed(0)}%` : "";
    return `<span class="object-chip">${ic} ${escaparHtml(o.etiqueta || formatearCategoria(o.clase))}${pct}</span>`;
  });
  const chipsSen = senales.map(s => `<span class="quality-chip-warn">⚠️ ${escaparHtml(s.codigo.replaceAll("_", " "))}</span>`);
  return `<div class="object-chips-row">${chipsObj.join("")}${chipsSen.join("")}</div>`;
}

function renderizarDetalleVisual(visual) {
  const card = elemento("students-selection-card");
  const panelTitle = elemento("students-panel-title");
  const panelSubtitle = elemento("students-panel-subtitle");
  const countBadge = elemento("students-count-badge");
  const toggleBtn = elemento("btn-toggle-students-panel");
  const toggleIcon = elemento("students-toggle-icon");
  const toggleLabel = elemento("students-toggle-label");
  const container = elemento("students-grid");

  if (card) card.classList.add("compact-mode");
  if (panelTitle) panelTitle.textContent = "🎯 Detección y Análisis Facial";
  if (!container) return;

  if (!visual) {
    if (countBadge) countBadge.textContent = "Esperando captura";
    if (panelSubtitle) panelSubtitle.textContent = "Captura o sube una fotografía para detectar el rostro y estimar su expresión";
    if (toggleBtn) toggleBtn.hidden = true;
    container.innerHTML = `
      <div class="facial-waiting-compact">
        <span class="facial-waiting-icon" aria-hidden="true">📸</span>
        <div class="facial-waiting-text">
          <strong>Sin resultados de análisis todavía</strong>
          <p>Enciende la cámara o sube una fotografía para detectar el rostro sin asociar identidades.</p>
        </div>
      </div>
    `;
    return;
  }

  const rostros = visual.rostros_detectados ?? (visual.deteccion_facial === "sin_rostro" ? 0 : 1);
  const estado = visual.estado;
  const det = visual.deteccion_facial;
  const identidadTxt = resolverIdentidadVisual(visual);
  const chipsHtml = renderizarChipsObjetos(visual);

  if (det === "sin_recorte_facial") {
    if (countBadge) countBadge.textContent = "Rostros sin evaluar";
    if (panelSubtitle) panelSubtitle.textContent = "Detecciones externas recibidas sin captura facial";
    if (toggleBtn) toggleBtn.hidden = true;
    container.innerHTML = `<div class="facial-compact-card">${chipsHtml}</div>`;
    return;
  }

  if (rostros === 1 || det === "rostro_detectado" || det === "rostro_pequeno" || estado === "abstencion" || estado === "estimacion_experimental") {
    if (countBadge) countBadge.textContent = "1 rostro detectado";
    if (panelSubtitle) panelSubtitle.textContent = `Análisis individual de expresión observable · ${identidadTxt}`;
    if (toggleBtn) {
      toggleBtn.hidden = false;
      toggleBtn.setAttribute?.("aria-expanded", String(panelEstudiantesExpandido));
    }
    if (toggleIcon) toggleIcon.textContent = panelEstudiantesExpandido ? "▲" : "▼";
    if (toggleLabel) toggleLabel.textContent = panelEstudiantesExpandido ? "Contraer" : "Detalles";

    const disponible = estado === "estimacion_experimental" || estado === "abstencion";
    const badgeTexto = disponible ? "Resultado facial disponible"
      : (det === "rostro_pequeno" ? "Rostro pequeño" : "Evidencia insuficiente");
    const badgeClase = disponible ? "available" : "abstention";

    if (!panelEstudiantesExpandido) {
      container.innerHTML = `
        <div class="facial-compact-card">
          <div class="facial-compact-header-row">
            <div class="facial-compact-id-group">
              <div class="facial-compact-avatar" aria-hidden="true">👤</div>
              <div class="facial-compact-identity">Rostro 1 · ${escaparHtml(identidadTxt)}</div>
            </div>
            <div class="facial-compact-status-badge ${badgeClase}">
              <span>●</span> ${escaparHtml(badgeTexto)}
            </div>
          </div>
          ${chipsHtml}
          <p class="facial-compact-hint">Resultado facial disponible debajo sin asociar perfiles personales ni registros académicos.</p>
        </div>
      `;
    } else {
      const dim = visual.calidad_entrada?.recorte_px
        ? `${visual.calidad_entrada.recorte_px[0]} × ${visual.calidad_entrada.recorte_px[1]} px`
        : (visual.rostros?.[0] ? `${visual.rostros[0].ancho} × ${visual.rostros[0].alto} px` : "Recorte frontal ≥ 64 × 64 px");
      const descMod = visual.modelo ? describirModeloExperimental(visual.modelo) : "HOG + SVM (fase8-1.0 · CMU Face Images)";
      const estadoDetObj = visual.deteccion_objetos?.estado
        ? `YOLOv8n (best.pt) · ${visual.deteccion_objetos.estado.replaceAll("_", " ")}`
        : "No ejecutado";
      const detIdentidad = visual.identidad_verificada
        ? `${identidadTxt} (asociación explícita verificada)`
        : "No atribuida (análisis biométrico no vinculante)";
      container.innerHTML = `
        <div class="facial-compact-card expanded">
          <div class="facial-compact-header-row">
            <div class="facial-compact-id-group">
              <div class="facial-compact-avatar" aria-hidden="true">👤</div>
              <div class="facial-compact-identity">Rostro 1 · ${escaparHtml(identidadTxt)}</div>
            </div>
            <div class="facial-compact-status-badge ${badgeClase}">
              <span>●</span> ${escaparHtml(badgeTexto)}
            </div>
          </div>
          ${chipsHtml}
          <div class="facial-details-box">
            <div class="facial-detail-item"><span>Detector facial:</span><strong>${escaparHtml(visual.detector_facial || "OpenCV Haar Cascade (frontalface_alt)")}</strong></div>
            <div class="facial-detail-item"><span>Clasificador:</span><strong>${escaparHtml(descMod)}</strong></div>
            <div class="facial-detail-item"><span>Detector objetos:</span><strong>${escaparHtml(estadoDetObj)}</strong></div>
            <div class="facial-detail-item"><span>Dimensión recorte:</span><strong>${escaparHtml(dim)}</strong></div>
            <div class="facial-detail-item"><span>Identidad:</span><strong>${escaparHtml(detIdentidad)}</strong></div>
          </div>
        </div>
      `;
    }
    return;
  }

  if (toggleBtn) toggleBtn.hidden = true;
  if (rostros === 0 || det === "sin_rostro") {
    if (countBadge) countBadge.textContent = "No se detectaron rostros";
    if (panelSubtitle) panelSubtitle.textContent = "Captura facial individual sin rostros detectados";
    container.innerHTML = `
      <div class="facial-empty-compact">
        <span class="facial-empty-icon" aria-hidden="true">🚫</span>
        <div class="facial-empty-text">
          <strong>No se detectaron rostros</strong>
          <p>Asegúrate de que haya un rostro frontal visible y con iluminación adecuada.</p>
          ${chipsHtml}
        </div>
      </div>
    `;
    return;
  }

  if (rostros > 1 || det === "multiples_rostros") {
    if (countBadge) countBadge.textContent = `${rostros} rostros detectados`;
    if (panelSubtitle) panelSubtitle.textContent = "Se detectaron múltiples rostros · Se requiere uno solo para clasificar";
    container.innerHTML = `
      <div class="facial-empty-compact">
        <span class="facial-empty-icon" aria-hidden="true">👥</span>
        <div class="facial-empty-text">
          <strong>${rostros} rostros detectados</strong>
          <p>Encuadra un solo rostro frontal para evaluar su expresión sin atribución de identidad.</p>
          ${chipsHtml}
        </div>
      </div>
    `;
    return;
  }

  if (countBadge) countBadge.textContent = "Error de análisis";
  if (panelSubtitle) panelSubtitle.textContent = "No se pudo completar el análisis facial";
  container.innerHTML = `
    <div class="facial-empty-compact">
      <span class="facial-empty-icon" aria-hidden="true">⚠️</span>
      <div class="facial-empty-text">
        <strong>Error técnico durante el análisis facial</strong>
        <p>${escaparHtml(visual.motivo || ESTADOS_FACIALES[estado] || "Puedes reintentar la captura o subir otra imagen.")}</p>
        ${chipsHtml}
      </div>
    </div>
  `;
}

function renderizarEstadoEsperaPaneles() {
  ultimoResultadoImagen = null;
  ultimoResultadoVideo = null;
  ultimoResultadoAudio = null;
  ultimoResultadoAcademico = null;
  ultimaInterpretacionVisual = null;
  ultimaFusion = null;
  ultimaSincronizacion = null;
  panelEstudiantesExpandido = false;

  renderizarDetalleVisual(null);

  const facialTitle = elemento("facial-card-title");
  if (facialTitle) facialTitle.textContent = "🔮 Reconocimiento Facial (En espera)";
  const facialSub = elemento("facial-card-sublabel");
  if (facialSub) facialSub.textContent = "Probabilidades de las 4 expresiones observables · En espera";
  const facialFooter = elemento("facial-card-footer");
  if (facialFooter) facialFooter.innerHTML = "<span>Modelo Facial HOG+SVM (fase8-1.0) · Umbral ≥ 55% y margen ≥ 10%</span>";

  ["miedo", "sorpresa", "disgusto"].forEach(k => {
    const item = elemento(`emo-item-${k}`);
    if (item) item.style.display = "none";
  });
  ["neutral", "felicidad", "tristeza", "enojo", "miedo", "sorpresa", "disgusto"].forEach(k => {
    setBarraExpresion(`emo-pct-${k}`, `emo-bar-${k}`, null);
  });

  const domEmoText = elemento("dominant-emotion-text");
  if (domEmoText) domEmoText.textContent = "Sin evaluar — Esperando captura";
  const actionBadge = elemento("student-action-badge");
  if (actionBadge) actionBadge.textContent = "Análisis facial individual · Identidad desconocida";

  const eventsTitle = elemento("events-card-title");
  if (eventsTitle) eventsTitle.textContent = "📋 Resultados Predictivos (En espera)";
  const causesList = elemento("causes-list");
  if (causesList) {
    causesList.innerHTML = '<div class="prediction-empty-notice"><span>📸</span><span>No existen resultados todavía. Captura un fotograma o sube una imagen para evaluar el modelo facial.</span></div>';
  }
  const consequencesList = elemento("consequences-list");
  if (consequencesList) {
    consequencesList.innerHTML = '<div class="prediction-empty-notice"><span>ℹ️</span><span>Ante incertidumbre, ausencia de rostro o múltiples rostros se explicará el motivo de abstención sin inventar predicciones.</span></div>';
  }
  const eventsFooter = elemento("events-card-footer");
  if (eventsFooter) eventsFooter.innerHTML = "<span>Inferencia independiente por modalidad · Sin sucesos artificiales</span>";

  const academicTitle = elemento("academic-card-title");
  if (academicTitle) academicTitle.textContent = "📈 Análisis y Proyección Académica (En espera)";
  const riskBanner = elemento("risk-score-banner");
  if (riskBanner) riskBanner.className = "risk-score-banner bg-risk-unavailable";
  const riesgoScoreNum = elemento("riesgo-score-num");
  if (riesgoScoreNum) riesgoScoreNum.textContent = "—";
  const riesgoNivelText = elemento("riesgo-nivel-text");
  if (riesgoNivelText) riesgoNivelText.textContent = "Sin datos curriculares suficientes";
  const examRiskDesc = elemento("exam-risk-desc");
  if (examRiskDesc) {
    examRiskDesc.textContent = "La proyección académica se mostrará automáticamente cuando exista información curricular válida. Las expresiones faciales o vocales no sustituyen calificaciones.";
  }
  const narrativeText = elemento("assistant-narrative-text");
  if (narrativeText) {
    narrativeText.textContent = "Sin resultados todavía. Captura o sube una fotografía facial, o aguarda datos compatibles para mostrar la evaluación correspondiente.";
  }
  const academicFooter = elemento("academic-card-footer");
  if (academicFooter) academicFooter.innerHTML = "<span>Basado exclusivamente en evidencia verificada · Identidad no atribuida</span>";
}

function renderizarAnalisisIndependiente(resultadoImagen = null, resultadoAcademico = null, resultadoAudio = null, resultadoVideo = null, extras = {}) {
  ultimoResultadoImagen = resultadoImagen && resultadoImagen.estado !== "sin_entrada" ? resultadoImagen : null;
  ultimoResultadoVideo = resultadoVideo && resultadoVideo.estado !== "sin_entrada" ? resultadoVideo : null;
  ultimoResultadoAudio = resultadoAudio && resultadoAudio.estado !== "sin_entrada" ? resultadoAudio : null;
  ultimoResultadoAcademico = resultadoAcademico && resultadoAcademico.estado !== "sin_entrada" ? resultadoAcademico : null;
  ultimaInterpretacionVisual = extras?.interpretacion_visual || null;
  ultimaFusion = extras?.fusion || null;
  ultimaSincronizacion = extras?.sincronizacion || null;

  const img = ultimoResultadoImagen || ultimoResultadoVideo;
  const acad = ultimoResultadoAcademico;
  const aud = ultimoResultadoAudio;

  if (!img && !aud && !acad) {
    renderizarEstadoEsperaPaneles();
    return;
  }

  const hipImg = extraerHipotesis(img);
  const hipAud = extraerHipotesis(aud);
  const hipAcad = extraerHipotesis(acad);
  const identidadTxt = resolverIdentidadVisual(img);
  const interpretacion = construirInterpretacionLocal(img, acad, aud, ultimaInterpretacionVisual || img?.interpretacion_visual);

  const modalidadesActivas = [
    ultimoResultadoImagen && "Imagen",
    ultimoResultadoVideo && "Video",
    aud && "Audio",
    acad && "Académico"
  ].filter(Boolean);
  const etiquetaModalidades = `(${modalidadesActivas.join(" + ")})`;

  renderizarDetalleVisual(img);

  const sinRecorte = img?.deteccion_facial === "sin_recorte_facial";
  const rostros = img && !sinRecorte ? (img.rostros_detectados ?? (img.deteccion_facial === "sin_rostro" ? 0 : 1)) : 0;
  const visualLabel = sinRecorte ? "(Rostros sin evaluar)" : img
    ? (rostros === 1 ? `(Rostro 1 · ${identidadTxt})` : rostros > 1 ? `(${rostros} rostros)` : "(Sin rostro)")
    : "(Sin fotografía)";

  // Tarjeta Reconocimiento Facial
  const facialTitle = elemento("facial-card-title");
  if (facialTitle) {
    facialTitle.textContent = img
      ? `🔮 Reconocimiento Facial: 4 Expresiones Observables ${visualLabel}`
      : `🔮 Reconocimiento Facial ${visualLabel}`;
  }
  const facialSub = elemento("facial-card-sublabel");
  if (facialSub) {
    facialSub.textContent = sinRecorte ? "Detecciones externas recibidas sin captura facial" : img
      ? `Modelo ${describirModeloExperimental(img.modelo)} (${img.origen_entrenamiento === "sintetico" ? "datos sintéticos" : "datos reales"})`
      : "Sin fotografía enviada — Las demás modalidades operan de forma independiente";
  }

  const puntajes = img?.puntajes_calibrados || img?.puntajes_no_calibrados;
  const usa7Clases = Boolean(puntajes && ("miedo" in puntajes || "sorpresa" in puntajes || "asco" in puntajes));
  ["miedo", "sorpresa", "disgusto"].forEach(k => {
    const it = elemento(`emo-item-${k}`);
    if (it) it.style.display = usa7Clases ? "" : "none";
  });

  if (puntajes) {
    setBarraExpresion("emo-pct-felicidad", "emo-bar-felicidad", puntajes.alegria ?? puntajes.felicidad ?? 0);
    setBarraExpresion("emo-pct-neutral", "emo-bar-neutral", puntajes.neutral ?? 0);
    setBarraExpresion("emo-pct-enojo", "emo-bar-enojo", puntajes.enojo ?? 0);
    setBarraExpresion("emo-pct-tristeza", "emo-bar-tristeza", puntajes.tristeza ?? 0);
    if (usa7Clases) {
      setBarraExpresion("emo-pct-miedo", "emo-bar-miedo", puntajes.miedo ?? 0);
      setBarraExpresion("emo-pct-sorpresa", "emo-bar-sorpresa", puntajes.sorpresa ?? 0);
      setBarraExpresion("emo-pct-disgusto", "emo-bar-disgusto", puntajes.asco ?? puntajes.disgusto ?? 0);
    }
  } else {
    ["neutral", "felicidad", "tristeza", "enojo", "miedo", "sorpresa", "disgusto"].forEach(k => {
      setBarraExpresion(`emo-pct-${k}`, `emo-bar-${k}`, null);
    });
  }

  const domEmoText = elemento("dominant-emotion-text");
  if (domEmoText) {
    if (!img) {
      domEmoText.textContent = aud
        ? "Sin fotografía — Solo se evaluó la modalidad acústica"
        : "Sin fotografía — Solo se evaluó la modalidad académica";
    } else if (img.estado === "abstencion") {
      const motivos = traducirMotivosAbstencion(img.criterio_abstencion);
      domEmoText.textContent = hipImg
        ? `Hipótesis no concluyente: ${hipImg.label} (${hipImg.pctTexto}) · Abstención preventiva (${motivos})`
        : `Abstención preventiva (${motivos})`;
    } else if (img.estado === "estimacion_experimental") {
      const exp = formatearCategoria(img.expresion, true);
      domEmoText.textContent = `Expresión observable: ${exp}${hipImg ? ` (${hipImg.pctTexto})` : ""} · Clasificación concluyente`;
    } else if (img.estado === "evidencia_insuficiente") {
      domEmoText.textContent = ESTADOS_DETECCION_FACIAL[img.deteccion_facial] || "Evidencia facial insuficiente";
    } else if (img.estado === "modelo_no_disponible") {
      domEmoText.textContent = "Rostro detectado · Modelo facial no disponible";
    } else if (img.estado === "error_inferencia") {
      domEmoText.textContent = "Error técnico durante el análisis facial";
    } else {
      domEmoText.textContent = img.motivo || ESTADOS_FACIALES[img.estado] || "Sin evaluación";
    }
  }

  const actionBadge = elemento("student-action-badge");
  if (actionBadge) {
    actionBadge.textContent = img
      ? `Análisis facial individual · ${identidadTxt}`
      : "Modalidad independiente activa · Sin atribución biométrica";
  }

  // Tarjeta Inferior Izquierda: Resultados Predictivos
  const eventsTitle = elemento("events-card-title");
  if (eventsTitle) eventsTitle.textContent = `📋 Resultados Predictivos ${etiquetaModalidades}`;

  const itemsResultados = [];
  const itemsAdvertencias = [];

  if (img) {
    const etiquetaOrigen = ultimoResultadoImagen ? "Imagen" : "Video";
    if (interpretacion?.resumen?.observacion_visual) {
      itemsResultados.push(`
        <div class="prob-item visual-obs-item">
          <div class="prob-item-text-row">
            <span class="prob-item-title">👁️ Observación visual</span>
            <span class="context-pill-muted">${escaparHtml(identidadTxt)}</span>
          </div>
          <div class="prob-item-subnote">${escaparHtml(interpretacion.resumen.observacion_visual)}</div>
          <div class="prob-item-subnote"><strong>Interpretación:</strong> ${escaparHtml(interpretacion.resumen.interpretacion)}</div>
        </div>
      `);
    }
    if (img.estado === "estimacion_experimental" && hipImg) {
      itemsResultados.push(`
        <div class="prob-item conclusive-item">
          <div class="prob-item-text-row">
            <span class="prob-item-title">📸 ${etiquetaOrigen} · Clasificación facial concluyente: <strong>${escaparHtml(hipImg.label)}</strong></span>
            <span class="prob-item-pct">${escaparHtml(hipImg.pctTexto)}</span>
          </div>
          <div class="prob-progress-track"><div class="prob-progress-fill" style="width: ${hipImg.pctNum.toFixed(1)}%;"></div></div>
          <div class="prob-item-subnote">Rostros detectados: ${rostros} · ${escaparHtml(identidadTxt)} · Supera umbral ≥ 55% y margen ≥ 10%.</div>
        </div>
      `);
    } else if (img.estado === "abstencion") {
      const motivos = traducirMotivosAbstencion(img.criterio_abstencion);
      itemsResultados.push(`
        <div class="prob-item hypothesis-item">
          <div class="prob-item-text-row">
            <span class="prob-item-title">📸 ${etiquetaOrigen} · Hipótesis no concluyente: <strong>${escaparHtml(hipImg ? hipImg.label : "Sin hipótesis")}</strong> (abstención)</span>
            <span class="prob-item-pct">${escaparHtml(hipImg ? hipImg.pctTexto : "—")}</span>
          </div>
          <div class="prob-progress-track"><div class="prob-progress-fill" style="width: ${hipImg ? hipImg.pctNum.toFixed(1) : 0}%;"></div></div>
          <div class="prob-item-subnote">Motivo: ${escaparHtml(motivos)}. No se confirma categoría · Rostros: ${rostros}.</div>
        </div>
      `);
      itemsAdvertencias.push(`<div class="prob-item warning-item"><div class="prob-item-text-row"><span class="prob-item-title">⚠️ Motivo de abstención (${etiquetaOrigen})</span><span class="prob-item-pct">Abstención</span></div><div class="prob-item-subnote">Baja confianza o margen reducido (${escaparHtml(motivos)}): se presenta como hipótesis sin confirmar etiqueta.</div></div>`);
    } else {
      const detalle = ESTADOS_DETECCION_FACIAL[img.deteccion_facial] || ESTADOS_FACIALES[img.estado] || img.motivo || "No evaluable";
      itemsResultados.push(`
        <div class="prob-item error-item">
          <div class="prob-item-text-row">
            <span class="prob-item-title">📸 ${etiquetaOrigen} · ${escaparHtml(String(img.estado).replaceAll("_", " "))} (rostros: ${rostros})</span>
            <span class="prob-item-pct">Sin clasificar</span>
          </div>
          <div class="prob-item-subnote">${escaparHtml(detalle)}</div>
        </div>
      `);
      itemsAdvertencias.push(`<div class="prob-item warning-item"><div class="prob-item-text-row"><span class="prob-item-title">⚠️ Evidencia visual insuficiente</span><span class="prob-item-pct">Omitida</span></div><div class="prob-item-subnote">${escaparHtml(detalle)}</div></div>`);
    }

    // Objetos detectados de forma separada (YOLO best.pt / adaptadores externos)
    const obsObjetos = (interpretacion?.observaciones || []).filter(o => o.tipo === "objeto");
    const interpObjetos = (interpretacion?.hipotesis || []).filter(h => h.tipo === "interpretacion_contextual_objeto");
    for (const objObs of obsObjetos) {
      const claseObj = objObs.clase || "";
      const iconoObj = GUIA_OBJETOS_UI[claseObj]?.icono || "📦";
      const pctObj = typeof objObs.confianza === "number" ? `${(objObs.confianza * 100).toFixed(1)}%` : "—";
      const ctxObj = interpObjetos.find(h => h.clase === claseObj)?.descripcion || "";
      itemsResultados.push(`
        <div class="prob-item object-item">
          <div class="prob-item-text-row">
            <span class="prob-item-title">${iconoObj} Objeto detectado: <strong>${escaparHtml(formatearCategoria(claseObj))}</strong></span>
            <span class="prob-item-pct">${escaparHtml(pctObj)}</span>
          </div>
          <div class="prob-item-subnote">${escaparHtml(objObs.hecho)} ${escaparHtml(ctxObj)}</div>
        </div>
      `);
    }

    // Posibilidades generales no evaluadas (sin probabilidad inventada)
    const posibilidades = (interpretacion?.hipotesis || []).filter(h => h.tipo === "posibilidad_general_no_evaluada");
    if (posibilidades.length) {
      itemsResultados.push(`
        <div class="prob-item hypothesis-context-item">
          <div class="prob-item-text-row">
            <span class="prob-item-title">💡 Posibilidades generales (no son predicciones individuales)</span>
            <span class="context-pill-muted">Sin probabilidad asignada</span>
          </div>
          <ul class="context-hyp-list">${posibilidades.map(p => `<li>${escaparHtml(p.descripcion)}</li>`).join("")}</ul>
        </div>
      `);
    }
  }

  if (aud) {
    if (aud.estado === "estimacion_experimental" && hipAud) {
      const top3 = hipAud.puntajesOrdenados.slice(0, 3).map(([k, v]) => `${formatearCategoria(k)} ${(v * 100).toFixed(1)}%`).join(" · ");
      itemsResultados.push(`
        <div class="prob-item conclusive-item">
          <div class="prob-item-text-row">
            <span class="prob-item-title">🎙️ Audio · Clasificación vocal concluyente: <strong>${escaparHtml(hipAud.label)}</strong></span>
            <span class="prob-item-pct">${escaparHtml(hipAud.pctTexto)}</span>
          </div>
          <div class="prob-progress-track"><div class="prob-progress-fill" style="width: ${hipAud.pctNum.toFixed(1)}%;"></div></div>
          <div class="prob-item-subnote">Modelo acústico RAVDESS (no facial) · Top 3: ${escaparHtml(top3 || "sin detalle")}.</div>
        </div>
      `);
    } else if (aud.estado === "abstencion") {
      const motivos = traducirMotivosAbstencion(aud.criterio_abstencion);
      const top3 = (hipAud?.puntajesOrdenados || []).slice(0, 3).map(([k, v]) => `${formatearCategoria(k)} ${(v * 100).toFixed(1)}%`).join(" · ");
      itemsResultados.push(`
        <div class="prob-item hypothesis-item">
          <div class="prob-item-text-row">
            <span class="prob-item-title">🎙️ Audio · Hipótesis vocal no concluyente: <strong>${escaparHtml(hipAud ? hipAud.label : "Sin hipótesis")}</strong> (abstención)</span>
            <span class="prob-item-pct">${escaparHtml(hipAud ? hipAud.pctTexto : "—")}</span>
          </div>
          <div class="prob-progress-track"><div class="prob-progress-fill" style="width: ${hipAud ? hipAud.pctNum.toFixed(1) : 0}%;"></div></div>
          <div class="prob-item-subnote">Motivo: ${escaparHtml(motivos)}. Top 3 RAVDESS (8 clases, no facial): ${escaparHtml(top3 || "sin puntajes")}.</div>
        </div>
      `);
    } else if (aud.estado === "caracteristicas_declaradas") {
      itemsResultados.push(`
        <div class="prob-item warning-item">
          <div class="prob-item-text-row">
            <span class="prob-item-title">🎙️ Audio · Descriptores acústicos recibidos (${escaparHtml(aud.duracion_segundos ?? "—")}s)</span>
            <span class="prob-item-pct">Pendiente WAV</span>
          </div>
          <div class="prob-item-subnote">Requiere fragmento PCM16 compatible con RAVDESS.</div>
        </div>
      `);
    } else {
      itemsResultados.push(`
        <div class="prob-item error-item">
          <div class="prob-item-text-row">
            <span class="prob-item-title">🎙️ Audio · ${escaparHtml(String(aud.estado).replaceAll("_", " "))}</span>
            <span class="prob-item-pct">No evaluable</span>
          </div>
          <div class="prob-item-subnote">${escaparHtml(aud.motivo || "Señal acústica inválida o silenciosa.")}</div>
        </div>
      `);
    }
  }

  if (acad) {
    if (acad.estado === "estimacion_experimental") {
      const pctRiesgo = Math.round((acad.probabilidad_no_aprueba ?? 0) * 100);
      const desenlaceTxt = acad.desenlace_estimado === "no_aprueba" ? "Riesgo de desaprobación (no aprueba)" : "Aprobación proyectada (aprueba)";
      itemsResultados.push(`
        <div class="prob-item conclusive-item">
          <div class="prob-item-text-row">
            <span class="prob-item-title">📚 Académico · ${escaparHtml(desenlaceTxt)} (${escaparHtml(acad.desenlace || "G3 < 10/20")})</span>
            <span class="prob-item-pct">${pctRiesgo}% riesgo</span>
          </div>
          <div class="prob-progress-track"><div class="prob-progress-fill" style="width: ${pctRiesgo}%;"></div></div>
          <div class="prob-item-subnote">Evaluado con calificaciones G1 y G2 (escala 0–20). ${escaparHtml(acad.limitacion || "")}</div>
        </div>
      `);
    } else if (acad.estado === "abstencion") {
      const pctRiesgo = acad.probabilidad_no_aprueba != null ? Math.round(acad.probabilidad_no_aprueba * 100) : 0;
      const motivos = traducirMotivosAbstencion(acad.criterio_abstencion);
      itemsResultados.push(`
        <div class="prob-item hypothesis-item">
          <div class="prob-item-text-row">
            <span class="prob-item-title">📚 Académico · Hipótesis limítrofe: <strong>${escaparHtml(hipAcad ? hipAcad.label : "Sin confirmar")}</strong> (abstención)</span>
            <span class="prob-item-pct">${pctRiesgo}% riesgo</span>
          </div>
          <div class="prob-progress-track"><div class="prob-progress-fill" style="width: ${pctRiesgo}%;"></div></div>
          <div class="prob-item-subnote">Motivo: ${escaparHtml(motivos)}. No supera umbral ni margen concluyente.</div>
        </div>
      `);
    } else if (acad.estado === "evidencia_insuficiente") {
      const faltantes = (acad.campos_faltantes || []).join(", ") || "G1, G2";
      itemsResultados.push(`
        <div class="prob-item warning-item">
          <div class="prob-item-text-row">
            <span class="prob-item-title">📚 Académico · Datos curriculares incompletos</span>
            <span class="prob-item-pct">Incompleto</span>
          </div>
          <div class="prob-item-subnote">Campos faltantes: <strong>${escaparHtml(faltantes)}</strong>. El sistema nunca inventa notas ausentes.</div>
        </div>
      `);
    }
  }

  // Advertencias de fusión, evidencia adicional requerida y límites
  if (ultimaFusion?.explicacion) {
    itemsAdvertencias.push(`<div class="prob-item warning-item"><div class="prob-item-text-row"><span class="prob-item-title">🔀 Regla de integración multimodal</span><span class="prob-item-pct">Independiente</span></div><div class="prob-item-subnote">${escaparHtml(ultimaFusion.explicacion)}</div></div>`);
  }
  if (ultimaSincronizacion?.conflictos_referencia?.length) {
    itemsAdvertencias.push(`<div class="prob-item error-item"><div class="prob-item-text-row"><span class="prob-item-title">⚠️ Conflictos de referencia detectados</span><span class="prob-item-pct">${ultimaSincronizacion.conflictos_referencia.length}</span></div><div class="prob-item-subnote">${escaparHtml(ultimaSincronizacion.conflictos_referencia.join(", "))}</div></div>`);
  }
  if (interpretacion?.resumen?.informacion_adicional_necesaria) {
    itemsAdvertencias.push(`
      <div class="prob-item required-evidence-item">
        <div class="prob-item-text-row">
          <span class="prob-item-title">🧾 Evidencia adicional requerida</span>
          <span class="context-pill-muted">Fuera de fotografía</span>
        </div>
        <div class="prob-item-subnote">${escaparHtml(interpretacion.resumen.informacion_adicional_necesaria)}</div>
      </div>
    `);
  }
  const limTextos = (interpretacion?.limitaciones || []).slice(0, 3);
  if (limTextos.length && img) {
    itemsAdvertencias.push(`
      <div class="prob-item warning-item">
        <div class="prob-item-text-row">
          <span class="prob-item-title">📏 Límites de interpretación</span>
          <span class="prob-item-pct">Alcance</span>
        </div>
        <ul class="context-hyp-list">${limTextos.map(l => `<li>${escaparHtml(l)}</li>`).join("")}</ul>
      </div>
    `);
  }
  itemsAdvertencias.push('<div class="prediction-empty-notice"><span>🛡️</span><span><strong>Sin sucesos artificiales:</strong> No se fabrican causas previas ni consecuencias futuras a partir de señales faciales o acústicas aisladas.</span></div>');

  const causesList = elemento("causes-list");
  if (causesList) causesList.innerHTML = itemsResultados.join("");
  const consequencesList = elemento("consequences-list");
  if (consequencesList) consequencesList.innerHTML = itemsAdvertencias.join("");
  const eventsFooter = elemento("events-card-footer");
  if (eventsFooter) eventsFooter.innerHTML = "<span>Evaluación independiente por modalidad · Sin diagnósticos ni fusión no calibrada</span>";

  // Tarjeta Inferior Derecha: Análisis y Proyección Académica
  const academicTitle = elemento("academic-card-title");
  if (academicTitle) {
    academicTitle.textContent = acad?.estado === "estimacion_experimental"
      ? "📈 Análisis y Proyección Académica (Evaluación curricular)"
      : acad?.estado === "abstencion"
        ? "📈 Análisis y Proyección Académica (Incertidumbre limítrofe)"
        : "📈 Análisis y Proyección Académica (Sin datos suficientes)";
  }

  const riskBanner = elemento("risk-score-banner");
  const riesgoScoreNum = elemento("riesgo-score-num");
  const riesgoNivelText = elemento("riesgo-nivel-text");
  const examRiskDesc = elemento("exam-risk-desc");
  const academicFooter = elemento("academic-card-footer");

  if (acad && acad.estado === "estimacion_experimental") {
    const pctNoAprueba = Math.round((acad.probabilidad_no_aprueba ?? 0) * 100);
    if (riesgoScoreNum) riesgoScoreNum.textContent = String(pctNoAprueba);
    if (riesgoNivelText) {
      riesgoNivelText.textContent = acad.desenlace_estimado === "no_aprueba"
        ? "Riesgo de desaprobación (G3 < 10/20)"
        : "Aprobación proyectada (G3 >= 10/20)";
    }
    if (riskBanner) riskBanner.className = `risk-score-banner ${acad.desenlace_estimado === "no_aprueba" ? "bg-risk-high" : "bg-risk-optimal"}`;
    if (examRiskDesc) {
      examRiskDesc.textContent = `Probabilidad estimada de no aprobar: ${(acad.probabilidad_no_aprueba * 100).toFixed(1)}% (escala 0-20, corte ${acad.corte || "despues_g2"}).`;
    }
    if (academicFooter) academicFooter.innerHTML = "<span>Modelo: Regresión Logística (fase7-1.0 · UCI Student Performance)</span>";
  } else if (acad && acad.estado === "abstencion") {
    const pctNoAprueba = acad.probabilidad_no_aprueba != null ? Math.round(acad.probabilidad_no_aprueba * 100) : "—";
    if (riesgoScoreNum) riesgoScoreNum.textContent = String(pctNoAprueba);
    if (riesgoNivelText) riesgoNivelText.textContent = `Resultado limítrofe no concluyente (${hipAcad ? hipAcad.label : "abstención"})`;
    if (riskBanner) riskBanner.className = "risk-score-banner bg-risk-unavailable";
    if (examRiskDesc) examRiskDesc.textContent = `Incertidumbre académica (${traducirMotivosAbstencion(acad.criterio_abstencion)}). Requiere revisión docente.`;
    if (academicFooter) academicFooter.innerHTML = "<span>Regresión Logística · Abstención preventiva</span>";
  } else if (acad && acad.estado === "evidencia_insuficiente") {
    const faltantes = (acad.campos_faltantes || []).join(", ") || "G1, G2";
    if (riskBanner) riskBanner.className = "risk-score-banner bg-risk-unavailable";
    if (riesgoScoreNum) riesgoScoreNum.textContent = "—";
    if (riesgoNivelText) riesgoNivelText.textContent = `Datos insuficientes · Faltan: ${faltantes}`;
    if (examRiskDesc) examRiskDesc.textContent = `Faltan calificaciones curriculares obligatorias (${faltantes}). No se imputan valores faltantes.`;
    if (academicFooter) academicFooter.innerHTML = "<span>Validación estricta sin imputación</span>";
  } else {
    if (riskBanner) riskBanner.className = "risk-score-banner bg-risk-unavailable";
    if (riesgoScoreNum) riesgoScoreNum.textContent = "—";
    if (riesgoNivelText) riesgoNivelText.textContent = "Sin datos curriculares suficientes";
    if (examRiskDesc) {
      examRiskDesc.textContent = "No se han recibido calificaciones curriculares compatibles. Las señales faciales o acústicas no sustituyen notas académicas.";
    }
    if (academicFooter) academicFooter.innerHTML = "<span>Basado exclusivamente en evidencia verificada · Identidad no atribuida</span>";
  }

  const narrativeText = elemento("assistant-narrative-text");
  if (narrativeText) {
    const lineas = [`<strong>Resumen de ejecución ${escaparHtml(etiquetaModalidades)}:</strong>`];
    if (img) {
      const estadoVis = img.estado === "abstencion" && hipImg
        ? `Abstención preventiva · Hipótesis no concluyente: <strong>${escaparHtml(hipImg.label)}</strong> (${hipImg.pctTexto})`
        : img.estado === "estimacion_experimental" && hipImg
          ? `Expresión observable concluyente: <strong>${escaparHtml(hipImg.label)}</strong> (${hipImg.pctTexto})`
          : escaparHtml(ESTADOS_DETECCION_FACIAL[img.deteccion_facial] || ESTADOS_FACIALES[img.estado] || img.estado);
      lineas.push(`• <strong>Facial:</strong> ${rostros} rostro(s) · ${estadoVis}.`);
    }
    if (aud) {
      const estadoAud = aud.estado === "estimacion_experimental" && hipAud
        ? `Vocal concluyente: <strong>${escaparHtml(hipAud.label)}</strong> (${hipAud.pctTexto})`
        : aud.estado === "abstencion" && hipAud
          ? `Abstención acústica · Hipótesis: <strong>${escaparHtml(hipAud.label)}</strong> (${hipAud.pctTexto})`
          : escaparHtml(aud.motivo || String(aud.estado).replaceAll("_", " "));
      lineas.push(`• <strong>Audio:</strong> ${estadoAud}.`);
    }
    if (acad) {
      const estadoAc = acad.estado === "estimacion_experimental"
        ? `Desenlace estimado '${escaparHtml(acad.desenlace_estimado)}' (${(acad.probabilidad_no_aprueba * 100).toFixed(1)}% prob. no aprobar)`
        : acad.estado === "evidencia_insuficiente"
          ? `Datos incompletos (faltan: ${escaparHtml((acad.campos_faltantes || []).join(", "))})`
          : `Abstención limítrofe`;
      lineas.push(`• <strong>Académico:</strong> ${estadoAc}.`);
    }
    narrativeText.innerHTML = lineas.join("<br>");
  }
}

function aplicarPayloadExterno(salida) {
  if (!salida || typeof salida !== "object") {
    renderizarEstadoEsperaPaneles();
    return;
  }
  const analisis = salida.analisis || salida;
  const fuentes = analisis.fuentes || {};
  renderizarAnalisisIndependiente(
    fuentes.imagen ?? null,
    analisis.academico ?? salida.academico ?? null,
    fuentes.audio ?? null,
    fuentes.video ?? null,
    {
      interpretacion_visual: analisis.interpretacion_visual ?? salida.interpretacion_visual ?? null,
      sincronizacion: analisis.sincronizacion ?? null,
      fusion: salida.fusion ?? null
    }
  );
}

// ============================================================================
// CÁMARA EN VIVO, DETECCIÓN FACIAL Y SUBIDA DE FOTOGRAFÍA (ENTREGA 3 RESTAURADA)
// ============================================================================

const INTERVALO_DETECCION_MS = 500;
const MEDIAPIPE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32";
const BLAZEFACE_URL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
let sesionCamara = null;
let peticionCaptura = null;

function estadoCaptura(mensaje, modo = "normal") {
  const txt = elemento("capture-status-text");
  if (txt) txt.textContent = mensaje;
  const chip = elemento("capture-status-indicator");
  if (chip) {
    chip.className = modo === "offline"
      ? "live-indicator-chip offline"
      : modo === "waiting"
        ? "live-indicator-chip waiting"
        : "live-indicator-chip";
  }
}

function estadoAutomatico(mensaje) {
  const el = elemento("auto-capture-status");
  if (el) el.textContent = mensaje;
}

async function cargarMediaPipe() {
  const { FilesetResolver, FaceDetector } = await import(`${MEDIAPIPE_URL}/vision_bundle.mjs`);
  const archivos = await FilesetResolver.forVisionTasks(`${MEDIAPIPE_URL}/wasm`);
  return FaceDetector.createFromOptions(archivos, {
    baseOptions: { modelAssetPath: BLAZEFACE_URL, delegate: "CPU" },
    runningMode: "VIDEO",
    minDetectionConfidence: 0.65
  });
}

function tieneRostro(detecciones) {
  return detecciones.some(({ boundingBox }) => boundingBox?.width > 0 && boundingBox.height > 0);
}

async function iniciarDetector(sesion, usarNativo = true) {
  sesion.detectar = null;
  estadoAutomatico("Preparando detector facial local…");
  if (usarNativo && typeof globalThis.FaceDetector === "function") {
    try {
      const detector = new globalThis.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      sesion.detectar = async (frame) => tieneRostro(await detector.detect(frame));
      sesion.nativo = true;
      programarDeteccion(sesion);
      return;
    } catch {
      // Algunos navegadores exponen la API sin un detector funcional.
    }
  }
  try {
    const detector = await cargarMediaPipe();
    if (sesionCamara !== sesion) {
      detector.close();
      return;
    }
    sesion.detectar = (frame) => tieneRostro(detector.detectForVideo(frame, performance.now()).detections);
    sesion.cerrarDetector = () => detector.close();
    sesion.nativo = false;
    programarDeteccion(sesion);
  } catch {
    if (sesionCamara === sesion) {
      estadoAutomatico("Detector facial no disponible. Puedes capturar manualmente.");
    }
  }
}

function programarDeteccion(sesion) {
  actualizarEstadoAutomatico();
  const revisar = async () => {
    const video = elemento("webcam-feed");
    const autoCheck = elemento("auto-capture-enabled");
    const intervalInput = elemento("auto-capture-interval");
    const intervalo = Math.max(5, Number(intervalInput?.value) || 5) * 1000;
    const puedeCapturar = () => sesionCamara === sesion && !document.hidden &&
      Boolean(autoCheck?.checked) && !modoCapturaCongelada && !peticionCaptura &&
      performance.now() - sesion.ultimaCaptura >= intervalo;
    try {
      if (puedeCapturar() && video && !video.paused && video.readyState >= 2 && video.currentTime !== sesion.ultimoFrame) {
        sesion.ultimoFrame = video.currentTime;
        const frame = capturarFrame(video);
        if (await sesion.detectar(frame) && puedeCapturar()) {
          await procesarCaptura(() => frame.toDataURL("image/jpeg", 0.88), "automatica");
        }
      }
    } catch {
      if (sesionCamara !== sesion) return;
      if (sesion.nativo) return iniciarDetector(sesion, false);
      sesion.detectar = null;
      estadoAutomatico("Falló el detector facial. Puedes capturar manualmente.");
      return;
    }
    if (sesionCamara === sesion) sesion.temporizador = setTimeout(revisar, INTERVALO_DETECCION_MS);
  };
  sesion.temporizador = setTimeout(revisar, INTERVALO_DETECCION_MS);
}

function actualizarEstadoAutomatico() {
  if (!sesionCamara?.lista) return;
  const autoCheck = elemento("auto-capture-enabled");
  const activa = Boolean(autoCheck?.checked);
  if (!sesionCamara.detectar) {
    if (activa && !sesionCamara.preparando) {
      const sesion = sesionCamara;
      sesion.preparando = true;
      return iniciarDetector(sesion).finally(() => { sesion.preparando = false; });
    }
    if (!activa) estadoAutomatico("Captura automática desactivada.");
    return;
  }
  const detector = sesionCamara.nativo ? "detector del navegador" : "MediaPipe";
  estadoAutomatico(activa
    ? `Captura automática lista con ${detector}. El intervalo se aplica a toda la cámara.`
    : "Captura automática pausada. La captura manual sigue disponible.");
}

async function iniciarCamara() {
  if (sesionCamara) return;
  const video = elemento("webcam-feed");
  const btnStart = elemento("btn-start-camera");
  const btnStop = elemento("btn-stop-camera");
  const sesion = { ultimaCaptura: -Infinity, ultimoFrame: -1 };
  sesionCamara = sesion;
  if (btnStart) btnStart.disabled = true;
  if (btnStop) btnStop.hidden = false;
  estadoCaptura("Solicitando acceso a la cámara…", "waiting");

  let iniciandoVideo = false;
  let limiteVideo;
  try {
    if (globalThis.isSecureContext === false || !globalThis.navigator?.mediaDevices?.getUserMedia) {
      detenerCamara();
      estadoCaptura("La cámara requiere un navegador compatible en localhost o HTTPS. Puedes subir una foto.", "offline");
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: false
    });
    if (sesionCamara !== sesion) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    sesion.stream = stream;
    for (const track of stream.getTracks()) {
      track.addEventListener("ended", () => {
        if (sesionCamara !== sesion) return;
        detenerCamara();
        estadoCaptura("La cámara se desconectó. Puedes volver a encenderla o subir una foto.", "offline");
      });
    }
    iniciandoVideo = true;
    if (video) {
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      video.classList?.add("active");
      video.style.display = "block";
      try {
        await Promise.race([
          video.play(),
          new Promise((_, reject) => {
            limiteVideo = setTimeout(() => reject(new Error("Tiempo de espera del visor")), 8000);
          })
        ]);
      } finally {
        clearTimeout(limiteVideo);
      }
    }
    if (sesionCamara !== sesion) return;
    sesion.lista = true;
    volverANuevaCaptura();
    await actualizarEstadoAutomatico();
  } catch (error) {
    if (sesionCamara !== sesion) return;
    detenerCamara();
    if (iniciandoVideo) {
      estadoCaptura("La cámara se abrió, pero el visor no pudo reproducir el video. Vuelve a encenderla o sube una foto.", "offline");
    } else if (["NotAllowedError", "SecurityError"].includes(error?.name)) {
      estadoCaptura("Permiso de cámara denegado. Habilítalo en el navegador o sube una foto.", "offline");
    } else if (error?.name === "NotFoundError") {
      estadoCaptura("No se encontró una cámara disponible. Conéctala o sube una foto.", "offline");
    } else if (["NotReadableError", "TrackStartError"].includes(error?.name)) {
      estadoCaptura("No se pudo abrir la cámara. Comprueba si otra aplicación la está usando o sube una foto.", "offline");
    } else {
      estadoCaptura("No se pudo iniciar la cámara. Revisa el dispositivo o sube una foto.", "offline");
    }
  }
}

function detenerCamara() {
  const sesion = sesionCamara;
  if (!sesion) return;
  sesionCamara = null;
  clearTimeout(sesion.temporizador);
  if (peticionCaptura?.esCamara) peticionCaptura.controlador.abort();
  sesion.stream?.getTracks().forEach(track => track.stop());
  sesion.cerrarDetector?.();

  const video = elemento("webcam-feed");
  if (video) {
    video.srcObject = null;
    video.classList?.remove("active");
    video.style.display = "none";
  }
  const btnStart = elemento("btn-start-camera");
  if (btnStart) btnStart.disabled = false;
  const btnStop = elemento("btn-stop-camera");
  if (btnStop) btnStop.hidden = true;
  const autoCheck = elemento("auto-capture-enabled");
  if (autoCheck) autoCheck.checked = false;
  volverANuevaCaptura();
}

function capturarFrame(video) {
  if (!sesionCamara?.stream || !video || !video.videoWidth || !video.videoHeight || video.paused) {
    throw new Error("Inicia la cámara y espera a que el visor esté listo.");
  }
  const frame = document.createElement("canvas");
  const escala = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
  frame.width = Math.max(1, Math.round(video.videoWidth * escala));
  frame.height = Math.max(1, Math.round(video.videoHeight * escala));
  const contexto = frame.getContext("2d");
  if (!contexto) throw new Error("No se pudo capturar el fotograma. Puedes subir una foto.");
  contexto.drawImage(video, 0, 0, frame.width, frame.height);
  return frame;
}

function obtenerBaseBackend() {
  return typeof location !== "undefined" && location.origin && location.protocol !== "file:"
    ? location.origin
    : "http://127.0.0.1:8001";
}

async function solicitarAnalisisFacial(imagen, signal) {
  const cuerpo = { schema_version: 1, imagen: { imagen_b64: imagen, modelo_facial: "real" } };
  let respuesta;
  try {
    respuesta = await fetch(`${obtenerBaseBackend()}/api/prediccion/analisis-experimental`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal
    });
  } catch {
    throw new Error("No se pudo conectar con el servidor de predicción.");
  }
  if (!respuesta.ok) {
    throw new Error(ERRORES_CAPTURA[respuesta.status] || `Error HTTP ${respuesta.status}.`);
  }
  const datos = await respuesta.json().catch(() => null);
  const resultado = datos?.fuentes?.imagen;
  if (!resultado || !Object.hasOwn(ESTADOS_FACIALES, resultado.estado)) {
    throw new Error("El servidor devolvió una respuesta facial inválida.");
  }
  return { resultado, datosCompletos: datos };
}

async function procesarCaptura(obtenerImagen, origen) {
  if (peticionCaptura) return;
  const controlador = new AbortController();
  const esCamara = origen === "manual" || origen === "automatica";
  peticionCaptura = { controlador, esCamara };
  const { signal } = controlador;

  const capturaManual = elemento("btn-capture-predict");
  const cargaFoto = elemento("input-upload-image");
  const resultadoFacial = elemento("resultado-facial-captura");

  if (resultadoFacial) resultadoFacial.textContent = "";
  renderizarEstadoEsperaPaneles();

  if (capturaManual) capturaManual.disabled = true;
  if (cargaFoto) cargaFoto.disabled = true;

  estadoCaptura(
    origen === "automatica"
      ? "Analizando captura automática…"
      : origen === "archivo"
        ? "Leyendo fotografía…"
        : "Capturando fotograma…",
    "waiting"
  );

  let agotado = false;
  const limite = setTimeout(() => {
    agotado = true;
    controlador.abort();
  }, 30000);

  try {
    const imagen = await obtenerImagen(signal);
    if (signal.aborted) return;
    if (esCamara && sesionCamara) sesionCamara.ultimaCaptura = performance.now();

    modoCapturaCongelada = origen !== "automatica";
    if (modoCapturaCongelada) {
      const foto = elemento("captured-image-display");
      if (foto) {
        if (imagen !== null) foto.src = imagen;
        foto.style.display = imagen === null ? "none" : "block";
      }
      const video = elemento("webcam-feed");
      if (video) video.style.display = "none";
      const placeholder = elemento("camera-placeholder");
      placeholder?.classList?.add("hidden");
    }

    if (imagen !== null) {
      estadoCaptura(origen === "archivo" ? "Fotografía seleccionada · Analizando…" : "Fotograma capturado · Analizando…", "waiting");
    }

    const { resultado, datosCompletos } = await solicitarAnalisisFacial(imagen, signal);
    if (signal.aborted) return;

    const camLoc = elemento("cam-location-label");
    if (camLoc) camLoc.textContent = "Captura facial";

    if (resultadoFacial) {
      resultadoFacial.textContent = "";
      listaAccesible(resultadoFacial, "Expresión facial experimental · identidad desconocida", lineasDemoModelo("Imagen", resultado));
    }

    const msgEstado = resultado.estado === "evidencia_insuficiente" && Object.hasOwn(ESTADOS_DETECCION_FACIAL, resultado.deteccion_facial)
      ? ESTADOS_DETECCION_FACIAL[resultado.deteccion_facial]
      : ESTADOS_FACIALES[resultado.estado];
    const tipoChip = resultado.estado === "error_inferencia" || resultado.estado === "imagen_invalida" ? "offline" : "normal";
    estadoCaptura(msgEstado, tipoChip);

    const acad = datosCompletos?.academico && datosCompletos.academico.estado !== "sin_entrada" ? datosCompletos.academico : ultimoResultadoAcademico;
    const aud = datosCompletos?.fuentes?.audio && datosCompletos.fuentes.audio.estado !== "sin_entrada" ? datosCompletos.fuentes.audio : ultimoResultadoAudio;
    renderizarAnalisisIndependiente(
      resultado,
      acad,
      aud,
      datosCompletos?.fuentes?.video ?? null,
      {
        interpretacion_visual: datosCompletos?.interpretacion_visual ?? resultado?.interpretacion_visual ?? null,
        sincronizacion: datosCompletos?.sincronizacion ?? null
      }
    );
  } catch (error) {
    if (signal.aborted && !agotado) return;
    const mensajeError = agotado ? "El servidor tardó demasiado en responder. Puedes reintentar." : error.message;
    estadoCaptura(mensajeError, "offline");
    renderizarAnalisisIndependiente({ estado: "error_inferencia", motivo: mensajeError, rostros_detectados: 0 }, ultimoResultadoAcademico, ultimoResultadoAudio, null, {});
    if (origen === "automatica") {
      const autoCheck = elemento("auto-capture-enabled");
      if (autoCheck) autoCheck.checked = false;
      estadoAutomatico("Captura automática pausada tras el error. Puedes reactivarla.");
    }
  } finally {
    clearTimeout(limite);
    peticionCaptura = null;
    if (capturaManual) capturaManual.disabled = !sesionCamara?.lista;
    if (cargaFoto) cargaFoto.disabled = false;
  }
}

function ejecutarCapturaYPrediccion() {
  return procesarCaptura(() => capturarFrame(elemento("webcam-feed")).toDataURL("image/jpeg", 0.88), "manual");
}

function volverANuevaCaptura() {
  const video = elemento("webcam-feed");
  const imgDisplay = elemento("captured-image-display");
  const placeholder = elemento("camera-placeholder");
  const canvas = elemento("overlay-canvas");
  const resFacial = elemento("resultado-facial-captura");
  const btnCapture = elemento("btn-capture-predict");
  const btnStop = elemento("btn-stop-camera");
  const camLoc = elemento("cam-location-label");

  if (imgDisplay) {
    imgDisplay.style.display = "none";
    imgDisplay.removeAttribute?.("src");
  }
  if (video) {
    video.style.display = sesionCamara?.lista ? "block" : "none";
  }
  if (placeholder) placeholder.classList?.toggle("hidden", Boolean(sesionCamara?.lista));
  canvas?.classList?.remove("interactivo");
  if (resFacial) resFacial.textContent = "";
  if (btnCapture) btnCapture.disabled = Boolean(peticionCaptura) || !sesionCamara?.lista;
  if (btnStop) btnStop.hidden = !sesionCamara?.lista;
  if (camLoc) camLoc.textContent = "Cámara local";

  modoCapturaCongelada = false;
  renderizarEstadoEsperaPaneles();

  if (sesionCamara?.lista) {
    estadoCaptura("Cámara lista", "normal");
  } else {
    estadoCaptura("Cámara detenida", "waiting");
    estadoAutomatico("La captura automática requiere una cámara activa.");
  }
}

function configurarSubidaFoto() {
  const entrada = elemento("input-upload-image");
  if (!entrada) return;
  entrada.addEventListener("change", (evento) => {
    const archivo = evento.target.files?.[0];
    entrada.value = "";
    if (!archivo) return;
    const formato = archivo.type ? /^(image\/(jpeg|png|webp))$/i.test(archivo.type) : /\.(jpe?g|png|webp)$/i.test(archivo.name);
    if (!formato || archivo.size === 0 || archivo.size > 5 * 1024 ** 2) {
      estadoCaptura("Selecciona una foto JPEG, PNG o WebP de hasta 5 MiB.", "offline");
      return;
    }
    return procesarCaptura((signal) => new Promise((resolve, reject) => {
      const lector = new FileReader();
      const cancelar = () => lector.abort();
      signal.addEventListener("abort", cancelar, { once: true });
      lector.onloadend = () => signal.removeEventListener("abort", cancelar);
      lector.onload = () => resolve(lector.result);
      lector.onerror = () => reject(new Error("No se pudo leer la foto."));
      lector.onabort = () => reject(new Error("Lectura cancelada."));
      lector.readAsDataURL(archivo);
    }), "archivo");
  });
}

function iniciarRenderizadoCanvas() {
  const canvas = elemento("overlay-canvas");
  if (!canvas || typeof canvas.getContext !== "function") return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const renderLoop = () => {
    const w = canvas.clientWidth || 640;
    const h = canvas.clientHeight || 360;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    if (typeof requestAnimationFrame === "function") {
      animCanvasId = requestAnimationFrame(renderLoop);
    }
  };
  renderLoop();
}

function iniciarRelojEnVivo() {
  const label = elemento("live-datetime");
  if (!label) return;
  const actualizar = () => {
    const ahora = new Date();
    const pad = n => String(n).padStart(2, "0");
    label.textContent = `${pad(ahora.getDate())}/${pad(ahora.getMonth() + 1)}/${ahora.getFullYear()} ${pad(ahora.getHours())}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())}`;
  };
  actualizar();
  setInterval(actualizar, 1000);
}

function configurarEventos() {
  const btnStartCam = elemento("btn-start-camera");
  const btnCapture = elemento("btn-capture-predict");
  const btnNewCapture = elemento("btn-new-capture");
  const btnStop = elemento("btn-stop-camera");
  const autoCheck = elemento("auto-capture-enabled");
  const btnToggle = elemento("btn-toggle-students-panel");

  if (btnStartCam) btnStartCam.addEventListener("click", iniciarCamara);
  if (btnCapture) btnCapture.addEventListener("click", ejecutarCapturaYPrediccion);
  if (btnNewCapture) {
    btnNewCapture.addEventListener("click", () => {
      peticionCaptura?.controlador.abort();
      volverANuevaCaptura();
    });
  }
  if (btnStop) btnStop.addEventListener("click", detenerCamara);
  if (autoCheck) autoCheck.addEventListener("change", actualizarEstadoAutomatico);
  if (btnToggle) {
    btnToggle.addEventListener("click", () => {
      panelEstudiantesExpandido = !panelEstudiantesExpandido;
      renderizarDetalleVisual(ultimoResultadoImagen || ultimoResultadoVideo);
    });
  }

  configurarSubidaFoto();
}

const INTERVALO_RECEPCION_MS = 3000;
let consultaRecepcionEnCurso = false;

async function verificarRecepcionAutomatica(forzar = false) {
  if (typeof fetch !== "function" || peticionCaptura || consultaRecepcionEnCurso) return null;
  consultaRecepcionEnCurso = true;
  try {
    const desde = forzar ? 0 : ultimaSecuenciaRecepcion;
    const opciones = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? { signal: AbortSignal.timeout(4000) }
      : {};
    const respuesta = await fetch(`${obtenerBaseBackend()}/api/prediccion/recepcion/ultima?desde=${desde}`, opciones);
    if (!respuesta?.ok) return null;
    const data = await respuesta.json().catch(() => null);
    if (!data || data.sin_cambios) return null;
    const seq = Number(data.actualizacion_id) || 0;
    if (seq <= ultimaSecuenciaRecepcion && !forzar) return null;
    ultimaSecuenciaRecepcion = Math.max(ultimaSecuenciaRecepcion, seq);
    if (!data.disponible || !data.resultado) {
      return data;
    }
    if (modoCapturaCongelada && !peticionCaptura) {
      modoCapturaCongelada = false;
      const imgDisplay = elemento("captured-image-display");
      if (imgDisplay) {
        imgDisplay.style.display = "none";
        imgDisplay.removeAttribute?.("src");
      }
      const video = elemento("webcam-feed");
      if (video) video.style.display = sesionCamara?.lista ? "block" : "none";
      const placeholder = elemento("camera-placeholder");
      if (placeholder) placeholder.classList?.toggle("hidden", Boolean(sesionCamara?.lista));
    }
    aplicarPayloadExterno(data.resultado);
    return data;
  } catch {
    return null;
  } finally {
    consultaRecepcionEnCurso = false;
  }
}

configurarEventos();
volverANuevaCaptura();

if (typeof window !== "undefined") {
  iniciarRelojEnVivo();
  iniciarRenderizadoCanvas();
  setInterval(() => {
    if (typeof document === "undefined" || !document.hidden) {
      void verificarRecepcionAutomatica();
    }
  }, INTERVALO_RECEPCION_MS);
  if (typeof window.addEventListener === "function") {
    window.addEventListener("aulapredict:resultados", (ev) => aplicarPayloadExterno(ev?.detail));
    window.addEventListener("pagehide", () => {
      peticionCaptura?.controlador.abort();
      detenerCamara();
    });
  }
}

globalThis.AulaPredict = {
  aplicarResultados: aplicarPayloadExterno,
  reiniciarResultados: volverANuevaCaptura,
  verificarRecepcionAutomatica,
  extraerHipotesis,
  renderizarAnalisisIndependiente,
  iniciarCamara,
  detenerCamara
};
