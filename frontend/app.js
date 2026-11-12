"use strict";

const elemento = (id) => (typeof document !== "undefined" && document.getElementById ? document.getElementById(id) : null);

// ============================================================================
// AulaPredict · Módulo Especializado de Predicción Universitaria
// Inferencia Facial, Detección de Alumnos en Capturas y Proyección Académica
// ============================================================================

const EJEMPLO_EXAMEN_DEFAULT = {
  _nota: "SINTÉTICO: ejemplo de integración, pendiente de validar con salidas reales",
  segundo_actual: 12,
  ventana_segundos: 60,
  objetos_permitidos: ["libro"],
  video: {
    modelo: "SistemaSupervisionExamenes/best.pt",
    frames: [
      {
        frame_id: 80,
        timestamp: 10,
        calidad: 0.9,
        detecciones: [
          { clase: "persona", confianza: 0.91 },
          { clase: "telefono", confianza: 0.82 }
        ]
      }
    ]
  },
  imagen: {
    modulo: "IMAGEN",
    modelo: "SistemaSupervisionExamenes-Imagen",
    frames: [
      {
        frame_id: 80,
        timestamp: 10,
        calidad_normalizada: 0.85,
        objetos: [
          {
            id: "objeto-1",
            clase: "telefono",
            confianza_video: 0.82,
            confianza_procesada: 0.88,
            estado: "confirmada"
          },
          {
            id: "objeto-2",
            clase: "reloj",
            confianza_video: 0.40,
            confianza_procesada: 0.20,
            estado: "no_confirmada"
          }
        ]
      }
    ]
  }
};

if (elemento("entrada")) {
  elemento("entrada").value = JSON.stringify(EJEMPLO_EXAMEN_DEFAULT, null, 2);
}

if (elemento("servidor")) {
  elemento("servidor").value =
    typeof location !== "undefined" && location.protocol === "file:"
      ? "http://localhost:8001"
      : typeof location !== "undefined"
      ? location.origin
      : "http://localhost:8001";
}

let enCurso = false;
let motorActual = "examen";
const entradas = {
  examen: elemento("entrada") ? elemento("entrada").value : "",
  seguimiento: null
};

// ============================================================================
// ESTADO DEL CLIENTE DE PREDICCIÓN BASADO EN CAPTURAS
// ============================================================================
let estudiantesEnCaptura = [];
let estudianteSeleccionadoId = null;
let animCanvasId = null;
let modoCapturaCongelada = false;
let estadoCuadricula = "espera";
let panelEstudiantesExpandido = false;
let ultimoResultadoFacial = null;
let ultimoResultadoAudio = null;
let ultimoResultadoAcademico = null;

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
  no_aprueba: "No aprueba"
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

// Datos calibrados de demostración (utilizados en pruebas y simulación)
const DEMO_INICIAL_ESTUDIANTES = [
  {
    id: 1,
    nombre: "Estudiante 1",
    subId: "0.91",
    estado: "Concentrado en sesión",
    accionDetectada: "Atento a la clase sin distractores",
    estadoClase: "status-concentrado",
    atencion: 92,
    tipoAtencion: "attention-fill-green",
    emociones: {
      neutral: 82,
      felicidad: 12,
      tristeza: 4,
      miedo: 5,
      enojo: 3,
      sorpresa: 2,
      disgusto: 2,
      dominante: "Neutral / Concentración (😐)"
    },
    causas: [
      { texto: "Descanso adecuado y preparación previa del tema", prob: 89 },
      { texto: "Estabilidad emocional y motivación activa", prob: 81 }
    ],
    consecuencias: [
      { texto: "Alta asimilación conceptual y retención óptima en clase", prob: 88 },
      { texto: "Bajo riesgo de desaprobación ('jalar') en el examen parcial", prob: 12 }
    ],
    score: 15,
    nivelRiesgo: "Riesgo de Desempeño: BAJO / ÓPTIMO",
    esRiesgoAlto: false,
    alertaExamen: "Bajo riesgo de desaprobación ('jalar'). Proyección favorable para rendir y aprobar el examen parcial con solvencia.",
    narrativa: "El Estudiante 1 ingresó en un estado emocional neutro y enfocado, manteniendo atención visual constante en la sesión. Se proyecta un dominio sólido de la materia y mínimo riesgo de desaprobar el examen parcial. **Recomendación:** Mantener la dinámica participativa actual y motivar el liderazgo en grupos de estudio.",
    box: { x: 0.35, y: 0.18, w: 0.30, h: 0.54 },
    label: "Estudiante 1 - Persona (0.91)",
    distractor: false
  }
];

// ============================================================================
// RENDERIZADO DE PANELES DE PREDICCIÓN
// ============================================================================

function renderizarPanelesInferiores(estudiante) {
  const modoSelect = elemento("modo-analisis-captura");
  const esFacial = Boolean(modoSelect && modoSelect.value === "facial");
  const labelDefault = esFacial ? "(Facial experimental)" : "(Sin selección)";
  const labels = typeof document !== "undefined" && document.querySelectorAll ? document.querySelectorAll(".selected-student-label") : [];
  labels.forEach(el => {
    el.textContent = estudiante ? `(${estudiante.nombre})` : labelDefault;
  });

  const emoNeutral = elemento("emo-pct-neutral");
  const barNeutral = elemento("emo-bar-neutral");
  const emoFelicidad = elemento("emo-pct-felicidad");
  const barFelicidad = elemento("emo-bar-felicidad");
  const emoTristeza = elemento("emo-pct-tristeza");
  const barTristeza = elemento("emo-bar-tristeza");
  const emoMiedo = elemento("emo-pct-miedo");
  const barMiedo = elemento("emo-bar-miedo");
  const emoEnojo = elemento("emo-pct-enojo");
  const barEnojo = elemento("emo-bar-enojo");
  const emoSorpresa = elemento("emo-pct-sorpresa");
  const barSorpresa = elemento("emo-bar-sorpresa");
  const emoDisgusto = elemento("emo-pct-disgusto");
  const barDisgusto = elemento("emo-bar-disgusto");
  const domEmoText = elemento("dominant-emotion-text");
  const actionBadge = elemento("student-action-badge");

  // Restaurar visibilidad de las 7 filas de emociones para modo aula
  ["neutral", "felicidad", "tristeza", "miedo", "enojo", "sorpresa", "disgusto"].forEach(k => {
    const it = elemento(`emo-item-${k}`);
    if (it) it.style.display = "";
  });

  const lblNeutral = elemento("emo-label-neutral"); if (lblNeutral) lblNeutral.textContent = "Neutral (😐)";
  const lblFelicidad = elemento("emo-label-felicidad"); if (lblFelicidad) lblFelicidad.textContent = "Alegría (😊)";
  const lblTristeza = elemento("emo-label-tristeza"); if (lblTristeza) lblTristeza.textContent = "Tristeza (😢)";
  const lblMiedo = elemento("emo-label-miedo"); if (lblMiedo) lblMiedo.textContent = "Miedo (😨)";
  const lblEnojo = elemento("emo-label-enojo"); if (lblEnojo) lblEnojo.textContent = "Enojo (😠)";
  const lblSorpresa = elemento("emo-label-sorpresa"); if (lblSorpresa) lblSorpresa.textContent = "Sorpresa (😲)";
  const lblDisgusto = elemento("emo-label-disgusto"); if (lblDisgusto) lblDisgusto.textContent = "Disgusto (🤢)";

  const facialTitle = elemento("facial-card-title");
  const facialSub = elemento("facial-card-sublabel");
  const facialFooter = elemento("facial-card-footer");
  const eventsTitle = elemento("events-card-title");
  const eventsFooter = elemento("events-card-footer");
  const academicTitle = elemento("academic-card-title");
  const academicFooter = elemento("academic-card-footer");

  if (!estudiante) {
    if (facialTitle) facialTitle.textContent = esFacial ? '🔮 Reconocimiento Facial (Facial experimental)' : '🔮 Reconocimiento Facial (Sin selección)';
    if (facialSub) facialSub.textContent = esFacial ? "Estimación experimental de la expresión facial (datos reales)" : "Estimación experimental de la expresión facial";
    if (facialFooter) facialFooter.innerHTML = esFacial ? '<span>🔬 Modelo Facial HOG+SVM (fase8-1.0) · CMU Face Images (4 expresiones verificadas)</span>' : '<span>Modelo facial experimental · Categorías observables</span>';

    if (eventsTitle) eventsTitle.textContent = esFacial ? '📋 Predicción de Sucesos Probables (Inactivo en captura individual)' : '📋 Predicción de Sucesos Probables (Sin selección)';
    if (eventsFooter) eventsFooter.innerHTML = esFacial ? '<span>Requiere supervisión de aula o secuencia temporal</span>' : '<span>Proyección de sucesos basada en contexto y tiempo en aula</span>';

    if (academicTitle) academicTitle.textContent = esFacial ? '📈 Análisis y Proyección Académica (Independiente)' : '📈 Análisis y Proyección Académica (Sin selección)';
    if (academicFooter) academicFooter.innerHTML = '<span>La evaluación académica requiere datos curriculares verificados (escala 0-20)</span>';

    // Reseteo limpio cuando no hay estudiantes en la captura o antes de capturar
    if (emoNeutral && barNeutral) { emoNeutral.textContent = "0%"; barNeutral.style.width = "0%"; }
    if (emoFelicidad && barFelicidad) { emoFelicidad.textContent = "0%"; barFelicidad.style.width = "0%"; }
    if (emoTristeza && barTristeza) { emoTristeza.textContent = "0%"; barTristeza.style.width = "0%"; }
    if (emoMiedo && barMiedo) { emoMiedo.textContent = "0%"; barMiedo.style.width = "0%"; }
    if (emoEnojo && barEnojo) { emoEnojo.textContent = "0%"; barEnojo.style.width = "0%"; }
    if (emoSorpresa && barSorpresa) { emoSorpresa.textContent = "0%"; barSorpresa.style.width = "0%"; }
    if (emoDisgusto && barDisgusto) { emoDisgusto.textContent = "0%"; barDisgusto.style.width = "0%"; }
    if (domEmoText) domEmoText.textContent = "Sin evaluar — Esperando captura";
    if (actionBadge) actionBadge.textContent = esFacial ? "Análisis facial individual de identidad desconocida" : "Esperando detección en captura";

    const b1Icon = elemento("events-block1-icon"); if (b1Icon) b1Icon.textContent = "⏳";
    const b1Title = elemento("events-block1-title"); if (b1Title) b1Title.textContent = "Acontecimientos Previos (Causas Probables)";
    const b2Icon = elemento("events-block2-icon"); if (b2Icon) b2Icon.textContent = "🎯";
    const b2Title = elemento("events-block2-title"); if (b2Title) b2Title.textContent = "Acontecimientos Futuros (Consecuencias Estimadas)";

    const causesList = elemento("causes-list");
    if (causesList) {
      causesList.innerHTML = esFacial
        ? `<div class="prediction-empty-notice"><span>ℹ️</span><span>En espera de entrada independiente (imagen, audio WAV o notas académicas).<br>No se proyectan causas previas sin secuencia temporal ni supervisión grupal.</span></div>`
        : `<div class="prediction-empty-notice"><span>⏳</span><span>Esperando captura de aula para proyectar acontecimientos previos...</span></div>`;
    }
    const consequencesList = elemento("consequences-list");
    if (consequencesList) {
      consequencesList.innerHTML = esFacial
        ? `<div class="prediction-empty-notice"><span>ℹ️</span><span>Cada modalidad se ejecuta por separado sin inventar consecuencias futuras.</span></div>`
        : `<div class="prediction-empty-notice"><span>⏳</span><span>Esperando captura de aula para proyectar consecuencias futuras...</span></div>`;
    }
    const riskBanner = elemento("risk-score-banner");
    const riesgoScoreNum = elemento("riesgo-score-num");
    const riesgoNivelText = elemento("riesgo-nivel-text");
    const examRiskDesc = elemento("exam-risk-desc");
    const narrativeText = elemento("assistant-narrative-text");

    if (riskBanner) riskBanner.className = "risk-score-banner bg-risk-optimal";
    if (riesgoScoreNum) riesgoScoreNum.textContent = "—";
    if (riesgoNivelText) {
      riesgoNivelText.textContent = esFacial
        ? "Predicción académica independiente: faltan datos curriculares (G1 y G2)."
        : "Sin evaluar — Esperando captura";
    }
    if (examRiskDesc) {
      examRiskDesc.textContent = esFacial
        ? "Para calcular la proyección académica se requieren calificaciones curriculares (G1 y G2 en escala 0-20). Las expresiones faciales nunca sustituyen el desempeño académico."
        : "Presiona 'Capturar fotograma' o 'Subir Foto' para iniciar el análisis.";
    }
    if (narrativeText) {
      narrativeText.innerHTML = esFacial
        ? "Esperando captura facial, audio WAV o calificaciones académicas para evaluar cada modalidad de forma independiente sin asociar identidad."
        : "Esperando captura para evaluar las emociones y el desempeño de los estudiantes en el aula.";
    }
    return;
  }

  const b1Icon = elemento("events-block1-icon"); if (b1Icon) b1Icon.textContent = "⏳";
  const b1Title = elemento("events-block1-title"); if (b1Title) b1Title.textContent = "Acontecimientos Previos (Causas Probables)";
  const b2Icon = elemento("events-block2-icon"); if (b2Icon) b2Icon.textContent = "🎯";
  const b2Title = elemento("events-block2-title"); if (b2Title) b2Title.textContent = "Acontecimientos Futuros (Consecuencias Estimadas)";

  if (facialTitle) facialTitle.textContent = `🔮 Reconocimiento Facial: 7 Emociones (Histórico) (${estudiante.nombre})`;
  if (facialSub) facialSub.textContent = "Modelo sintético experimental (v2.5) · Supervisión de aula";
  if (facialFooter) facialFooter.innerHTML = '<span>🔬 Modelo Facial Histórico (7 Emociones) · Rasgos Sintéticos</span>';

  if (eventsTitle) eventsTitle.textContent = `📋 Predicción de Sucesos Probables (${estudiante.nombre})`;
  if (eventsFooter) eventsFooter.innerHTML = '<span>Proyección de sucesos de aula basada en postura y distractores</span>';

  if (academicTitle) academicTitle.textContent = `📈 Análisis y Proyección Académica (${estudiante.nombre})`;
  if (academicFooter) academicFooter.innerHTML = '<span>Modelo experimental entrenado con datos sintéticos</span>';

  const emos = estudiante.emociones || {};
  if (emoNeutral && barNeutral) {
    emoNeutral.textContent = `${emos.neutral !== undefined ? emos.neutral : (emos.neutral || 0)}%`;
    barNeutral.style.width = `${emos.neutral !== undefined ? emos.neutral : 0}%`;
  }
  if (emoFelicidad && barFelicidad) {
    emoFelicidad.textContent = `${emos.felicidad !== undefined ? emos.felicidad : 0}%`;
    barFelicidad.style.width = `${emos.felicidad !== undefined ? emos.felicidad : 0}%`;
  }
  if (emoTristeza && barTristeza) {
    emoTristeza.textContent = `${emos.tristeza !== undefined ? emos.tristeza : 0}%`;
    barTristeza.style.width = `${emos.tristeza !== undefined ? emos.tristeza : 0}%`;
  }
  if (emoMiedo && barMiedo) {
    emoMiedo.textContent = `${emos.miedo !== undefined ? emos.miedo : (emos.estres || 0)}%`;
    barMiedo.style.width = `${emos.miedo !== undefined ? emos.miedo : (emos.estres || 0)}%`;
  }
  if (emoEnojo && barEnojo) {
    emoEnojo.textContent = `${emos.enojo !== undefined ? emos.enojo : 0}%`;
    barEnojo.style.width = `${emos.enojo !== undefined ? emos.enojo : 0}%`;
  }
  if (emoSorpresa && barSorpresa) {
    emoSorpresa.textContent = `${emos.sorpresa !== undefined ? emos.sorpresa : 0}%`;
    barSorpresa.style.width = `${emos.sorpresa !== undefined ? emos.sorpresa : 0}%`;
  }
  if (emoDisgusto && barDisgusto) {
    emoDisgusto.textContent = `${emos.disgusto !== undefined ? emos.disgusto : 0}%`;
    barDisgusto.style.width = `${emos.disgusto !== undefined ? emos.disgusto : 0}%`;
  }
  if (domEmoText) {
    domEmoText.textContent = emos.dominante || "Neutral (😐)";
  }
  if (actionBadge) {
    actionBadge.textContent = estudiante.accionDetectada || "Atento a la clase sin distractores";
  }

  const causesList = elemento("causes-list");
  if (causesList) {
    causesList.innerHTML = (estudiante.causas || []).map(c => `
      <div class="prob-item">
        <div class="prob-item-text-row">
          <span class="prob-item-title">${c.texto}</span>
          <span class="prob-item-pct">${c.prob}% prob.</span>
        </div>
        <div class="prob-progress-track">
          <div class="prob-progress-fill" style="width: ${c.prob}%;"></div>
        </div>
      </div>
    `).join("");
  }

  const consequencesList = elemento("consequences-list");
  if (consequencesList) {
    consequencesList.innerHTML = (estudiante.consecuencias || []).map(c => `
      <div class="prob-item">
        <div class="prob-item-text-row">
          <span class="prob-item-title">${c.texto}</span>
          <span class="prob-item-pct">${c.prob}% prob.</span>
        </div>
        <div class="prob-progress-track">
          <div class="prob-progress-fill" style="width: ${c.prob}%;"></div>
        </div>
      </div>
    `).join("");
  }

  const riskBanner = elemento("risk-score-banner");
  const riesgoScoreNum = elemento("riesgo-score-num");
  const riesgoNivelText = elemento("riesgo-nivel-text");
  const examRiskDesc = elemento("exam-risk-desc");
  const narrativeText = elemento("assistant-narrative-text");

  if (riskBanner) {
    riskBanner.className = `risk-score-banner ${estudiante.esRiesgoAlto ? "bg-risk-high" : "bg-risk-optimal"}`;
  }
  if (riesgoScoreNum) riesgoScoreNum.textContent = estudiante.score;
  if (riesgoNivelText) riesgoNivelText.textContent = estudiante.nivelRiesgo;
  if (examRiskDesc) examRiskDesc.textContent = estudiante.alertaExamen;
  if (narrativeText) {
    narrativeText.innerHTML = (estudiante.narrativa || "").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  }
}

function renderizarAnalisisIndependiente(resultadoFacial = null, resultadoAcademico = null, resultadoAudio = null) {
  ultimoResultadoFacial = resultadoFacial && resultadoFacial.estado !== "sin_entrada" ? resultadoFacial : null;
  ultimoResultadoAcademico = resultadoAcademico && resultadoAcademico.estado !== "sin_entrada" ? resultadoAcademico : null;
  ultimoResultadoAudio = resultadoAudio && resultadoAudio.estado !== "sin_entrada" ? resultadoAudio : null;

  const img = ultimoResultadoFacial;
  const acad = ultimoResultadoAcademico;
  const aud = ultimoResultadoAudio;

  const hipImg = extraerHipotesis(img);
  const hipAud = extraerHipotesis(aud);
  const hipAcad = extraerHipotesis(acad);

  const labels = typeof document !== "undefined" && document.querySelectorAll ? document.querySelectorAll(".selected-student-label") : [];
  const rostros = img
    ? (img.rostros_detectados ?? (img.deteccion_facial === "sin_rostro" ? 0 : 1))
    : 0;
  const labelText = img
    ? (rostros === 1 ? "(Rostro 1 · Identidad desconocida)" : rostros > 1 ? `(${rostros} rostros detectados)` : "(Sin rostro detectado)")
    : aud && !acad
      ? "(Solo audio · Sin imagen)"
      : acad && !aud
        ? "(Solo académico · Sin imagen)"
        : (aud || acad)
          ? "(Sin fotografía)"
          : "(Facial experimental)";

  labels.forEach(el => { el.textContent = labelText; });
  const fLabel = elemento("facial-student-label"); if (fLabel) fLabel.textContent = labelText;

  const modalidadesActivas = [img && "Imagen", aud && "Audio", acad && "Académico"].filter(Boolean);
  const etiquetaModalidades = modalidadesActivas.length ? `(${modalidadesActivas.join(" + ")})` : "(Inactivo en captura individual)";
  const evLabel = elemento("events-student-label"); if (evLabel) evLabel.textContent = etiquetaModalidades;
  const acLabel = elemento("academic-student-label");
  if (acLabel) {
    acLabel.textContent = acad?.estado === "estimacion_experimental"
      ? "(Evaluación curricular)"
      : acad?.estado === "abstencion"
        ? "(Hipótesis no concluyente)"
        : acad?.estado === "evidencia_insuficiente"
          ? "(Datos incompletos)"
          : "(Independiente)";
  }

  // Título y subtítulo del panel facial
  const facialTitle = elemento("facial-card-title");
  if (facialTitle) {
    facialTitle.textContent = img
      ? `🔮 Reconocimiento Facial: 4 Expresiones Observables ${labelText}`
      : `🔮 Reconocimiento Facial ${labelText}`;
  }
  const facialSub = elemento("facial-card-sublabel");
  if (facialSub) {
    if (img) {
      const descMod = img.modelo ? describirModeloExperimental(img.modelo) : "HOG+SVM · fase8-1.0 · CMU Face Images";
      facialSub.textContent = `Modelo ${descMod} (${img.origen_entrenamiento === "sintetico" ? "datos sintéticos" : "datos reales"})`;
    } else {
      facialSub.textContent = "Sin fotografía enviada — Las demás modalidades operan de forma independiente";
    }
  }

  const puntajes = img?.puntajes_calibrados || img?.puntajes_no_calibrados;
  const usa7Clases = Boolean(puntajes && ("miedo" in puntajes || "sorpresa" in puntajes || "asco" in puntajes));

  const itemMiedo = elemento("emo-item-miedo"); if (itemMiedo) itemMiedo.style.display = usa7Clases ? "" : "none";
  const itemSorpresa = elemento("emo-item-sorpresa"); if (itemSorpresa) itemSorpresa.style.display = usa7Clases ? "" : "none";
  const itemDisgusto = elemento("emo-item-disgusto"); if (itemDisgusto) itemDisgusto.style.display = usa7Clases ? "" : "none";

  const itemNeutral = elemento("emo-item-neutral"); if (itemNeutral) itemNeutral.style.display = "";
  const itemFelicidad = elemento("emo-item-felicidad"); if (itemFelicidad) itemFelicidad.style.display = "";
  const itemTristeza = elemento("emo-item-tristeza"); if (itemTristeza) itemTristeza.style.display = "";
  const itemEnojo = elemento("emo-item-enojo"); if (itemEnojo) itemEnojo.style.display = "";

  const lblFelicidad = elemento("emo-label-felicidad"); if (lblFelicidad) lblFelicidad.textContent = "Alegría (😊)";
  const lblNeutral = elemento("emo-label-neutral"); if (lblNeutral) lblNeutral.textContent = "Neutral (😐)";
  const lblTristeza = elemento("emo-label-tristeza"); if (lblTristeza) lblTristeza.textContent = "Tristeza (😢)";
  const lblEnojo = elemento("emo-label-enojo"); if (lblEnojo) lblEnojo.textContent = "Enojo (😠)";

  const setBarra = (pctId, barId, prob) => {
    const pctEl = elemento(pctId);
    const barEl = elemento(barId);
    const texto = typeof prob === "number" ? `${(prob * 100).toFixed(1)}%` : "0%";
    const ancho = typeof prob === "number" ? `${(prob * 100).toFixed(1)}%` : "0%";
    if (pctEl) pctEl.textContent = texto;
    if (barEl) barEl.style.width = ancho;
  };

  if (puntajes) {
    setBarra("emo-pct-felicidad", "emo-bar-felicidad", puntajes.alegria ?? puntajes.felicidad ?? 0);
    setBarra("emo-pct-neutral", "emo-bar-neutral", puntajes.neutral ?? 0);
    setBarra("emo-pct-enojo", "emo-bar-enojo", puntajes.enojo ?? 0);
    setBarra("emo-pct-tristeza", "emo-bar-tristeza", puntajes.tristeza ?? 0);
    if (usa7Clases) {
      setBarra("emo-pct-miedo", "emo-bar-miedo", puntajes.miedo ?? 0);
      setBarra("emo-pct-sorpresa", "emo-bar-sorpresa", puntajes.sorpresa ?? 0);
      setBarra("emo-pct-disgusto", "emo-bar-disgusto", puntajes.asco ?? puntajes.disgusto ?? 0);
    }
  } else {
    setBarra("emo-pct-felicidad", "emo-bar-felicidad", null);
    setBarra("emo-pct-neutral", "emo-bar-neutral", null);
    setBarra("emo-pct-enojo", "emo-bar-enojo", null);
    setBarra("emo-pct-tristeza", "emo-bar-tristeza", null);
    setBarra("emo-pct-miedo", "emo-bar-miedo", null);
    setBarra("emo-pct-sorpresa", "emo-bar-sorpresa", null);
    setBarra("emo-pct-disgusto", "emo-bar-disgusto", null);
  }

  const domEmoText = elemento("dominant-emotion-text");
  const actionBadge = elemento("student-action-badge");
  const facialFooter = elemento("facial-card-footer");

  if (actionBadge) {
    actionBadge.textContent = img
      ? "Sin supervisión de aula (análisis facial individual de identidad desconocida)"
      : "Modalidad independiente activa (sin atribución biométrica de identidad)";
  }

  if (domEmoText) {
    if (!img) {
      domEmoText.textContent = aud
        ? "Sin fotografía — Solo se evaluó la modalidad acústica"
        : acad
          ? "Sin fotografía — Solo se evaluó la modalidad académica"
          : "Sin fotografía evaluada";
    } else if (img.estado === "abstencion") {
      const motivos = traducirMotivosAbstencion(img.criterio_abstencion);
      domEmoText.textContent = hipImg
        ? `Hipótesis no concluyente: ${hipImg.label} (${hipImg.pctTexto}) · Abstención preventiva · ${motivos}`
        : `Abstención preventiva · ${motivos}`;
    } else if (img.estado === "estimacion_experimental") {
      const exp = formatearCategoria(img.expresion, true);
      const pctTxt = hipImg ? ` (${hipImg.pctTexto})` : "";
      domEmoText.textContent = `Expresión observable: ${exp}${pctTxt} · Clasificación concluyente (estimación experimental)`;
    } else if (img.estado === "evidencia_insuficiente") {
      domEmoText.textContent = ESTADOS_DETECCION_FACIAL[img.deteccion_facial] || "Evidencia facial insuficiente";
    } else if (img.estado === "modelo_no_disponible") {
      domEmoText.textContent = "Rostro detectado · Modelo facial no disponible";
    } else if (img.estado === "error_inferencia") {
      domEmoText.textContent = "Error técnico durante el análisis facial";
    } else {
      domEmoText.textContent = img.motivo || "Sin evaluación";
    }
  }

  if (facialFooter) {
    facialFooter.innerHTML = usa7Clases
      ? '<span>🔬 Modelo Facial Histórico (7 Emociones · Datos sintéticos)</span>'
      : '<span>🔬 Modelo Facial HOG+SVM (fase8-1.0) · CMU Face Images (4 expresiones verificadas)</span>';
  }

  // Tarjeta 2: Panel Dinámico de Resultados por Modalidad Independiente
  const eventsTitle = elemento("events-card-title");
  const b1Icon = elemento("events-block1-icon");
  const b1Title = elemento("events-block1-title");
  const b2Icon = elemento("events-block2-icon");
  const b2Title = elemento("events-block2-title");
  const causesList = elemento("causes-list");
  const consequencesList = elemento("consequences-list");
  const eventsFooter = elemento("events-card-footer");

  if (modalidadesActivas.length > 0) {
    if (eventsTitle) {
      eventsTitle.textContent = `📋 Resultados por Modalidad Independiente ${etiquetaModalidades}`;
    }
    if (b1Icon) b1Icon.textContent = "🔬";
    if (b1Title) b1Title.textContent = "Resultados e Hipótesis por Modalidad";
    if (b2Icon) b2Icon.textContent = "🛡️";
    if (b2Title) b2Title.textContent = "Alcance, Independencia y Límites";

    const itemsDiagnostico = [];
    const itemsLimites = [];

    if (img) {
      if (img.estado === "estimacion_experimental" && hipImg) {
        itemsDiagnostico.push(`
          <div class="prob-item conclusive-item">
            <div class="prob-item-text-row">
              <span class="prob-item-title">📸 Imagen · Clasificación facial concluyente: <strong>${escaparHtml(hipImg.label)}</strong></span>
              <span class="prob-item-pct">${escaparHtml(hipImg.pctTexto)}</span>
            </div>
            <div class="prob-progress-track"><div class="prob-progress-fill" style="width: ${hipImg.pctNum.toFixed(1)}%;"></div></div>
            <div class="prob-item-subnote">Rostros detectados: ${rostros} · Identidad desconocida (no atribuida) · ${img.calidad_entrada?.recorte_px ? `Recorte ${img.calidad_entrada.recorte_px[0]}×${img.calidad_entrada.recorte_px[1]} px` : "Umbral ≥ 55%, margen ≥ 10%"}.</div>
          </div>
        `);
      } else if (img.estado === "abstencion") {
        const motivos = traducirMotivosAbstencion(img.criterio_abstencion);
        itemsDiagnostico.push(`
          <div class="prob-item hypothesis-item">
            <div class="prob-item-text-row">
              <span class="prob-item-title">📸 Imagen · Hipótesis no concluyente: <strong>${escaparHtml(hipImg ? hipImg.label : "Sin hipótesis")}</strong> (Estado: abstención)</span>
              <span class="prob-item-pct">${escaparHtml(hipImg ? hipImg.pctTexto : "—")}</span>
            </div>
            <div class="prob-progress-track"><div class="prob-progress-fill" style="width: ${hipImg ? hipImg.pctNum.toFixed(1) : 0}%;"></div></div>
            <div class="prob-item-subnote">Motivo: ${escaparHtml(motivos)}. No se confirma categoría · Rostros: ${rostros} · Identidad desconocida.</div>
          </div>
        `);
      } else {
        const detalleDet = ESTADOS_DETECCION_FACIAL[img.deteccion_facial] || ESTADOS_FACIALES[img.estado] || img.motivo || "No evaluable";
        itemsDiagnostico.push(`
          <div class="prob-item error-item">
            <div class="prob-item-text-row">
              <span class="prob-item-title">📸 Imagen · ${escaparHtml(img.estado.replaceAll("_", " "))} (rostros: ${rostros})</span>
              <span class="prob-item-pct">Sin clasificar</span>
            </div>
            <div class="prob-item-subnote">${escaparHtml(detalleDet)}${img.motivo && !detalleDet.includes(img.motivo) ? ` · ${escaparHtml(img.motivo)}` : ""}</div>
          </div>
        `);
      }
    }

    if (aud) {
      if (aud.estado === "estimacion_experimental" && hipAud) {
        const top3 = hipAud.puntajesOrdenados.slice(0, 3).map(([k, v]) => `${formatearCategoria(k)} ${(v * 100).toFixed(1)}%`).join(" · ");
        const dur = aud.calidad_entrada?.duracion_segundos != null ? `${aud.calidad_entrada.duracion_segundos.toFixed(2)}s` : "WAV PCM16";
        itemsDiagnostico.push(`
          <div class="prob-item conclusive-item">
            <div class="prob-item-text-row">
              <span class="prob-item-title">🎙️ Audio · Clasificación vocal concluyente: <strong>${escaparHtml(hipAud.label)}</strong></span>
              <span class="prob-item-pct">${escaparHtml(hipAud.pctTexto)}</span>
            </div>
            <div class="prob-progress-track"><div class="prob-progress-fill" style="width: ${hipAud.pctNum.toFixed(1)}%;"></div></div>
            <div class="prob-item-subnote">Modelo acústico RAVDESS (no facial) · Duración: ${escaparHtml(dur)} · Top 3: ${escaparHtml(top3)} · Identidad no verificada.</div>
          </div>
        `);
      } else if (aud.estado === "abstencion") {
        const motivos = traducirMotivosAbstencion(aud.criterio_abstencion);
        const top3 = (hipAud?.puntajesOrdenados || []).slice(0, 3).map(([k, v]) => `${formatearCategoria(k)} ${(v * 100).toFixed(1)}%`).join(" · ");
        itemsDiagnostico.push(`
          <div class="prob-item hypothesis-item">
            <div class="prob-item-text-row">
              <span class="prob-item-title">🎙️ Audio · Hipótesis vocal no concluyente: <strong>${escaparHtml(hipAud ? hipAud.label : "Sin hipótesis")}</strong> (Estado: abstención)</span>
              <span class="prob-item-pct">${escaparHtml(hipAud ? hipAud.pctTexto : "—")}</span>
            </div>
            <div class="prob-progress-track"><div class="prob-progress-fill" style="width: ${hipAud ? hipAud.pctNum.toFixed(1) : 0}%;"></div></div>
            <div class="prob-item-subnote">Motivo: ${escaparHtml(motivos)}. Top 3 RAVDESS (8 clases, no facial): ${escaparHtml(top3 || "sin puntajes")}.</div>
          </div>
        `);
      } else if (aud.estado === "caracteristicas_declaradas") {
        const desc = Object.entries(aud.caracteristicas || {}).map(([k, v]) => `${k}: ${v}`).join(" · ");
        itemsDiagnostico.push(`
          <div class="prob-item warning-item">
            <div class="prob-item-text-row">
              <span class="prob-item-title">🎙️ Audio · Descriptores acústicos declarados (${aud.duracion_segundos ?? "—"}s)</span>
              <span class="prob-item-pct">Sin WAV</span>
            </div>
            <div class="prob-item-subnote">${escaparHtml(desc || "Sin descriptores adicionales")}. Proporciona un fragmento WAV PCM16 para ejecutar el clasificador acústico.</div>
          </div>
        `);
      } else {
        itemsDiagnostico.push(`
          <div class="prob-item error-item">
            <div class="prob-item-text-row">
              <span class="prob-item-title">🎙️ Audio · ${escaparHtml(aud.estado.replaceAll("_", " "))}</span>
              <span class="prob-item-pct">No evaluable</span>
            </div>
            <div class="prob-item-subnote">${escaparHtml(aud.motivo || "Entrada de audio incompatible o sin energía suficiente (se requiere WAV PCM16 8–48 kHz, 0.5–8s).")}</div>
          </div>
        `);
      }
    }

    if (acad) {
      if (acad.estado === "estimacion_experimental") {
        const pctRiesgo = Math.round((acad.probabilidad_no_aprueba ?? 0) * 100);
        const desenlaceTxt = acad.desenlace_estimado === "no_aprueba" ? "Riesgo de desaprobación (no aprueba)" : "Aprobación proyectada (aprueba)";
        itemsDiagnostico.push(`
          <div class="prob-item conclusive-item">
            <div class="prob-item-text-row">
              <span class="prob-item-title">📚 Académico · ${escaparHtml(desenlaceTxt)} (${escaparHtml(acad.desenlace || "G3 < 10/20")})</span>
              <span class="prob-item-pct">${pctRiesgo}% riesgo</span>
            </div>
            <div class="prob-progress-track"><div class="prob-progress-fill" style="width: ${pctRiesgo}%;"></div></div>
            <div class="prob-item-subnote">Evaluado de forma independiente con notas G1 y G2 (escala 0-20, corte ${escaparHtml(acad.corte || "despues_g2")}). ${escaparHtml(acad.limitacion || "")}</div>
          </div>
        `);
      } else if (acad.estado === "abstencion") {
        const motivos = traducirMotivosAbstencion(acad.criterio_abstencion);
        const pctRiesgo = acad.probabilidad_no_aprueba != null ? Math.round(acad.probabilidad_no_aprueba * 100) : 0;
        itemsDiagnostico.push(`
          <div class="prob-item hypothesis-item">
            <div class="prob-item-text-row">
              <span class="prob-item-title">📚 Académico · Hipótesis no concluyente: <strong>${escaparHtml(hipAcad ? hipAcad.label : "Limítrofe")}</strong> (abstención)</span>
              <span class="prob-item-pct">${acad.probabilidad_no_aprueba != null ? `${pctRiesgo}% riesgo` : "—"}</span>
            </div>
            <div class="prob-progress-track"><div class="prob-progress-fill" style="width: ${pctRiesgo}%;"></div></div>
            <div class="prob-item-subnote">Motivo: ${escaparHtml(motivos)}. No supera umbral ni margen para afirmación concluyente.</div>
          </div>
        `);
      } else if (acad.estado === "evidencia_insuficiente") {
        const faltantes = (acad.campos_faltantes || []).join(", ") || "G1, G2, corte, escala";
        itemsDiagnostico.push(`
          <div class="prob-item warning-item">
            <div class="prob-item-text-row">
              <span class="prob-item-title">📚 Académico · Evidencia insuficiente</span>
              <span class="prob-item-pct">Incompleto</span>
            </div>
            <div class="prob-item-subnote">Campos faltantes obligatorios: <strong>${escaparHtml(faltantes)}</strong>. El sistema nunca inventa calificaciones ausentes.</div>
          </div>
        `);
      } else {
        itemsDiagnostico.push(`
          <div class="prob-item error-item">
            <div class="prob-item-text-row">
              <span class="prob-item-title">📚 Académico · ${escaparHtml(acad.estado.replaceAll("_", " "))}</span>
              <span class="prob-item-pct">No disponible</span>
            </div>
            <div class="prob-item-subnote">${escaparHtml(acad.motivo || "Modelo académico no disponible en el servidor.")}</div>
          </div>
        `);
      }
    }

    const huboErrorParcial = [img, aud, acad].some(r => r && !["estimacion_experimental", "abstencion", "caracteristicas_declaradas"].includes(r.estado));
    const huboValido = [img, aud, acad].some(r => r && ["estimacion_experimental", "abstencion"].includes(r.estado));
    if (huboErrorParcial && huboValido) {
      itemsLimites.push(`<div class="prediction-empty-notice"><span>✅</span><span><strong>Aislamiento de fallos:</strong> Las entradas inválidas o sin rostro de una modalidad no invalidan los resultados válidos de las demás.</span></div>`);
    }
    itemsLimites.push(`<div class="prediction-empty-notice"><span>🛡️</span><span><strong>Sin sucesos artificiales:</strong> No se fabrican causas previas ni consecuencias futuras a partir de una fotografía individual ni de un fragmento de audio.</span></div>`);
    if (img || aud) {
      itemsLimites.push(`<div class="prediction-empty-notice"><span>ℹ️</span><span>Las expresiones faciales o vocales observables son independientes del desempeño escolar: no predicen aprobación académica, intenciones ni distracción.</span></div>`);
    }

    if (causesList) causesList.innerHTML = itemsDiagnostico.join("");
    if (consequencesList) consequencesList.innerHTML = itemsLimites.join("");
    if (eventsFooter) eventsFooter.innerHTML = '<span>Inferencia independiente por modalidad · Sin fusión automática entre fuentes</span>';
  } else {
    if (eventsTitle) eventsTitle.textContent = '📋 Predicción de Sucesos Probables (Inactivo en captura individual)';
    if (b1Icon) b1Icon.textContent = "⏳";
    if (b1Title) b1Title.textContent = "Acontecimientos Previos (Causas Probables)";
    if (b2Icon) b2Icon.textContent = "🎯";
    if (b2Title) b2Title.textContent = "Acontecimientos Futuros (Consecuencias Estimadas)";
    if (causesList) {
      causesList.innerHTML = `<div class="prediction-empty-notice"><span>ℹ️</span><span>En espera de entrada independiente (imagen, audio WAV o notas académicas).</span></div>`;
    }
    if (consequencesList) {
      consequencesList.innerHTML = `<div class="prediction-empty-notice"><span>ℹ️</span><span>La proyección de causas y consecuencias futuras solo aplica al Modo Captura de Aula.</span></div>`;
    }
    if (eventsFooter) {
      eventsFooter.innerHTML = '<span>Requiere supervisión de aula o evaluación independiente</span>';
    }
  }

  // Tarjeta 3: Análisis Académico
  const riskBanner = elemento("risk-score-banner");
  const riesgoScoreNum = elemento("riesgo-score-num");
  const riesgoNivelText = elemento("riesgo-nivel-text");
  const examRiskDesc = elemento("exam-risk-desc");
  const narrativeText = elemento("assistant-narrative-text");
  const academicTitle = elemento("academic-card-title");
  const academicFooter = elemento("academic-card-footer");

  if (academicTitle) {
    academicTitle.textContent = acad?.estado === "estimacion_experimental"
      ? '📈 Análisis y Proyección Académica (Evaluación curricular)'
      : acad?.estado === "abstencion"
        ? '📈 Análisis y Proyección Académica (Hipótesis no concluyente)'
        : acad?.estado === "evidencia_insuficiente"
          ? '📈 Análisis y Proyección Académica (Datos incompletos)'
          : '📈 Análisis y Proyección Académica (Independiente)';
  }

  if (acad && acad.estado === "estimacion_experimental") {
    const pctNoAprueba = Math.round((acad.probabilidad_no_aprueba ?? 0) * 100);
    if (riesgoScoreNum) riesgoScoreNum.textContent = String(pctNoAprueba);
    if (riesgoNivelText) {
      riesgoNivelText.textContent = acad.desenlace_estimado === "no_aprueba"
        ? "Riesgo de desaprobación (G3 < 10/20)"
        : "Aprobación proyectada (G3 >= 10/20)";
    }
    if (riskBanner) {
      riskBanner.className = `risk-score-banner ${acad.desenlace_estimado === "no_aprueba" ? "bg-risk-high" : "bg-risk-optimal"}`;
    }
    if (examRiskDesc) {
      examRiskDesc.textContent = `Proyección con modelo de investigación: ${(acad.probabilidad_no_aprueba * 100).toFixed(1)}% prob. de no aprobar. Variables: G1 y G2 (escala 0-20). Procedencia: UCI Student Performance.`;
    }
    if (academicFooter) {
      academicFooter.innerHTML = '<span>Modelo: Regresión Logística (fase7-1.0 · UCI Student Performance)</span>';
    }
  } else if (acad && acad.estado === "abstencion") {
    const pctNoAprueba = acad.probabilidad_no_aprueba != null ? Math.round(acad.probabilidad_no_aprueba * 100) : "—";
    if (riesgoScoreNum) riesgoScoreNum.textContent = String(pctNoAprueba);
    if (riesgoNivelText) {
      riesgoNivelText.textContent = `Hipótesis académica no concluyente (${hipAcad ? hipAcad.label : "abstención"})`;
    }
    if (riskBanner) riskBanner.className = "risk-score-banner bg-risk-unavailable";
    if (examRiskDesc) {
      examRiskDesc.textContent = `Resultado limítrofe (${traducirMotivosAbstencion(acad.criterio_abstencion)}). Probabilidad estimada de no aprobar: ${acad.probabilidad_no_aprueba != null ? `${(acad.probabilidad_no_aprueba * 100).toFixed(1)}%` : "—"}. Requiere revisión docente.`;
    }
    if (academicFooter) {
      academicFooter.innerHTML = '<span>Modelo: Regresión Logística (fase7-1.0 · Abstención preventiva)</span>';
    }
  } else if (acad && acad.estado === "evidencia_insuficiente") {
    const faltantes = (acad.campos_faltantes || []).join(", ") || "G1, G2, corte, escala";
    if (riskBanner) riskBanner.className = "risk-score-banner bg-risk-unavailable";
    if (riesgoScoreNum) riesgoScoreNum.textContent = "—";
    if (riesgoNivelText) riesgoNivelText.textContent = `Datos insuficientes · Faltan campos requeridos: ${faltantes}`;
    if (examRiskDesc) {
      examRiskDesc.textContent = `Faltan campos obligatorios (${faltantes}). Ingresa G1 y G2 en escala 0-20; el modelo no inventa calificaciones faltantes.`;
    }
    if (academicFooter) {
      academicFooter.innerHTML = '<span>Validación estricta de notas curriculares (sin imputación)</span>';
    }
  } else if (acad && (acad.estado === "modelo_no_disponible" || acad.estado === "error_inferencia")) {
    if (riskBanner) riskBanner.className = "risk-score-banner bg-risk-unavailable";
    if (riesgoScoreNum) riesgoScoreNum.textContent = "—";
    if (riesgoNivelText) riesgoNivelText.textContent = "Modelo académico no disponible en el servidor.";
    if (examRiskDesc) examRiskDesc.textContent = acad.motivo || "No fue posible cargar el clasificador académico.";
    if (academicFooter) academicFooter.innerHTML = '<span>Modelo académico ausente o inactivo</span>';
  } else {
    if (riskBanner) riskBanner.className = "risk-score-banner bg-risk-unavailable";
    if (riesgoScoreNum) riesgoScoreNum.textContent = "—";
    if (riesgoNivelText) riesgoNivelText.textContent = "Predicción académica no disponible: faltan datos académicos suficientes.";
    if (examRiskDesc) {
      examRiskDesc.textContent = "Para calcular la proyección académica se requieren calificaciones curriculares (G1 y G2 en escala 0-20). Las expresiones faciales o vocales nunca sustituyen el desempeño académico.";
    }
    if (academicFooter) {
      academicFooter.innerHTML = '<span>La evaluación académica requiere datos curriculares verificados</span>';
    }
  }

  // Resumen del Asistente Predictivo
  if (narrativeText) {
    const bloquesNarrativa = ["<strong>Resumen de la ejecución independiente:</strong>"];
    if (img) {
      const dMsg = rostros === 1
        ? "1 rostro detectado por OpenCV Haar Cascade"
        : rostros > 1 ? `${rostros} rostros detectados` : "Ningún rostro detectado";
      let fMsg = "Sin clasificar";
      if (img.estado === "abstencion") {
        fMsg = hipImg
          ? `Abstención del modelo HOG+SVM · Hipótesis no concluyente: <strong>${escaparHtml(hipImg.label)}</strong> (${hipImg.pctTexto}) por ${escaparHtml(traducirMotivosAbstencion(img.criterio_abstencion))}`
          : "Abstención del modelo HOG+SVM (confianza o margen insuficiente para clasificación categórica)";
      } else if (img.estado === "estimacion_experimental") {
        fMsg = `Expresión observable: <strong>${escaparHtml(img.expresion)}</strong> (${hipImg ? hipImg.pctTexto : "—"}) · clasificación concluyente`;
      } else if (img.estado === "evidencia_insuficiente") {
        fMsg = ESTADOS_DETECCION_FACIAL[img.deteccion_facial] || "Evidencia insuficiente";
      } else {
        fMsg = ESTADOS_FACIALES[img.estado] || img.estado;
      }
      bloquesNarrativa.push(`• <strong>Detección facial:</strong> ${dMsg} (identidad no atribuida).`);
      bloquesNarrativa.push(`• <strong>Modelo facial:</strong> ${fMsg}.`);
    }
    if (aud) {
      let aMsg = "";
      if (aud.estado === "estimacion_experimental" && hipAud) {
        aMsg = `Expresión vocal concluyente: <strong>${escaparHtml(hipAud.label)}</strong> (${hipAud.pctTexto}, RAVDESS).`;
      } else if (aud.estado === "abstencion") {
        aMsg = hipAud
          ? `Abstención acústica · Hipótesis vocal no concluyente: <strong>${escaparHtml(hipAud.label)}</strong> (${hipAud.pctTexto}) por ${escaparHtml(traducirMotivosAbstencion(aud.criterio_abstencion))}.`
          : "Abstención del modelo acústico RAVDESS.";
      } else if (aud.estado === "caracteristicas_declaradas") {
        aMsg = "Descriptores acústicos recibidos (requiere WAV PCM16 para inferencia RAVDESS).";
      } else {
        aMsg = `${aud.estado.replaceAll("_", " ")} (${aud.motivo || "sin señal válida"}).`;
      }
      bloquesNarrativa.push(`• <strong>Modalidad de audio:</strong> ${aMsg}`);
    }
    const acMsg = acad && acad.estado === "estimacion_experimental"
      ? `Proyección académica calculada: desenlace estimado '${escaparHtml(acad.desenlace_estimado)}' (${(acad.probabilidad_no_aprueba * 100).toFixed(1)}% prob. no aprobar) con notas G1/G2.`
      : acad && acad.estado === "abstencion"
        ? `Abstención académica (${escaparHtml(traducirMotivosAbstencion(acad.criterio_abstencion))}).`
        : acad && acad.estado === "evidencia_insuficiente"
          ? `Insuficiente (faltan campos: ${escaparHtml((acad.campos_faltantes || []).join(", "))}).`
          : "No disponible (faltan notas curriculares G1 y G2 en escala 0-20).";
    bloquesNarrativa.push(`• <strong>Proyección académica:</strong> ${acMsg}`);
    bloquesNarrativa.push("• <strong>Limitación:</strong> Cada modalidad es independiente; las expresiones faciales o vocales no determinan rendimiento escolar ni diagnósticos.");
    narrativeText.innerHTML = bloquesNarrativa.join("<br>");
  }
}

function renderizarResultadoFacial(resultadoFacial, resultadoAcademico, resultadoAudio) {
  return renderizarAnalisisIndependiente(resultadoFacial, resultadoAcademico, resultadoAudio);
}

function renderizarCuadriculaEstudiantes() {
  const container = elemento("students-grid");
  if (!container) return;

  const card = elemento("students-selection-card");
  const panelTitle = elemento("students-panel-title");
  const panelSubtitle = elemento("students-panel-subtitle");
  const countBadge = elemento("students-count-badge");
  const toggleBtn = elemento("btn-toggle-students-panel");
  const toggleIcon = elemento("students-toggle-icon");
  const toggleLabel = elemento("students-toggle-label");

  const selectModo = elemento("modo-analisis-captura");
  const modo = selectModo ? selectModo.value : (estadoCuadricula === "facial" ? "facial" : "aula");
  const esFacial = modo === "facial";

  if (esFacial) {
    if (card) card.classList.add("compact-mode");
    if (panelTitle) panelTitle.textContent = "🎯 Detección y Análisis Facial";

    if (!ultimoResultadoFacial) {
      if (countBadge) countBadge.textContent = "Esperando captura facial";
      if (panelSubtitle) panelSubtitle.textContent = "Captura o sube una fotografía para detectar el rostro y estimar su expresión";
      if (toggleBtn) toggleBtn.hidden = true;
      container.innerHTML = `
        <div class="facial-waiting-compact">
          <span class="facial-waiting-icon">📸</span>
          <div class="facial-waiting-text">
            <strong>Esperando captura facial</strong>
            <p>Presiona 'Capturar fotograma' o 'Subir Foto' para evaluar la expresión observable sin asociar identidades.</p>
          </div>
        </div>
      `;
      return;
    }

    const rostros = ultimoResultadoFacial.rostros_detectados
      ?? (ultimoResultadoFacial.deteccion_facial === "sin_rostro" ? 0 : 1);
    const estado = ultimoResultadoFacial.estado;
    const det = ultimoResultadoFacial.deteccion_facial;

    if (rostros === 1 || det === "rostro_detectado" || det === "rostro_pequeno" || estado === "abstencion" || estado === "estimacion_experimental") {
      if (countBadge) countBadge.textContent = "1 rostro detectado";
      if (panelSubtitle) panelSubtitle.textContent = "Análisis individual de expresión observable · Identidad desconocida";
      if (toggleBtn) {
        toggleBtn.hidden = false;
        if (typeof toggleBtn.setAttribute === "function") {
          toggleBtn.setAttribute("aria-expanded", String(panelEstudiantesExpandido));
        }
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
                <div class="facial-compact-avatar">👤</div>
                <div class="facial-compact-identity">Rostro 1 · Identidad desconocida</div>
              </div>
              <div class="facial-compact-status-badge ${badgeClase}">
                <span>●</span> ${badgeTexto}
              </div>
            </div>
            <p class="facial-compact-hint">Resultado facial disponible en el panel inferior. No se asocia a perfiles de alumnos ni registros académicos.</p>
          </div>
        `;
      } else {
        const dim = ultimoResultadoFacial.calidad_entrada?.recorte_px
          ? `${ultimoResultadoFacial.calidad_entrada.recorte_px[0]} × ${ultimoResultadoFacial.calidad_entrada.recorte_px[1]} px`
          : (ultimoResultadoFacial.rostros?.[0] ? `${ultimoResultadoFacial.rostros[0].ancho} × ${ultimoResultadoFacial.rostros[0].alto} px` : "Recorte frontal >= 64 × 64 px");
        container.innerHTML = `
          <div class="facial-compact-card expanded">
            <div class="facial-compact-header-row">
              <div class="facial-compact-id-group">
                <div class="facial-compact-avatar">👤</div>
                <div class="facial-compact-identity">Rostro 1 · Identidad desconocida</div>
              </div>
              <div class="facial-compact-status-badge ${badgeClase}">
                <span>●</span> ${badgeTexto}
              </div>
            </div>
            <div class="facial-details-box">
              <div class="facial-detail-item"><span>Detector facial:</span><strong>OpenCV Haar Cascade (frontalface_alt)</strong></div>
              <div class="facial-detail-item"><span>Clasificador:</span><strong>HOG + SVM (fase8-1.0 · CMU Face Images)</strong></div>
              <div class="facial-detail-item"><span>Dimensión recorte:</span><strong>${dim}</strong></div>
              <div class="facial-detail-item"><span>Identidad:</span><strong>No atribuida (análisis biométrico no vinculante)</strong></div>
              <div class="facial-detail-note">En modo facial experimental se evalúa únicamente la expresión observable en el rostro detectado. No se vincula a perfiles de alumnos ni registros académicos.</div>
            </div>
          </div>
        `;
      }
      return;
    }

    if (rostros === 0 || det === "sin_rostro") {
      if (countBadge) countBadge.textContent = "No se detectaron rostros";
      if (panelSubtitle) panelSubtitle.textContent = "Captura facial individual sin rostros identificados";
      if (toggleBtn) toggleBtn.hidden = true;
      container.innerHTML = `
        <div class="facial-empty-compact">
          <span class="facial-empty-icon">🚫</span>
          <div class="facial-empty-text">
            <strong>No se detectaron rostros</strong>
            <p>Asegúrate de que haya un rostro frontal visible y con iluminación adecuada.</p>
          </div>
        </div>
      `;
      return;
    }

    if (rostros > 1 || det === "multiples_rostros") {
      if (countBadge) countBadge.textContent = `${rostros} rostros detectados`;
      if (panelSubtitle) panelSubtitle.textContent = "Se detectaron múltiples rostros · Se requiere uno solo para clasificar";
      if (toggleBtn) toggleBtn.hidden = true;
      container.innerHTML = `
        <div class="facial-empty-compact">
          <span class="facial-empty-icon">👥</span>
          <div class="facial-empty-text">
            <strong>${rostros} rostros detectados</strong>
            <p>Encuadra un solo rostro frontal para realizar la clasificación facial experimental.</p>
          </div>
        </div>
      `;
      return;
    }

    // Caso de error u otro estado
    if (countBadge) countBadge.textContent = "Error de análisis";
    if (panelSubtitle) panelSubtitle.textContent = "Ocurrió un error técnico durante la inferencia facial";
    if (toggleBtn) toggleBtn.hidden = true;
    container.innerHTML = `
      <div class="facial-empty-compact">
        <span class="facial-empty-icon">⚠️</span>
        <div class="facial-empty-text">
          <strong>Error técnico durante el análisis facial</strong>
          <p>${ultimoResultadoFacial.motivo || "Puedes reintentar la captura o verificar el estado del servidor."}</p>
        </div>
      </div>
    `;
    return;
  }

  // MODO AULA
  if (card) card.classList.remove("compact-mode");
  if (panelTitle) panelTitle.textContent = "🎯 Selección y Estado de Alumnos en la Captura";
  if (panelSubtitle) panelSubtitle.textContent = "Haz clic en cualquier alumno de la captura para consultar su predicción individual";

  if (estudiantesEnCaptura.length === 0) {
    if (toggleBtn) toggleBtn.hidden = true;
    if (estadoCuadricula === "sin_modelos") {
      if (countBadge) countBadge.textContent = "Modelos no disponibles";
      container.textContent = "Modelos de predicción no disponibles para esta imagen.";
    } else if (estadoCuadricula === "sin_personas" || modoCapturaCongelada) {
      if (countBadge) countBadge.textContent = "0 Alumnos Detectados";
      container.innerHTML = `
        <div class="students-empty-state">
          <div class="empty-state-icon">🚫</div>
          <div class="empty-state-title">No se detectaron estudiantes en la captura</div>
          <div class="empty-state-desc">Asegúrate de que haya al menos un alumno visible en el encuadre o toma una nueva captura para generar predicciones.</div>
        </div>
      `;
    } else {
      if (countBadge) countBadge.textContent = "Esperando captura";
      container.innerHTML = `
        <div class="students-empty-state waiting-state">
          <div class="empty-state-icon">📸</div>
          <div class="empty-state-title">Esperando captura de imagen</div>
          <div class="empty-state-desc">Presiona 'Capturar fotograma' o 'Probar con Captura Grupal' para detectar a los alumnos presentes y consultar predicciones.</div>
        </div>
      `;
    }
    return;
  }

  if (countBadge) {
    countBadge.textContent = `${estudiantesEnCaptura.length} Alumno${estudiantesEnCaptura.length === 1 ? "" : "s"} Detectado${estudiantesEnCaptura.length === 1 ? "" : "s"}`;
  }
  if (toggleBtn) {
    toggleBtn.hidden = false;
    if (typeof toggleBtn.setAttribute === "function") {
      toggleBtn.setAttribute("aria-expanded", String(panelEstudiantesExpandido));
    }
  }
  if (toggleIcon) toggleIcon.textContent = panelEstudiantesExpandido ? "▲" : "▼";
  if (toggleLabel) toggleLabel.textContent = panelEstudiantesExpandido ? "Contraer" : "Expandir";

  if (!panelEstudiantesExpandido) {
    const sel = estudiantesEnCaptura.find(e => e.id === estudianteSeleccionadoId) || estudiantesEnCaptura[0];
    container.innerHTML = `
      <div class="aula-compact-summary">
        <span>👥 <strong>${estudiantesEnCaptura.length} alumnos disponibles</strong> · Seleccionado: <strong>${sel.nombre}</strong> (Ref. ${sel.id})</span>
        <span style="color: var(--color-blue); font-size: 11px; font-weight: 600;">Pulsa 'Expandir' para ver tarjetas</span>
      </div>
    `;
    return;
  }

  container.innerHTML = estudiantesEnCaptura.map(est => {
    const isSelected = est.id === estudianteSeleccionadoId;
    return `
      <div class="student-card-item ${isSelected ? "selected" : ""}" data-id="${est.id}" role="option" aria-selected="${isSelected}">
        <div class="student-card-header">
          <div class="student-avatar-mini">${est.id}</div>
          <div class="student-card-title-col">
            <span class="student-card-title"><strong>${est.nombre}</strong> · Referencia visual ${est.id}</span>
            <span class="student-card-status-badge ${est.estadoClase}">● ${est.estado}</span>
          </div>
        </div>
        <div class="student-attention-bar-wrap">
          <div class="attention-metric-row">
            <span class="attention-metric-label">Atención Estimada</span>
            <span class="attention-metric-value">${est.atencion}%</span>
          </div>
          <div class="attention-progress-track">
            <div class="attention-progress-fill ${est.tipoAtencion}" style="width: ${est.atencion}%;"></div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  const items = container.querySelectorAll(".student-card-item");
  items.forEach(card => {
    card.addEventListener("click", () => {
      const id = parseInt(card.getAttribute("data-id"), 10);
      seleccionarEstudiante(id);
    });
  });
}

function seleccionarEstudiante(id) {
  estudianteSeleccionadoId = id;
  const estudiante = estudiantesEnCaptura.find(e => e.id === id) || (estudiantesEnCaptura.length > 0 ? estudiantesEnCaptura[0] : null);
  renderizarCuadriculaEstudiantes();
  renderizarPanelesInferiores(estudiante);
}

function iniciarRelojEnVivo() {
  const label = elemento("live-datetime");
  if (!label) return;

  const actualizar = () => {
    const ahora = new Date();
    const pad = n => String(n).padStart(2, "0");
    const d = pad(ahora.getDate());
    const m = pad(ahora.getMonth() + 1);
    const y = ahora.getFullYear();
    const h = pad(ahora.getHours());
    const mi = pad(ahora.getMinutes());
    const s = pad(ahora.getSeconds());
    label.textContent = `${d}/${m}/${y} ${h}:${mi}:${s}`;
  };

  actualizar();
  setInterval(actualizar, 1000);
}

// ============================================================================
// CANVAS OVERLAY & DIBUJO DE RECUADROS SOBRE LA CAPTURA
// ============================================================================

function iniciarRenderizadoCanvas() {
  const canvas = elemento("overlay-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext ? canvas.getContext("2d") : null;
  if (!ctx) return;

  const renderLoop = () => {
    const w = canvas.clientWidth || 640;
    const h = canvas.clientHeight || 360;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.clearRect(0, 0, w, h);

    // En modo vista previa / encuadre (antes de congelar/capturar), mantener el visor 100% limpio
    if (!modoCapturaCongelada) {
      animCanvasId = requestAnimationFrame(renderLoop);
      return;
    }

    // Dibujar recuadro de cada alumno detectado ÚNICAMENTE sobre la captura congelada
    estudiantesEnCaptura.forEach(est => {
      const isSelected = est.id === estudianteSeleccionadoId;
      const bx = est.box.x * w;
      const by = est.box.y * h;
      const bw = est.box.w * w;
      const bh = est.box.h * h;

      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.strokeStyle = isSelected ? "#1D7AFC" : "#2563EB";
      ctx.fillStyle = isSelected ? "rgba(29, 122, 252, 0.12)" : "rgba(37, 99, 235, 0.05)";

      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(bx, by, bw, bh, 6);
      } else {
        ctx.rect(bx, by, bw, bh);
      }
      ctx.fill();
      ctx.stroke();

      const labelText = est.label;
      ctx.font = "bold 11px Inter, sans-serif";
      const textWidth = ctx.measureText(labelText).width;

      ctx.fillStyle = isSelected ? "#1D7AFC" : "#2563EB";
      ctx.fillRect(bx, by - 22, textWidth + 14, 22);

      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(labelText, bx + 7, by - 7);

      if (est.distractor && est.distractorBox) {
        const dx = est.distractorBox.x * w;
        const dy = est.distractorBox.y * h;
        const dw = est.distractorBox.w * w;
        const dh = est.distractorBox.h * h;

        ctx.lineWidth = 2;
        ctx.strokeStyle = "#DC2626";
        ctx.fillStyle = "rgba(220, 38, 38, 0.15)";
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(dx, dy, dw, dh, 4);
        } else {
          ctx.rect(dx, dy, dw, dh);
        }
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#DC2626";
        ctx.fillRect(dx, dy - 18, 90, 18);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 10px Inter, sans-serif";
        ctx.fillText(est.distractorBox.label, dx + 5, dy - 5);
      }
    });

    // Si no hay personas detectadas y la imagen está congelada, mostrar aviso en el visor
    if (estudiantesEnCaptura.length === 0 && estadoCuadricula === "sin_personas") {
      ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
      const boxW = Math.min(w * 0.7, 340);
      const boxH = 44;
      const bx = (w - boxW) / 2;
      const by = h * 0.42;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, 8);
        ctx.fill();
        ctx.strokeStyle = "#F59E0B";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.fillRect(bx, by, boxW, boxH);
      }
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 13px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("⚠️ Sin personas detectadas en la captura", w / 2, by + 27);
      ctx.textAlign = "start";
    }

    animCanvasId = requestAnimationFrame(renderLoop);
  };

  renderLoop();

  canvas.addEventListener("click", (evt) => {
    if (!modoCapturaCongelada || estudiantesEnCaptura.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = (evt.clientX - rect.left) / rect.width;
    const clickY = (evt.clientY - rect.top) / rect.height;

    for (const est of estudiantesEnCaptura) {
      if (
        clickX >= est.box.x &&
        clickX <= est.box.x + est.box.w &&
        clickY >= est.box.y &&
        clickY <= est.box.y + est.box.h
      ) {
        seleccionarEstudiante(est.id);
        break;
      }
    }
  });
}

// ============================================================================
// FLUJO DE CAPTURA REAL DE CÁMARA E INVOCACIÓN DEL MOTOR DE PREDICCIÓN
// ============================================================================

const INTERVALO_DETECCION_MS = 500;
const MEDIAPIPE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32";
const BLAZEFACE_URL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
let sesionCamara = null;
let peticionCaptura = null;

function estadoCaptura(mensaje) {
  elemento("capture-status-text").textContent = mensaje;
}

function estadoAutomatico(mensaje) {
  elemento("auto-capture-status").textContent = mensaje;
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

function tieneRostro(detecciones) {
  return detecciones.some(({ boundingBox }) => boundingBox?.width > 0 && boundingBox.height > 0);
}

function programarDeteccion(sesion) {
  actualizarEstadoAutomatico();
  const revisar = async () => {
    const video = elemento("webcam-feed");
    const intervalo = Math.max(5, Number(elemento("auto-capture-interval").value) || 5) * 1000;
    const puedeCapturar = () => sesionCamara === sesion && !document.hidden &&
      elemento("auto-capture-enabled").checked && !modoCapturaCongelada && !peticionCaptura &&
      performance.now() - sesion.ultimaCaptura >= intervalo;
    try {
      if (puedeCapturar() && !video.paused && video.readyState >= 2 && video.currentTime !== sesion.ultimoFrame) {
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
  if (!sesionCamara.detectar) {
    if (elemento("auto-capture-enabled").checked && !sesionCamara.preparando) {
      const sesion = sesionCamara;
      sesion.preparando = true;
      return iniciarDetector(sesion).finally(() => { sesion.preparando = false; });
    }
    if (!elemento("auto-capture-enabled").checked) estadoAutomatico("Captura automática desactivada.");
    return;
  }
  const detector = sesionCamara.nativo ? "detector del navegador" : "MediaPipe";
  estadoAutomatico(elemento("auto-capture-enabled").checked
    ? `Captura automática lista con ${detector}. El intervalo se aplica a toda la cámara.`
    : "Captura automática pausada. La captura manual sigue disponible.");
}

async function iniciarCamara() {
  if (sesionCamara) return;
  const video = elemento("webcam-feed");
  const sesion = { ultimaCaptura: -Infinity, ultimoFrame: -1 };
  sesionCamara = sesion;
  elemento("btn-start-camera").disabled = true;
  elemento("btn-stop-camera").hidden = false;
  estadoCaptura("Solicitando acceso a la cámara…");

  let iniciandoVideo = false;
  let limiteVideo;
  try {
    if (globalThis.isSecureContext === false || !globalThis.navigator?.mediaDevices?.getUserMedia) {
      detenerCamara();
      estadoCaptura("La cámara requiere un navegador compatible en localhost o HTTPS. Puedes subir una foto.");
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
        estadoCaptura("La cámara se desconectó. Puedes volver a encenderla o subir una foto.");
      });
    }
    iniciandoVideo = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    video.classList.add("active");
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
    if (sesionCamara !== sesion) return;
    sesion.lista = true;
    volverANuevaCaptura();
    await actualizarEstadoAutomatico();
  } catch (error) {
    if (sesionCamara !== sesion) return;
    detenerCamara();
    if (iniciandoVideo) {
      estadoCaptura("La cámara se abrió, pero el visor no pudo reproducir el video. Vuelve a encenderla o sube una foto.");
    } else if (["NotAllowedError", "SecurityError"].includes(error?.name)) {
      estadoCaptura("Permiso de cámara denegado. Habilítalo en el navegador o sube una foto.");
    } else if (error?.name === "NotFoundError") {
      estadoCaptura("No se encontró una cámara disponible. Conéctala o sube una foto.");
    } else if (["NotReadableError", "TrackStartError"].includes(error?.name)) {
      estadoCaptura("No se pudo abrir la cámara. Comprueba si otra aplicación la está usando o sube una foto.");
    } else {
      estadoCaptura("No se pudo iniciar la cámara. Revisa el dispositivo o sube una foto.");
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
  video.srcObject = null;
  video.classList.remove("active");
  elemento("btn-start-camera").disabled = false;
  elemento("btn-stop-camera").hidden = true;
  elemento("auto-capture-enabled").checked = false;
  volverANuevaCaptura();
}

function capturarFrame(video) {
  if (!sesionCamara?.stream || !video.videoWidth || !video.videoHeight || video.paused) {
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

const CONTEXTOS_SIMULADOS = new Map([
  ["celular", { acciones_detectadas: ["uso_celular"], objetos: ["telefono"] }],
  ["audifonos", { acciones_detectadas: ["uso_audifonos"], objetos: ["audifonos"] }],
  ["cansancio", { acciones_detectadas: ["postura_cansancio", "durmiendo"], objetos: [] }]
]);
const ERRORES_CAPTURA = {
  400: "El servidor no pudo leer la solicitud.",
  413: "La imagen supera el tamaño admitido por el servidor.",
  422: "El servidor rechazó el formato de la imagen.",
  500: "El motor de predicción no pudo analizar la imagen. Verifica el servidor y sus modelos."
};
const ESTADOS_FACIALES = {
  estimacion_experimental: "Rostro detectado · Estimación de expresión disponible",
  abstencion: "Rostro detectado · Abstención del modelo facial",
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

async function solicitarAnalisis(imagen, signal, facial) {
  const contexto = CONTEXTOS_SIMULADOS.get(elemento("select-contexto-simulado").value);
  const cuerpo = facial
    ? { schema_version: 1, imagen: { imagen_b64: imagen, modelo_facial: "real" } }
    : { imagen_b64: imagen };
  if (!facial && contexto) cuerpo.contexto_externo = contexto;
  const ruta = facial ? "analisis-experimental" : "analizar-captura";

  let respuesta;
  try {
    const baseCaptura = location.protocol === "file:" ? "http://localhost:8001" : location.origin;
    respuesta = imagen === null
      ? await fetch(`${baseCaptura}/api/prediccion/ejemplo-aula`, { signal })
      : await fetch(`${baseCaptura}/api/prediccion/${ruta}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cuerpo), signal
        });
  } catch {
    throw new Error("No se pudo conectar con el servidor de predicción.");
  }
  if (!respuesta.ok) throw new Error(ERRORES_CAPTURA[respuesta.status] || `Error HTTP ${respuesta.status}.`);

  const datos = await respuesta.json().catch(() => null);
  if (facial) {
    const resultado = datos?.fuentes?.imagen;
    if (!Object.hasOwn(ESTADOS_FACIALES, resultado?.estado)) {
      throw new Error("El servidor devolvió una respuesta facial inválida.");
    }
    return resultado;
  }
  if (!Array.isArray(datos?.estudiantes) || datos.total_alumnos !== datos.estudiantes.length ||
      datos.estudiantes.some(estudiante => !Number.isInteger(estudiante?.id))) {
    throw new Error("El servidor devolvió una respuesta de captura inválida.");
  }
  return datos;
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
  const facial = origen !== "ejemplo" && elemento("modo-analisis-captura").value === "facial";
  resultadoFacial.textContent = "";
  elemento("overlay-canvas").classList.remove("interactivo");
  estudiantesEnCaptura = [];
  estadoCuadricula = facial ? "facial" : "espera";
  seleccionarEstudiante(null);
  capturaManual.disabled = cargaFoto.disabled = true;
  estadoCaptura(origen === "automatica" ? "Analizando captura automática…"
    : origen === "ejemplo" ? "Cargando ejemplo sintético…"
      : origen === "archivo" ? "Leyendo fotografía…" : "Capturando fotograma…");
  let agotado = false;
  const limite = setTimeout(() => { agotado = true; controlador.abort(); }, 30000);
  try {
    const imagen = await obtenerImagen(signal);
    if (signal.aborted) return;
    if (esCamara && sesionCamara) sesionCamara.ultimaCaptura = performance.now();
    modoCapturaCongelada = origen !== "automatica";
    if (modoCapturaCongelada) {
      const foto = elemento("captured-image-display");
      if (imagen !== null) foto.src = imagen;
      foto.style.display = imagen === null ? "none" : "block";
      elemento("webcam-feed").style.display = "none";
      elemento("camera-placeholder").classList.add("hidden");
    }
    if (imagen !== null) {
      estadoCaptura(origen === "archivo" ? "Fotografía seleccionada · Analizando…" : "Fotograma capturado · Analizando…");
    }
    const datos = await solicitarAnalisis(imagen, signal, facial);
    if (signal.aborted) return;

    if (facial) {
      elemento("cam-location-label").textContent = "Captura facial";
      lista(resultadoFacial, "Expresión facial experimental · identidad desconocida", lineasDemoModelo("Imagen", datos));
      estadoCaptura(datos.estado === "evidencia_insuficiente" && Object.hasOwn(ESTADOS_DETECCION_FACIAL, datos.deteccion_facial)
        ? ESTADOS_DETECCION_FACIAL[datos.deteccion_facial] : ESTADOS_FACIALES[datos.estado]);
      renderizarResultadoFacial(datos);
      renderizarCuadriculaEstudiantes();
      return;
    }

    const disponibles = datos.modelos_predictivos_disponibles !== false;
    estudiantesEnCaptura = disponibles ? datos.estudiantes : [];
    elemento("overlay-canvas").classList.toggle("interactivo", modoCapturaCongelada && estudiantesEnCaptura.length > 0);
    estadoCuadricula = disponibles ? "sin_personas" : "sin_modelos";
    seleccionarEstudiante(estudiantesEnCaptura[origen === "ejemplo" ? 2 : 0]?.id ?? null);
    elemento("cam-location-label").textContent = datos.resolucion_captura || "Captura";
    if (!disponibles) {
      estadoCaptura("Modelos predictivos no disponibles. No se muestran estimaciones.");
      elemento("auto-capture-enabled").checked = false;
      if (sesionCamara) estadoAutomatico("Captura automática pausada. Revisa el estado de los modelos.");
    } else {
      const mensaje = origen === "ejemplo" ? `Ejemplo sintético · ${datos.total_alumnos} perfiles ficticios` : datos.total_alumnos
        ? `Captura analizada · ${datos.total_alumnos} ${datos.total_alumnos === 1 ? "persona" : "personas"} · identidad desconocida`
        : "No se detectaron personas en la imagen.";
      estadoCaptura(datos.estado_modelos === "modo_respaldo" ? `${mensaje} · Detección de respaldo` : mensaje);
    }
  } catch (error) {
    if (signal.aborted && !agotado) return;
    estudiantesEnCaptura = [];
    estadoCuadricula = facial ? "facial" : "espera";
    seleccionarEstudiante(null);
    const mensajeError = agotado ? "El servidor tardó demasiado en responder. Puedes reintentar." : error.message;
    estadoCaptura(mensajeError);
    if (facial) {
      renderizarResultadoFacial({ estado: "error_inferencia", motivo: mensajeError, rostros_detectados: 0 });
      renderizarCuadriculaEstudiantes();
    }
    if (origen === "automatica") {
      elemento("auto-capture-enabled").checked = false;
      estadoAutomatico("Captura automática pausada tras el error. Puedes reactivarla.");
    }
  } finally {
    clearTimeout(limite);
    peticionCaptura = null;
    capturaManual.disabled = !sesionCamara?.lista;
    cargaFoto.disabled = false;
  }
}

function ejecutarCapturaYPrediccion() {
  return procesarCaptura(() => capturarFrame(elemento("webcam-feed")).toDataURL("image/jpeg", 0.88), "manual");
}

// Acción: "🔄 Nueva Captura"
function volverANuevaCaptura() {
  const video = elemento("webcam-feed");
  const imgDisplay = elemento("captured-image-display");
  const statusText = elemento("capture-status-text");

  if (imgDisplay) imgDisplay.style.display = "none";
  if (video) video.style.display = "block";
  elemento("camera-placeholder").classList.toggle("hidden", Boolean(sesionCamara?.lista));
  elemento("overlay-canvas").classList.remove("interactivo");
  elemento("resultado-facial-captura").textContent = "";
  elemento("btn-capture-predict").disabled = Boolean(peticionCaptura) || !sesionCamara?.lista;
  modoCapturaCongelada = false;
  estadoCuadricula = "espera";
  estudiantesEnCaptura = [];
  estudianteSeleccionadoId = null;
  ultimoResultadoFacial = null;
  ultimoResultadoAudio = null;
  ultimoResultadoAcademico = null;
  panelEstudiantesExpandido = false;

  if (statusText) statusText.textContent = sesionCamara?.lista ? "Cámara lista" : "Cámara detenida";
  if (!sesionCamara) estadoAutomatico("La captura automática requiere una cámara activa.");
  renderizarCuadriculaEstudiantes();
  renderizarPanelesInferiores(null);
}

// Acción: "🖼️ Probar con Captura Grupal"
function cargarEscenarioAulaEjemplo() {
  ultimoResultadoFacial = null;
  ultimoResultadoAudio = null;
  ultimoResultadoAcademico = null;
  panelEstudiantesExpandido = true;
  return procesarCaptura(() => null, "ejemplo");
}

function configurarSubidaFoto() {
  const entrada = elemento("input-upload-image");
  entrada.addEventListener("change", (evento) => {
    const archivo = evento.target.files?.[0];
    entrada.value = "";
    if (!archivo) return;
    const formato = archivo.type ? /^(image\/(jpeg|png|webp))$/i.test(archivo.type) : /\.(jpe?g|png|webp)$/i.test(archivo.name);
    if (!formato || archivo.size === 0 || archivo.size > 5 * 1024 ** 2) {
      estadoCaptura("Selecciona una foto JPEG, PNG o WebP de hasta 5 MiB.");
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

// Configuración de los listeners de la interfaz
function configurarEventosCaptura() {
  const btnStartCam = elemento("btn-start-camera");
  const btnCapture = elemento("btn-capture-predict");
  const btnNewCapture = elemento("btn-new-capture");
  const btnGroupClassroom = elemento("btn-group-classroom");

  if (btnStartCam) btnStartCam.addEventListener("click", iniciarCamara);
  if (btnCapture) btnCapture.addEventListener("click", ejecutarCapturaYPrediccion);
  if (btnNewCapture) btnNewCapture.addEventListener("click", () => {
    peticionCaptura?.controlador.abort();
    volverANuevaCaptura();
  });
  if (btnGroupClassroom) btnGroupClassroom.addEventListener("click", cargarEscenarioAulaEjemplo);
  elemento("btn-stop-camera").addEventListener("click", detenerCamara);
  elemento("auto-capture-enabled").addEventListener("change", actualizarEstadoAutomatico);

  const btnToggle = elemento("btn-toggle-students-panel");
  if (btnToggle) {
    btnToggle.addEventListener("click", () => {
      panelEstudiantesExpandido = !panelEstudiantesExpandido;
      renderizarCuadriculaEstudiantes();
    });
  }

  configurarSubidaFoto();

  const selectModo = elemento("modo-analisis-captura");
  if (selectModo) {
    selectModo.addEventListener("change", (e) => {
      const modo = e.target.value;
      ultimoResultadoFacial = null;
      ultimoResultadoAudio = null;
      ultimoResultadoAcademico = null;
      estudiantesEnCaptura = [];
      estudianteSeleccionadoId = null;
      if (modo === "facial") {
        estadoCuadricula = "facial";
        panelEstudiantesExpandido = false;
        estadoCaptura("Modo facial experimental seleccionado. Captura o sube una fotografía con rostro frontal.");
      } else {
        estadoCuadricula = "espera";
        panelEstudiantesExpandido = true;
        estadoCaptura("Modo captura de aula histórica seleccionado. Captura o sube una imagen de aula con estudiantes.");
      }
      renderizarCuadriculaEstudiantes();
      renderizarPanelesInferiores(null);
    });
  }
}

configurarEventosCaptura();
if (typeof window !== "undefined") {
  renderizarCuadriculaEstudiantes();
  renderizarPanelesInferiores(null);
  iniciarRelojEnVivo();
  iniciarRenderizadoCanvas();
  window.addEventListener("pagehide", () => {
    peticionCaptura?.controlador.abort();
    detenerCamara();
  });
}

// ============================================================================
// COMPATIBILIDAD 100% CON SUITE DE PRUEBAS AUTOMATIZADAS (tests/test_frontend.cjs)
// ============================================================================

const servidor = () => {
  const el = elemento("servidor");
  if (!el || !el.value) return "http://localhost:8001";
  return el.value.replace(/\/+$/, "");
};

function ocupar(activo) {
  enCurso = activo;
  if (elemento("ejecutar")) elemento("ejecutar").disabled = activo;
  if (elemento("motor")) elemento("motor").disabled = activo;
}

function limpiarResultado() {
  const cont = elemento("resultados-estudiantes");
  if (cont) {
    if (typeof cont.replaceChildren === "function") cont.replaceChildren();
    else cont.children = [];
  }
}

function lista(contenedor, titulo, textos) {
  if (!textos || !textos.length) return;
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

async function cargarEstadoIntegracion() {
  const panel = elemento("integracion-modulos");
  const boton = elemento("actualizar-integracion");
  if (boton) boton.disabled = true;
  try {
    const respuesta = await fetch(`${servidor()}/api/modulos`);
    if (!respuesta.ok) throw new Error();
    const datos = await respuesta.json();
    if (!Array.isArray(datos.modulos)) throw new Error();
    panel.replaceChildren();
    for (const fuente of ["imagen", "video", "audio"]) {
      const modulo = datos.modulos.find(m => m.nombre === fuente);
      const li = document.createElement("li");
      const nombre = fuente.toUpperCase();
      if (!modulo) li.textContent = `${nombre} · no evaluado · estado no disponible`;
      else if (fuente === "audio" || modulo.estado_integracion === "integracion_pendiente") {
        li.textContent = `${nombre} · productor y contrato pendientes (pendiente de integración)`;
      }
      else if (!modulo.archivos_presentes?.length) li.textContent = `${nombre} · adaptador no disponible (datos insuficientes)`;
      else li.textContent = `${nombre} · adaptador disponible (disponible) · ${modulo.validacion || "Validación del productor pendiente"}`;
      panel.append(li);
    }
  } catch {
    const li = document.createElement("li");
    li.textContent = "No se pudo consultar el estado de imagen, video y audio.";
    panel.replaceChildren(li);
  } finally {
    if (boton) boton.disabled = false;
  }
}

elemento("actualizar-integracion").addEventListener("click", cargarEstadoIntegracion);
if (typeof window !== "undefined") void cargarEstadoIntegracion();

function describirModeloExperimental(modelo) {
  const fuente = modelo.origen ?? modelo.dataset?.nombre ?? modelo.dataset?.fuente ?? modelo.dataset?.dominio;
  return `${modelo.nombre ?? modelo.algoritmo} · ${modelo.version} · ${fuente}`;
}

function lineasDemoModelo(nombre, resultado) {
  const lineas = [`${nombre} · ${resultado.estado.replaceAll("_", " ")}`];
  if (resultado.modelo) lineas.push(describirModeloExperimental(resultado.modelo));
  if (resultado.referencia?.origen) lineas.push(`Procedencia · ${resultado.referencia.origen} · ${resultado.referencia.naturaleza}`);
  if (resultado.referencia?.sesion_id) lineas.push(`Sesión declarada · ${resultado.referencia.sesion_id}`);
  if (resultado.procedencia) lineas.push(resultado.procedencia.replaceAll("_", " "));
  const categoria = resultado.expresion ?? resultado.expresion_vocal ?? resultado.desenlace_estimado;
  if (categoria) lineas.push(`Categoría · ${categoria}`);
  if (resultado.desenlace) lineas.push(`Desenlace · ${resultado.desenlace}`);
  if (resultado.campos_faltantes) lineas.push(`Campos faltantes · ${resultado.campos_faltantes.join(", ")}`);
  if (Number.isInteger(resultado.rostros_detectados)) lineas.push(`Rostros detectados · ${resultado.rostros_detectados}`);
  if (resultado.motivo) lineas.push(resultado.motivo.replaceAll("_", " "));
  if (resultado.criterio_abstencion?.motivos.length) lineas.push(resultado.criterio_abstencion.motivos.join(", ").replaceAll("_", " "));
  if (resultado.puntajes_calibrados) {
    lineas.push(`Probabilidades · ${Object.entries(resultado.puntajes_calibrados).map(([k, p]) => `${k} ${p.toFixed(3)}`).join(" · ")}`);
  }
  if (resultado.duplicado_de) lineas.push(`Resultado reutilizado de ${resultado.duplicado_de}`);
  return lineas;
}

let solicitudDemoIntegral = null;

elemento("verificar-demo-integral").addEventListener("click", async () => {
  const boton = elemento("verificar-demo-integral");
  const inventario = elemento("inventario-demo-integral");
  boton.disabled = true;
  inventario.textContent = "Consultando el backend y los archivos de modelos…";
  try {
    const respuestas = await Promise.all(["/api/salud", "/api/prediccion/modelos-investigacion?cargar=false"].map(ruta =>
      fetch(`${location.origin}${ruta}`, { signal: AbortSignal.timeout(10000) })));
    if (respuestas.some(r => !r.ok)) throw new Error();
    const modelos = await respuestas[1].json();
    inventario.textContent = "";
    lista(inventario, "Backend disponible", Object.entries(modelos).map(([tipo, datos]) =>
      `${tipo.replaceAll("_", " ")} · ${datos.estado === "archivo_presente" ? "archivo presente" : "no disponible"}`));
  } catch {
    inventario.textContent = "No se pudo comprobar el backend o el inventario.";
  } finally {
    boton.disabled = false;
  }
});

elemento("reiniciar-demo-integral").addEventListener("click", () => {
  solicitudDemoIntegral?.abort();
  solicitudDemoIntegral = null;
  elemento("ejecutar-demo-integral").disabled = false;
  elemento("demo-integral-caso").value = "todos";
  elemento("demo-integral-fusion").checked = false;
  elemento("resultados-demo-integral").replaceChildren();
  elemento("estado-demo-integral").textContent = "Demostración lista para volver a ejecutar.";
});

elemento("ejecutar-demo-integral").addEventListener("click", async () => {
  const boton = elemento("ejecutar-demo-integral");
  const estado = elemento("estado-demo-integral");
  const panel = elemento("resultados-demo-integral");
  if (solicitudDemoIntegral) return;
  const solicitud = new AbortController();
  solicitudDemoIntegral = solicitud;
  boton.disabled = true;
  panel.replaceChildren();
  estado.textContent = "Ejecutando la demostración local…";
  try {
    const respuesta = await fetch(`${location.origin}/api/prediccion/demostracion-integral`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caso: elemento("demo-integral-caso").value || "todos",
        solicitar_fusion: elemento("demo-integral-fusion").checked === true }),
      signal: AbortSignal.any([solicitud.signal, AbortSignal.timeout(60000)])
    });
    if (respuesta.status === 403) throw new Error("Abre el panel desde el servidor local");
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const salida = await respuesta.json();
    if (solicitudDemoIntegral !== solicitud) return;
    for (const caso of salida.casos) {
      const regla = caso.seguimiento.indicadores_academicos;
      const lineas = [
        `Asistencia registrada · ${regla.asistencia_registros ?? "sin datos"} · ausencias ${regla.ausencias ?? "sin datos"}`,
        `Participación · ${regla.participaciones ?? "sin datos"}`,
        `Prioridad por reglas · ${regla.prioridad_academica ?? "sin datos"}`,
        ...lineasDemoModelo("Modelo académico", caso.analisis.academico),
        ...Object.entries(caso.analisis.fuentes).flatMap(([nombre, resultado]) => lineasDemoModelo(nombre, resultado)),
        ...caso.analisis.sincronizacion.conflictos_referencia.map(conflicto => conflicto.replaceAll("_", " ")),
      ];
      for (const [modulo, evidencias] of Object.entries(caso.seguimiento.evidencia_por_modulo)) {
        if (modulo !== "contexto") lineas.push(`${modulo} · ${evidencias.length} observaciones del fixture`);
      }
      lista(panel, `Caso ${caso.caso} · ${caso.estudiante_id_ficticio}`, lineas);
    }
    lista(panel, "Integración de fuentes", [
      ...salida.fuentes_seguimiento.map(fuente => `${fuente.modulo} · ${fuente.origen} · ${fuente.observaciones_recibidas} observaciones`),
      `Registros académicos excluidos · ${salida.registros_academicos_excluidos.length}`,
      `Foto pública sin atribución · ${salida.muestras_publicas_sin_atribuir.imagen ? "disponible" : "ausente"}`,
      `WAV público sin atribución · ${salida.muestras_publicas_sin_atribuir.audio ? "disponible" : "ausente"}`,
    ]);
    const fusion = salida.fusion;
    const compatibilidad = fusion.compatible === null ? "compatibilidad sin comprobar" : fusion.compatible ? "compatible" : "incompatible";
    lista(panel, "Fusión experimental · muestra pública independiente", [
      `Artefacto ${fusion.disponible ? "disponible" : "ausente"} · ${compatibilidad} · ${fusion.ejecutada ? "ejecutada" : "sin ejecutar"}`,
      fusion.motivo.replaceAll("_", " "),
      ...(fusion.resultado ? lineasDemoModelo("RAVDESS", fusion.resultado) : []),
    ]);
    estado.textContent = "Demostración sintética completada. Las muestras públicas carecen de atribución a los perfiles ficticios.";
  } catch (error) {
    if (solicitudDemoIntegral !== solicitud) return;
    panel.replaceChildren();
    estado.textContent = `No se pudo ejecutar la demostración local (${error.message}).`;
  } finally {
    if (solicitudDemoIntegral === solicitud) {
      solicitudDemoIntegral = null;
      boton.disabled = false;
    }
  }
});

elemento("experimental-consultar-modelos").addEventListener("click", async () => {
  const boton = elemento("experimental-consultar-modelos");
  const panel = elemento("experimental-modelos");
  boton.disabled = true;
  panel.replaceChildren();
  try {
    const respuesta = await fetch(`${location.origin}/api/prediccion/modelos-investigacion?cargar=false`, {
      signal: AbortSignal.timeout(10000)
    });
    if (!respuesta.ok) throw new Error();
    const modelos = await respuesta.json();
    lista(panel, "Modelos de investigación", Object.entries(modelos).map(([tipo, datos]) => {
      const estado = datos.estado === "archivo_presente" ? "archivo presente, carga bajo demanda" : "no disponible";
      return [tipo.replaceAll("_", " "), estado, datos.modelo && describirModeloExperimental(datos.modelo)]
        .filter(Boolean).join(" · ");
    }));
  } catch {
    panel.textContent = "No se pudo consultar el estado de los modelos.";
  } finally {
    boton.disabled = false;
  }
});

function leerArchivoExperimental(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = () => reject(new Error("No se pudo leer el archivo."));
    lector.readAsDataURL(archivo);
  });
}

elemento("analisis-experimental").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const boton = elemento("experimental-ejecutar");
  if (boton.disabled) return;
  const estado = elemento("experimental-estado");
  const resultados = elemento("experimental-resultados");
  boton.disabled = true;
  resultados.replaceChildren();
  const vistas = elemento("experimental-previsualizaciones");
  vistas.replaceChildren();
  estado.textContent = "Analizando fuentes…";
  try {
    const rawJson = String(elemento("experimental-json")?.value ?? "").trim();
    const entrada = rawJson ? JSON.parse(rawJson) : { schema_version: 1 };
    if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) throw new Error("Se requiere un objeto JSON.");
    const archivo = elemento("experimental-foto").files?.[0];
    if (archivo) {
      if (archivo.size > 5 * 1024 * 1024) throw new Error("La foto supera 5 MiB.");
      if (entrada.imagen) throw new Error("Selecciona una foto o proporciona imagen en el JSON.");
      const imagen_b64 = await leerArchivoExperimental(archivo);
      entrada.imagen = { imagen_b64 };
    }
    const seleccionFacial = elemento("experimental-modelo-facial").value;
    if (seleccionFacial && seleccionFacial !== "automatico") {
      for (const fuente of [entrada.imagen, entrada.video]) {
        if (fuente && typeof fuente === "object" && !Array.isArray(fuente)) fuente.modelo_facial = seleccionFacial;
      }
    }
    const wav = elemento("experimental-audio").files?.[0];
    if (wav) {
      if (wav.size > 2 * 1024 * 1024) throw new Error("El WAV supera 2 MiB.");
      if (entrada.audio?.wav_b64) throw new Error("Selecciona un WAV o proporciona wav_b64 en el JSON.");
      const url = await leerArchivoExperimental(wav);
      entrada.audio = { ...entrada.audio, wav_b64: url.split(",", 2)[1] };
    }
    const g1El = elemento("experimental-acad-g1");
    const g2El = elemento("experimental-acad-g2");
    const g1Txt = String(g1El?.value ?? "").trim();
    const g2Txt = String(g2El?.value ?? "").trim();
    if (g1Txt !== "" || g2Txt !== "") {
      if (entrada.academico) throw new Error("Usa los campos G1/G2 o el bloque academico en JSON, no ambos.");
      const acad = { corte: "despues_g2", escala: "0-20" };
      if (g1Txt !== "") {
        const g1Val = Number(g1Txt);
        if (!Number.isInteger(g1Val) || g1Val < 0 || g1Val > 20) {
          g1El?.setAttribute?.("aria-invalid", "true");
          throw new Error("Nota G1 debe ser un número entero entre 0 y 20.");
        }
        g1El?.setAttribute?.("aria-invalid", "false");
        acad.G1 = g1Val;
      }
      if (g2Txt !== "") {
        const g2Val = Number(g2Txt);
        if (!Number.isInteger(g2Val) || g2Val < 0 || g2Val > 20) {
          g2El?.setAttribute?.("aria-invalid", "true");
          throw new Error("Nota G2 debe ser un número entero entre 0 y 20.");
        }
        g2El?.setAttribute?.("aria-invalid", "false");
        acad.G2 = g2Val;
      }
      entrada.academico = acad;
    }
    const cuerpo = JSON.stringify(entrada);
    if (new Blob([cuerpo]).size > 8 * 1024 * 1024) throw new Error("Las entradas combinadas superan 8 MiB.");
    const respuesta = await fetch(`${location.origin}/api/prediccion/analisis-experimental`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: cuerpo,
      signal: AbortSignal.timeout(30000)
    });
    const salida = await respuesta.json();
    if (!respuesta.ok) throw new Error(salida.detail || `HTTP ${respuesta.status}`);
    const bloques = { ...salida.fuentes, ...(salida.academico ? { academico: salida.academico } : {}) };
    for (const [nombre, resultado] of Object.entries(bloques)) {
      const lineas = [`Estado: ${resultado.estado.replaceAll("_", " ")}`];
      if (resultado.referencia) {
        const ref = resultado.referencia;
        lineas.push(`Procedencia ${ref.naturaleza} · origen ${ref.origen ?? "sin dato"} · sesión ${ref.sesion_id ?? "sin dato"} · evento ${ref.evento_id ?? "sin dato"} · identidad no verificada`);
      }
      if (resultado.modelo) lineas.push(`Modelo ${describirModeloExperimental(resultado.modelo)}`);
      if (resultado.origen_entrenamiento) lineas.push(`Datos de entrenamiento: ${resultado.origen_entrenamiento.replaceAll("_", " ")}`);
      if (resultado.duplicado_de) lineas.push(`Resultado reutilizado de ${resultado.duplicado_de}`);
      const categoria = resultado.expresion ?? resultado.expresion_vocal ?? resultado.desenlace_estimado;
      if (categoria) lineas.push(`Categoría estimada: ${categoria}`);
      if (resultado.puntajes_calibrados) {
        lineas.push("Probabilidades calibradas en el conjunto de investigación");
        lineas.push(...Object.entries(resultado.puntajes_calibrados).map(([k, p]) => `${k}: ${p.toFixed(3)}`));
      }
      if (resultado.puntajes_no_calibrados) {
        lineas.push("Puntajes sin calibración en rostros reales");
        lineas.push(...Object.entries(resultado.puntajes_no_calibrados).map(([k, p]) => `${k}: ${p.toFixed(3)}`));
      }
      const criterio = resultado.criterio_abstencion;
      if (resultado.estado === "abstencion" && criterio?.motivos?.length) {
        const motivos = criterio.motivos.map(motivo => motivo.replaceAll("_", " ")).join(", ");
        lineas.push(`Abstención por ${motivos}. Puntaje máximo ${criterio.maximo.toFixed(3)} (mínimo ${criterio.umbral.toFixed(2)}), margen ${criterio.margen_observado.toFixed(3)} (mínimo ${criterio.margen_minimo.toFixed(2)}).`);
      }
      if (resultado.caracteristicas) lineas.push(...Object.entries(resultado.caracteristicas).map(([k, v]) => `${k}: ${v}`));
      if (nombre === "audio" && !entrada.audio?.wav_b64) lineas.push("Productor y clasificador acústico pendientes para descriptores.");
      if (resultado.campos_faltantes) lineas.push(`Campos faltantes: ${resultado.campos_faltantes.join(", ")}`);
      if (resultado.desenlace) lineas.push(`Desenlace: ${resultado.desenlace} · corte ${resultado.corte}`);
      if (resultado.calidad_entrada) lineas.push(`Calidad de entrada: ${JSON.stringify(resultado.calidad_entrada)}`);
      if (resultado.limitacion) lineas.push(resultado.limitacion);
      if (resultado.motivo) lineas.push(resultado.motivo);
      lista(resultados, nombre.toUpperCase(), lineas);
      const imagen = entrada[nombre]?.imagen_b64;
      if (typeof imagen === "string" && resultado.estado !== "imagen_invalida") {
        const cabecera = imagen.match(/^data:(image\/(?:png|jpeg|webp|bmp|gif));base64,/i);
        const base64 = imagen.slice(cabecera?.[0].length ?? 0).replace(/\s/g, "");
        if (/^[a-z0-9+/]+={0,2}$/i.test(base64)) {
          const vista = document.createElement("img");
          vista.src = `data:${cabecera?.[1] ?? "image/jpeg"};base64,${base64}`;
          vista.alt = `Entrada de ${nombre}`;
          vista.width = 160;
          vistas.append(vista);
        }
      }
    }
    lista(resultados, "Sincronización de fuentes", [
      salida.sincronizacion.estado.replaceAll("_", " "),
      ...(salida.sincronizacion.referencias_compatibles && salida.sincronizacion.estado !== "sincronizadas"
        ? ["Referencias declaradas compatibles"] : []),
      ...(salida.sincronizacion.conflictos_referencia ?? []).map(conflicto => conflicto.replaceAll("_", " ")),
      "Fusión estadística pendiente."
    ]);
    const resImagen = salida.fuentes?.imagen && salida.fuentes.imagen.estado !== "sin_entrada"
      ? salida.fuentes.imagen
      : (salida.fuentes?.video && salida.fuentes.video.estado !== "sin_entrada" ? salida.fuentes.video : null);
    const resAudio = salida.fuentes?.audio && salida.fuentes.audio.estado !== "sin_entrada" ? salida.fuentes.audio : null;
    const resAcademico = salida.academico && salida.academico.estado !== "sin_entrada" ? salida.academico : null;
    if (resImagen || resAudio || resAcademico) {
      renderizarAnalisisIndependiente(resImagen, resAcademico, resAudio);
    }
    estado.textContent = "Evaluación experimental completada.";
  } catch (error) {
    resultados.replaceChildren();
    estado.textContent = `No se pudo evaluar: ${error.message}`;
  } finally {
    boton.disabled = false;
  }
});

const btnLimpiarExp = elemento("experimental-limpiar");
if (btnLimpiarExp) {
  btnLimpiarExp.addEventListener("click", () => {
    const fEl = elemento("experimental-foto"); if (fEl) fEl.value = "";
    const aEl = elemento("experimental-audio"); if (aEl) aEl.value = "";
    const mEl = elemento("experimental-modelo-facial"); if (mEl) mEl.value = "automatico";
    const g1El = elemento("experimental-acad-g1");
    if (g1El) { g1El.value = ""; g1El.setAttribute?.("aria-invalid", "false"); g1El.classList?.remove?.("user-invalid-fallback"); }
    const g2El = elemento("experimental-acad-g2");
    if (g2El) { g2El.value = ""; g2El.setAttribute?.("aria-invalid", "false"); g2El.classList?.remove?.("user-invalid-fallback"); }
    const jEl = elemento("experimental-json"); if (jEl) jEl.value = '{"schema_version":1}';
    elemento("experimental-resultados")?.replaceChildren?.();
    elemento("experimental-previsualizaciones")?.replaceChildren?.();
    const estEl = elemento("experimental-estado"); if (estEl) estEl.textContent = "Entradas experimentales reiniciadas.";
    ultimoResultadoFacial = null;
    ultimoResultadoAudio = null;
    ultimoResultadoAcademico = null;
    estudiantesEnCaptura = [];
    estudianteSeleccionadoId = null;
    renderizarCuadriculaEstudiantes();
    renderizarPanelesInferiores(null);
  });
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  const sincronizarValidezAcademica = (el) => {
    if (!el || !["experimental-acad-g1", "experimental-acad-g2"].includes(el.id)) return;
    const invalido = typeof el.matches === "function" && (el.matches(":user-invalid") || (el.validity && !el.validity.valid));
    el.setAttribute("aria-invalid", invalido ? "true" : "false");
    el.classList?.toggle("user-invalid-fallback", Boolean(invalido));
  };
  document.addEventListener("blur", (ev) => sincronizarValidezAcademica(ev.target), true);
  document.addEventListener("input", (ev) => {
    if (ev.target?.getAttribute?.("aria-invalid") === "true") sincronizarValidezAcademica(ev.target);
  });
}

function describirEvidencia(e) {
  if (e.tipo === "evento_familiar" && e.evento_familiar) {
    const evento = e.evento_familiar;
    return `Evento familiar declarado (simulado) · ${evento.fecha} · referencia: ${evento.referencia} · origen: ${e.origen}`;
  }
  const dato = typeof e.valor === "boolean" ? (e.valor ? "sí" : "no") : e.valor ?? e.estado;
  const partes = [e.id || e.tipo, dato, e.fecha_hora || e.fecha,
    e.origen && `origen: ${e.origen}`, e.naturaleza && `procedencia: ${e.naturaleza}`,
    e.modelo && `modelo: ${e.modelo}`,
    e.estudiante_id && `ID ${e.estudiante_id}`,
    e.presente === false && "ausencia explícita",
    e.modulo && `confianza: ${e.confianza ?? "sin dato"}`,
    e.modulo && `calidad: ${e.calidad ?? "sin dato"}${e.calidad_origen && e.calidad_origen !== "declarada" ? ` (${e.calidad_origen.replaceAll("_", " ")})` : ""}`,
    e.asociacion && `identidad: ${e.asociacion.metodo} · referencia: ${e.asociacion.referencia}`,
    !e.modulo && e.identidad_verificada && `identidad declarada verificada · confianza: ${e.confianza_identidad ?? "sin dato"}`];
  return partes.filter(p => p !== undefined && p !== null && p !== false && p !== "").join(" · ");
}

function mostrarSeguimiento(salida) {
  const contenedor = elemento("resultados-estudiantes");
  if (!contenedor) return;
  const validos = (salida.resultados || []).filter(r => r.indice_prioridad !== null);
  const maximo = validos.reduce((a, b) => !a || b.indice_prioridad > a.indice_prioridad ? b : a, null);

  const scoreVal = maximo ? maximo.indice_prioridad.toString() : "—";
  if (elemento("indice")) elemento("indice").textContent = scoreVal;

  const textoNivel = `DEMO SINTÉTICA · ${maximo ? maximo.nivel_revision : "datos insuficientes"}`;
  if (elemento("nivel")) elemento("nivel").textContent = textoNivel;
  if (elemento("recomendacion")) elemento("recomendacion").textContent = "Prioridades para revisión humana. Los avisos son sugerencias: no se envían mensajes ni se guardan historiales.";
  lista(contenedor, "Fuentes recibidas en esta evaluación",
    (salida.fuentes_recibidas || []).map(f => `${f.modulo} · sesión ${f.sesion_id} · ${f.origen} · ${f.naturaleza} · ${f.observaciones_recibidas} observaciones antes de deduplicar`));

  for (const r of (salida.resultados || [])) {
    const articulo = document.createElement("article");
    articulo.className = "resultado-estudiante";
    const titulo = document.createElement("h3");
    titulo.textContent = `${r.nombre ? `${r.nombre} · ` : ""}ID ${r.estudiante_id} · sesión ${r.sesion_id}`;
    const nivel = document.createElement("p");
    nivel.textContent = `${r.actividad} · ${(r.nivel_revision || "").replaceAll("_", " ")} · prioridad ${r.indice_prioridad ?? "sin datos"}`;
    const identidad = document.createElement("p");
    const observaciones = Object.entries(r.evidencia_por_modulo || {}).filter(([modulo]) => modulo !== "contexto");
    identidad.textContent = (r.tiene_observaciones_verificadas ?? observaciones.some(([, items]) => items.length))
      ? "Observaciones disponibles con asociación de identidad verificada según la entrada."
      : "Sin observaciones con identidad verificada para esta sesión.";
    articulo.append(titulo, nivel, identidad);
    if (r.indicadores_academicos) {
      const i = r.indicadores_academicos;
      lista(articulo, "Indicadores académicos por reglas", [
        `Prioridad académica: ${i.prioridad_academica ?? "datos insuficientes"}`,
        `Registros de asistencia: ${i.asistencia_registros ?? "sin dato"} · ausencias: ${i.ausencias ?? "sin dato"}`,
        `Participaciones declaradas: ${i.participaciones ?? "sin dato"}`,
        ...(i.reglas || []).map(regla => `${regla.regla} (+${regla.puntos}): ${regla.explicacion}`)
      ]);
    }

    if (r.reglas_activadas) {
      lista(articulo, "Reglas activadas", r.reglas_activadas.map(x => `${x.regla} (+${x.puntos}): ${x.explicacion} Referencias: ${(x.referencias || []).join(", ")}`));
      if (!r.reglas_activadas.length) lista(articulo, "Reglas", ["No se activaron reglas de alerta."]);
    }

    if (r.evidencia_por_modulo) {
      for (const [modulo, evidencias] of Object.entries(r.evidencia_por_modulo)) {
        lista(articulo, modulo === "contexto" ? "Evidencia · contexto e historial académico" : `Evidencia · ${modulo}`,
          evidencias.map(describirEvidencia));
      }
    }

    if (r.coincidencia_contextual) {
      lista(articulo, "Coincidencia contextual", [r.coincidencia_contextual.motivo,
        ...r.coincidencia_contextual.observaciones.map(o => `${o.modulo} · ${o.id} · ${o.valor} · calidad ${o.calidad}`),
        ...r.coincidencia_contextual.registros_academicos.map(a => `${a.tipo} · ${a.id || a.origen} · ${a.estado ?? a.valor}`)]);
    }
    if (r.datos_faltantes) lista(articulo, "Datos faltantes", r.datos_faltantes);
    if (r.contradicciones) lista(articulo, "Contradicciones por resolver", r.contradicciones);
    if (r.limitaciones) lista(articulo, "Límites de esta evaluación", r.limitaciones);
    if (r.recomendaciones) lista(articulo, "Recomendaciones", r.recomendaciones);
    if (r.avisar_a) lista(articulo, "Destinatarios sugeridos", r.avisar_a.length ? r.avisar_a : ["Sin destinatarios para este resultado."]);
    contenedor.append(articulo);
  }

  if (salida.observaciones_sin_atribuir) {
    lista(contenedor, "Observaciones sin atribuir", salida.observaciones_sin_atribuir.map(o =>
      `${o.modulo} · sesión ${o.sesion_id} · ${o.motivo} · ${describirEvidencia(o)}`));
  }
  if (salida.observaciones_descartadas) {
    lista(contenedor, "Observaciones descartadas", salida.observaciones_descartadas.map(o =>
      `${o.modulo} · sesión ${o.sesion_id} · ${o.motivo} · ${describirEvidencia(o)}`));
  }
  lista(contenedor, "Registros académicos excluidos", (salida.registros_academicos_excluidos || []).map(r =>
    `${r.tipo} · ${r.id} · sesión ${r.sesion_id}: ${r.motivo}`));
  if (salida.duplicados_omitidos !== undefined) {
    lista(contenedor, "Control de duplicados", [`${salida.duplicados_omitidos} retransmisiones idénticas omitidas.`]);
  }
  if (salida.limitaciones) {
    lista(contenedor, "Limitaciones", salida.limitaciones);
  }
}

async function cargarEjemplo() {
  const caso = elemento("ejemplo-seguimiento") ? elemento("ejemplo-seguimiento").value : "juan";
  ocupar(true);
  try {
    const res = await fetch(`${servidor()}/api/prediccion/estudiantes/ejemplos/${encodeURIComponent(caso)}`);
    const datos = await res.json();
    if (!res.ok) throw new Error(typeof datos.detail === "string" ? datos.detail : "No se pudo cargar el ejemplo.");
    if (elemento("entrada")) elemento("entrada").value = JSON.stringify(datos, null, 2);
    entradas.seguimiento = elemento("entrada") ? elemento("entrada").value : "";
    if (elemento("estado")) elemento("estado").textContent = "Escenario SINTÉTICO cargado. Puedes editarlo y evaluar.";
  } catch (error) {
    if (elemento("entrada")) elemento("entrada").value = "";
    if (elemento("estado")) elemento("estado").textContent = `No se pudo cargar: ${error.message}.`;
  } finally {
    ocupar(false);
  }
}

async function cambiarMotor() {
  if (elemento("entrada")) entradas[motorActual] = elemento("entrada").value;
  motorActual = elemento("motor").value;
  const seguimiento = motorActual === "seguimiento";
  if (elemento("controles-seguimiento")) elemento("controles-seguimiento").hidden = !seguimiento;
  if (elemento("controles-examen")) elemento("controles-examen").hidden = seguimiento;
  if (elemento("descripcion-indice")) {
    elemento("descripcion-indice").textContent = seguimiento
      ? "Prioridad heurística de seguimiento máxima entre las sesiones evaluadas / 100. No predice notas ni diagnósticos."
      : "Índice heurístico de revisión / 100. No es una probabilidad.";
  }
  if (elemento("ayuda")) {
    elemento("ayuda").textContent = seguimiento
      ? "Solo demostraciones simulado=true. No cargues datos reales: falta autenticación. La identidad requiere una referencia explícita revisada."
      : "Si combinas fechas de IMAGEN con VIDEO, indica imagen.origen_temporal. La calidad no se normaliza automáticamente.";
  }
  limpiarResultado();
  if (elemento("estado")) elemento("estado").textContent = "";
  if (elemento("entrada")) elemento("entrada").value = entradas[motorActual] || "";
  if (seguimiento && !entradas.seguimiento) await cargarEjemplo();
}
elemento("motor").addEventListener("change", cambiarMotor);

elemento("abrir-seguimiento").addEventListener("click", async () => {
  const avanzadas = elemento("advanced-tools-drawer");
  if (avanzadas) avanzadas.open = true;
  elemento("technical-drawer").open = true;
  const selector = elemento("motor");
  if (selector.disabled || selector.value === "seguimiento") return;
  selector.value = "seguimiento";
  await cambiarMotor();
});

if (elemento("cargar-ejemplo")) {
  elemento("cargar-ejemplo").addEventListener("click", cargarEjemplo);
}

if (elemento("archivo")) {
  elemento("archivo").addEventListener("change", async (evento) => {
    const archivo = evento.target && evento.target.files && evento.target.files[0];
    if (!archivo) return;
    try {
      if (archivo.size > 2 * 1024 * 1024) throw new Error("El JSON supera 2 MB.");
      const texto = await archivo.text();
      JSON.parse(texto);
      if (elemento("entrada")) elemento("entrada").value = texto;
      if (elemento("estado")) elemento("estado").textContent = `Archivo cargado: ${archivo.name}. Selecciona su formato antes de evaluar.`;
    } catch (error) {
      if (elemento("estado")) elemento("estado").textContent = error.message;
    }
  });
}

if (elemento("ejecutar")) {
  elemento("ejecutar").addEventListener("click", async () => {
    if (enCurso) return;
    try {
      const entradaEl = elemento("entrada");
      const datos = JSON.parse(entradaEl ? entradaEl.value : "{}");
      const formato = elemento("formato") ? elemento("formato").value : "integracion";
      const seguimiento = elemento("motor") ? elemento("motor").value === "seguimiento" : false;
      const cuerpo = !seguimiento && ["imagen", "video"].includes(formato) ? { [formato]: datos } : datos;
      const base = servidor();
      const ruta = seguimiento ? "/api/prediccion/estudiantes" : (formato === "interno" ? "/api/prediccion" : "/api/prediccion/integrar");

      ocupar(true);
      limpiarResultado();
      if (elemento("estado")) elemento("estado").textContent = "Evaluando señales y correlación de reglas...";
      if (elemento("nivel")) elemento("nivel").textContent = "Evaluando";
      if (elemento("indice")) elemento("indice").textContent = "—";
      if (elemento("recomendacion")) elemento("recomendacion").textContent = "";
      if (elemento("salida")) elemento("salida").textContent = "";

      const respuesta = await fetch(`${base}${ruta}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo)
      });
      const salida = await respuesta.json();

      if (!respuesta.ok) {
        const error = salida.error_integracion;
        const origen = error ? `Fuente ${error.indice + 1} (${error.modulo}, ${error.codigo}) · ` : "";
        throw new Error(origen + (typeof salida.detail === "string" ? salida.detail : JSON.stringify(salida.detail || salida)));
      }

      if (elemento("salida")) elemento("salida").textContent = JSON.stringify(salida, null, 2);

      if (seguimiento) {
        mostrarSeguimiento(salida);
      } else {
        const nivelTexto = (salida.nivel_revision || "datos_insuficientes").replaceAll("_", " ");
        if (elemento("nivel")) elemento("nivel").textContent = nivelTexto;

        const scoreStr = salida.indice_revision == null ? "—" : salida.indice_revision.toString();
        if (elemento("indice")) elemento("indice").textContent = scoreStr;

        if (elemento("recomendacion")) elemento("recomendacion").textContent = salida.recomendacion;
      }
      if (elemento("estado")) elemento("estado").textContent = "Evaluación completada con éxito.";
    } catch (error) {
      limpiarResultado();
      if (elemento("estado")) elemento("estado").textContent = `No se pudo evaluar: ${error.message}`;
      if (elemento("nivel")) elemento("nivel").textContent = "Sin resultado válido";
      if (elemento("indice")) elemento("indice").textContent = "—";
      if (elemento("recomendacion")) elemento("recomendacion").textContent = "Corrige la entrada y vuelve a evaluar.";
      if (elemento("salida")) elemento("salida").textContent = "";
    } finally {
      ocupar(false);
    }
  });
}
