"use strict";

const elemento = (id) => (typeof document !== "undefined" && document.getElementById ? document.getElementById(id) : null);

// ============================================================================
// AulaPredict · Módulo Especializado de Predicción Automática
// Recepción automática de IMAGEN, VIDEO y AUDIO · Evaluación independiente
// ============================================================================

let panelEstudiantesExpandido = false;
let ultimoResultadoImagen = null;
let ultimoResultadoVideo = null;
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

const ESTADOS_FACIALES = {
  estimacion_experimental: "Rostro detectado · Clasificación observable disponible",
  abstencion: "Rostro detectado · Abstención preventiva por incertidumbre",
  evidencia_insuficiente: "Evidencia visual insuficiente",
  imagen_invalida: "Entrada visual inválida",
  modelo_no_disponible: "Rostro detectado · Modelo facial no disponible",
  error_inferencia: "Error técnico durante la inferencia visual"
};

const ESTADOS_DETECCION_FACIAL = {
  sin_rostro: "No se detectó ningún rostro en la entrada visual.",
  rostro_pequeno: "Rostro detectado · Demasiado pequeño para clasificar",
  multiples_rostros: "Se detectaron múltiples rostros · Se requiere encuadre individual",
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
  if (!modelo) return "Modelo de inferencia";
  const fuente = modelo.origen ?? modelo.dataset?.nombre ?? modelo.dataset?.fuente ?? modelo.dataset?.dominio;
  return [modelo.nombre ?? modelo.algoritmo, modelo.version, fuente].filter(Boolean).join(" · ");
}

function setBarraExpresion(pctId, barId, prob) {
  const pctEl = elemento(pctId);
  const barEl = elemento(barId);
  const texto = typeof prob === "number" ? `${(prob * 100).toFixed(1)}%` : "0%";
  const ancho = typeof prob === "number" ? `${Math.max(0, Math.min(100, prob * 100)).toFixed(1)}%` : "0%";
  if (pctEl) pctEl.textContent = texto;
  if (barEl) barEl.style.width = ancho;
}

function actualizarBadgeModulo(modulo, resultado) {
  const badge = elemento(`mod-status-${modulo}`);
  const detail = elemento(`mod-detail-${modulo}`);
  if (!badge) return;

  if (!resultado || resultado.estado === "sin_entrada") {
    badge.className = "module-badge waiting";
    badge.textContent = "Sin datos recibidos";
    if (detail) {
      detail.textContent = modulo === "imagen" ? "Detección facial y expresión observable"
        : modulo === "video" ? "Fotogramas o secuencia visual"
          : modulo === "audio" ? "Clasificación acústica independiente"
            : "Datos curriculares compatibles";
    }
    return;
  }

  const estado = resultado.estado;
  if (estado === "estimacion_experimental") {
    badge.className = "module-badge ok";
    badge.textContent = "Concluyente";
  } else if (estado === "abstencion") {
    badge.className = "module-badge warn";
    badge.textContent = "Abstención";
  } else if (estado === "caracteristicas_declaradas") {
    badge.className = "module-badge warn";
    badge.textContent = "Descriptores recibidos";
  } else if (estado === "evidencia_insuficiente" || estado === "fuente_excluida") {
    badge.className = "module-badge warn";
    badge.textContent = "Evidencia insuficiente";
  } else {
    badge.className = "module-badge error";
    badge.textContent = estado.replaceAll("_", " ");
  }

  if (detail) {
    if (modulo === "imagen" || modulo === "video") {
      const rostros = resultado.rostros_detectados;
      detail.textContent = Number.isInteger(rostros)
        ? `${rostros} ${rostros === 1 ? "rostro detectado" : "rostros detectados"} · ${ESTADOS_FACIALES[estado] || estado}`
        : (ESTADOS_FACIALES[estado] || resultado.motivo || estado);
    } else if (modulo === "audio") {
      const hip = extraerHipotesis(resultado);
      detail.textContent = estado === "abstencion" && hip
        ? `Hipótesis vocal: ${hip.label} (${hip.pctTexto}) · RAVDESS`
        : estado === "estimacion_experimental" && hip
          ? `Vocal: ${hip.label} (${hip.pctTexto})`
          : (resultado.motivo || ESTADOS_FACIALES[estado] || "Señal acústica recibida");
    } else if (modulo === "academico") {
      detail.textContent = estado === "evidencia_insuficiente"
        ? `Faltan campos: ${(resultado.campos_faltantes || []).join(", ") || "G1, G2"}`
        : estado === "estimacion_experimental"
          ? `Desenlace estimado: ${resultado.desenlace_estimado}`
          : "Evaluación académica recibida";
    }
  }
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
  if (panelTitle) panelTitle.textContent = "🎯 Detección y Señales Visuales";
  if (!container) return;

  if (!visual) {
    if (countBadge) countBadge.textContent = "Sin datos";
    if (panelSubtitle) panelSubtitle.textContent = "Resumen de detección recibida desde IMAGEN o VIDEO";
    if (toggleBtn) toggleBtn.hidden = true;
    container.innerHTML = `
      <div class="facial-waiting-compact">
        <span class="facial-waiting-icon" aria-hidden="true">📡</span>
        <div class="facial-waiting-text">
          <strong>Esperando datos de los módulos IMAGEN, VIDEO y AUDIO</strong>
          <p>No se ha recibido ninguna detección visual compatible. Al llegar un evento válido se mostrará aquí sin atribuir identidad.</p>
        </div>
      </div>
    `;
    return;
  }

  const rostros = visual.rostros_detectados ?? (visual.deteccion_facial === "sin_rostro" ? 0 : 1);
  const estado = visual.estado;
  const det = visual.deteccion_facial;

  if (rostros === 1 || det === "rostro_detectado" || det === "rostro_pequeno" || estado === "abstencion" || estado === "estimacion_experimental") {
    if (countBadge) countBadge.textContent = "1 rostro detectado";
    if (panelSubtitle) panelSubtitle.textContent = "Evaluación automática de señal visual · Identidad desconocida";
    if (toggleBtn) {
      toggleBtn.hidden = false;
      toggleBtn.setAttribute?.("aria-expanded", String(panelEstudiantesExpandido));
    }
    if (toggleIcon) toggleIcon.textContent = panelEstudiantesExpandido ? "▲" : "▼";
    if (toggleLabel) toggleLabel.textContent = panelEstudiantesExpandido ? "Contraer" : "Detalles";

    const disponible = estado === "estimacion_experimental" || estado === "abstencion";
    const badgeTexto = disponible ? "Señal visual evaluada" : (det === "rostro_pequeno" ? "Rostro pequeño" : "Evidencia insuficiente");
    const badgeClase = disponible ? "available" : "abstention";

    if (!panelEstudiantesExpandido) {
      container.innerHTML = `
        <div class="facial-compact-card">
          <div class="facial-compact-header-row">
            <div class="facial-compact-id-group">
              <div class="facial-compact-avatar" aria-hidden="true">👤</div>
              <div class="facial-compact-identity">Rostro 1 · Identidad desconocida</div>
            </div>
            <div class="facial-compact-status-badge ${badgeClase}">
              <span>●</span> ${escaparHtml(badgeTexto)}
            </div>
          </div>
          <p class="facial-compact-hint">Las probabilidades e incertidumbre se muestran abajo sin asociar identidades personales ni historial escolar.</p>
        </div>
      `;
    } else {
      const dim = visual.calidad_entrada?.recorte_px
        ? `${visual.calidad_entrada.recorte_px[0]} × ${visual.calidad_entrada.recorte_px[1]} px`
        : (visual.rostros?.[0] ? `${visual.rostros[0].ancho} × ${visual.rostros[0].alto} px` : "Recorte frontal ≥ 64 × 64 px");
      const descMod = visual.modelo ? describirModeloExperimental(visual.modelo) : "HOG + SVM (fase8-1.0 · CMU Face Images)";
      container.innerHTML = `
        <div class="facial-compact-card expanded">
          <div class="facial-compact-header-row">
            <div class="facial-compact-id-group">
              <div class="facial-compact-avatar" aria-hidden="true">👤</div>
              <div class="facial-compact-identity">Rostro 1 · Identidad desconocida</div>
            </div>
            <div class="facial-compact-status-badge ${badgeClase}">
              <span>●</span> ${escaparHtml(badgeTexto)}
            </div>
          </div>
          <div class="facial-details-box">
            <div class="facial-detail-item"><span>Detector visual:</span><strong>${escaparHtml(visual.detector_facial || "OpenCV Haar Cascade")}</strong></div>
            <div class="facial-detail-item"><span>Clasificador:</span><strong>${escaparHtml(descMod)}</strong></div>
            <div class="facial-detail-item"><span>Dimensión recorte:</span><strong>${escaparHtml(dim)}</strong></div>
            <div class="facial-detail-item"><span>Identidad:</span><strong>No atribuida</strong></div>
          </div>
        </div>
      `;
    }
    return;
  }

  if (toggleBtn) toggleBtn.hidden = true;
  if (rostros === 0 || det === "sin_rostro") {
    if (countBadge) countBadge.textContent = "No se detectaron rostros";
    if (panelSubtitle) panelSubtitle.textContent = "Señal visual sin rostro identificable";
    container.innerHTML = `
      <div class="facial-empty-compact">
        <span class="facial-empty-icon" aria-hidden="true">🚫</span>
        <div class="facial-empty-text">
          <strong>No se detectaron rostros</strong>
          <p>La entrada recibida no contiene un rostro frontal con calidad suficiente para clasificar expresión.</p>
        </div>
      </div>
    `;
    return;
  }

  if (rostros > 1 || det === "multiples_rostros") {
    if (countBadge) countBadge.textContent = `${rostros} rostros detectados`;
    if (panelSubtitle) panelSubtitle.textContent = "Múltiples rostros · Sin clasificación individual";
    container.innerHTML = `
      <div class="facial-empty-compact">
        <span class="facial-empty-icon" aria-hidden="true">👥</span>
        <div class="facial-empty-text">
          <strong>${rostros} rostros detectados</strong>
          <p>La clasificación facial independiente requiere un único rostro encuadrado y no asocia perfiles individuales.</p>
        </div>
      </div>
    `;
    return;
  }

  if (countBadge) countBadge.textContent = "Error de entrada";
  if (panelSubtitle) panelSubtitle.textContent = "No se pudo procesar la señal visual recibida";
  container.innerHTML = `
    <div class="facial-empty-compact">
      <span class="facial-empty-icon" aria-hidden="true">⚠️</span>
      <div class="facial-empty-text">
        <strong>Señal visual no válida</strong>
        <p>${escaparHtml(visual.motivo || ESTADOS_FACIALES[estado] || "Entrada incompatible.")}</p>
      </div>
    </div>
  `;
}

function renderizarEstadoEspera() {
  ultimoResultadoImagen = null;
  ultimoResultadoVideo = null;
  ultimoResultadoAudio = null;
  ultimoResultadoAcademico = null;
  panelEstudiantesExpandido = false;

  ["imagen", "video", "audio", "academico"].forEach(m => actualizarBadgeModulo(m, null));

  const chip = elemento("capture-status-indicator");
  if (chip) chip.className = "live-indicator-chip waiting";
  const statusText = elemento("capture-status-text");
  if (statusText) statusText.textContent = "En espera";

  const banner = elemento("general-analysis-banner");
  if (banner) banner.className = "general-status-banner waiting";
  const headline = elemento("general-analysis-headline");
  if (headline) headline.textContent = "Esperando datos de los módulos IMAGEN, VIDEO y AUDIO";
  const subtext = elemento("general-analysis-subtext");
  if (subtext) {
    subtext.textContent = "Cuando los módulos externos envíen fotogramas, alertas o segmentos compatibles, los resultados predictivos aparecerán automáticamente aquí.";
  }

  renderizarDetalleVisual(null);

  const fLabel = elemento("facial-student-label"); if (fLabel) fLabel.textContent = "(En espera)";
  const evLabel = elemento("events-student-label"); if (evLabel) evLabel.textContent = "(En espera)";
  const acLabel = elemento("academic-student-label"); if (acLabel) acLabel.textContent = "(En espera)";

  const facialTitle = elemento("facial-card-title");
  if (facialTitle) facialTitle.textContent = "🔮 Probabilidades e Incertidumbre (En espera)";
  const facialSub = elemento("facial-card-sublabel");
  if (facialSub) facialSub.textContent = "Esperando datos del módulo IMAGEN o VIDEO";
  const facialFooter = elemento("facial-card-footer");
  if (facialFooter) facialFooter.innerHTML = "<span>Umbral concluyente ≥ 55% y margen ≥ 10% · Abstención automática ante incertidumbre</span>";

  ["miedo", "sorpresa", "disgusto"].forEach(k => {
    const item = elemento(`emo-item-${k}`);
    if (item) item.style.display = "none";
  });
  ["neutral", "felicidad", "tristeza", "enojo", "miedo", "sorpresa", "disgusto"].forEach(k => {
    setBarraExpresion(`emo-pct-${k}`, `emo-bar-${k}`, null);
  });

  const domEmoText = elemento("dominant-emotion-text");
  if (domEmoText) domEmoText.textContent = "Sin datos — Esperando entrada automática";
  const actionBadge = elemento("student-action-badge");
  if (actionBadge) actionBadge.textContent = "Recepción automática · Identidad desconocida";

  const eventsTitle = elemento("events-card-title");
  if (eventsTitle) eventsTitle.textContent = "📋 Predicciones Generadas y Advertencias (En espera)";
  const causesList = elemento("causes-list");
  if (causesList) {
    causesList.innerHTML = '<div class="prediction-empty-notice"><span>⏳</span><span>Esperando datos de los módulos IMAGEN, VIDEO y AUDIO para mostrar resultados o hipótesis por modalidad.</span></div>';
  }
  const consequencesList = elemento("consequences-list");
  if (consequencesList) {
    consequencesList.innerHTML = '<div class="prediction-empty-notice"><span>ℹ️</span><span>Ante ausencia de rostro, audio silencioso o datos académicos incompletos, se emitirán advertencias aquí sin inventar resultados.</span></div>';
  }
  const eventsFooter = elemento("events-card-footer");
  if (eventsFooter) eventsFooter.innerHTML = "<span>Inferencia independiente por modalidad · Sin fusión automática ni sucesos artificiales</span>";

  const academicTitle = elemento("academic-card-title");
  if (academicTitle) academicTitle.textContent = "📈 Proyección Académica (En espera)";
  const riskBanner = elemento("risk-score-banner");
  if (riskBanner) riskBanner.className = "risk-score-banner bg-risk-unavailable";
  const riesgoScoreNum = elemento("riesgo-score-num");
  if (riesgoScoreNum) riesgoScoreNum.textContent = "—";
  const riesgoNivelText = elemento("riesgo-nivel-text");
  if (riesgoNivelText) riesgoNivelText.textContent = "Sin datos curriculares suficientes";
  const examRiskDesc = elemento("exam-risk-desc");
  if (examRiskDesc) {
    examRiskDesc.textContent = "La proyección académica se calculará automáticamente únicamente cuando existan datos curriculares suficientes. Las señales faciales o acústicas no sustituyen calificaciones.";
  }
  const narrativeText = elemento("assistant-narrative-text");
  if (narrativeText) {
    narrativeText.textContent = "Esperando datos de los módulos IMAGEN, VIDEO y AUDIO. No se muestran perfiles ficticios ni historial inventado.";
  }
  const academicFooter = elemento("academic-card-footer");
  if (academicFooter) academicFooter.innerHTML = "<span>Basado exclusivamente en evidencia verificada · Sin historial inventado</span>";
}

function renderizarAnalisisIndependiente(resultadoImagen = null, resultadoAcademico = null, resultadoAudio = null, resultadoVideo = null) {
  ultimoResultadoImagen = resultadoImagen && resultadoImagen.estado !== "sin_entrada" ? resultadoImagen : null;
  ultimoResultadoVideo = resultadoVideo && resultadoVideo.estado !== "sin_entrada" ? resultadoVideo : null;
  ultimoResultadoAudio = resultadoAudio && resultadoAudio.estado !== "sin_entrada" ? resultadoAudio : null;
  ultimoResultadoAcademico = resultadoAcademico && resultadoAcademico.estado !== "sin_entrada" ? resultadoAcademico : null;

  const img = ultimoResultadoImagen || ultimoResultadoVideo;
  const acad = ultimoResultadoAcademico;
  const aud = ultimoResultadoAudio;

  if (!ultimoResultadoImagen && !ultimoResultadoVideo && !aud && !acad) {
    renderizarEstadoEspera();
    return;
  }

  actualizarBadgeModulo("imagen", ultimoResultadoImagen);
  actualizarBadgeModulo("video", ultimoResultadoVideo);
  actualizarBadgeModulo("audio", aud);
  actualizarBadgeModulo("academico", acad);

  const hipImg = extraerHipotesis(img);
  const hipAud = extraerHipotesis(aud);
  const hipAcad = extraerHipotesis(acad);

  const modalidadesActivas = [
    ultimoResultadoImagen && "IMAGEN",
    ultimoResultadoVideo && "VIDEO",
    aud && "AUDIO",
    acad && "ACADÉMICO"
  ].filter(Boolean);
  const etiquetaModalidades = `(${modalidadesActivas.join(" + ")})`;

  const chip = elemento("capture-status-indicator");
  if (chip) chip.className = "live-indicator-chip";
  const statusText = elemento("capture-status-text");
  if (statusText) statusText.textContent = `Evaluado ${etiquetaModalidades}`;

  const banner = elemento("general-analysis-banner");
  if (banner) banner.className = "general-status-banner active";
  const headline = elemento("general-analysis-headline");
  if (headline) headline.textContent = `Evaluación independiente activa · Modalidades: ${modalidadesActivas.join(", ")}`;
  const subtext = elemento("general-analysis-subtext");
  if (subtext) {
    subtext.textContent = "Cada modalidad se procesa por separado conservando su procedencia y criterios de abstención. No se aplica fusión estadística ni atribución de identidad.";
  }

  renderizarDetalleVisual(img);

  const rostros = img ? (img.rostros_detectados ?? (img.deteccion_facial === "sin_rostro" ? 0 : 1)) : 0;
  const visualLabel = img
    ? (rostros === 1 ? "(Rostro 1 · Identidad desconocida)" : rostros > 1 ? `(${rostros} rostros)` : "(Sin rostro)")
    : "(Sin señal visual)";
  const fLabel = elemento("facial-student-label"); if (fLabel) fLabel.textContent = visualLabel;
  const evLabel = elemento("events-student-label"); if (evLabel) evLabel.textContent = etiquetaModalidades;
  const acLabel = elemento("academic-student-label");
  if (acLabel) {
    acLabel.textContent = acad?.estado === "estimacion_experimental" ? "(Evaluación curricular)"
      : acad?.estado === "abstencion" ? "(Incertidumbre limítrofe)"
        : acad?.estado === "evidencia_insuficiente" ? "(Datos incompletos)"
          : "(Sin datos suficientes)";
  }

  // Tarjeta de Probabilidades e Incertidumbre (Visual)
  const facialTitle = elemento("facial-card-title");
  if (facialTitle) {
    facialTitle.textContent = img
      ? `🔮 Probabilidades e Incertidumbre: 4 Expresiones ${visualLabel}`
      : `🔮 Probabilidades e Incertidumbre ${visualLabel}`;
  }
  const facialSub = elemento("facial-card-sublabel");
  if (facialSub) {
    facialSub.textContent = img
      ? `Modelo ${describirModeloExperimental(img.modelo)} (${img.origen_entrenamiento === "sintetico" ? "referencia sintética" : "datos reales"})`
      : "Sin señal visual recibida — Las demás modalidades operan de forma independiente";
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
        ? "Sin señal visual — Solo se evaluó la modalidad acústica"
        : "Sin señal visual — Solo se evaluó la modalidad académica";
    } else if (img.estado === "abstencion") {
      const motivos = traducirMotivosAbstencion(img.criterio_abstencion);
      domEmoText.textContent = hipImg
        ? `Hipótesis no concluyente: ${hipImg.label} (${hipImg.pctTexto}) · Abstención preventiva (${motivos})`
        : `Abstención preventiva (${motivos})`;
    } else if (img.estado === "estimacion_experimental") {
      const exp = formatearCategoria(img.expresion, true);
      domEmoText.textContent = `Expresión observable: ${exp}${hipImg ? ` (${hipImg.pctTexto})` : ""} · Clasificación concluyente`;
    } else if (img.estado === "evidencia_insuficiente") {
      domEmoText.textContent = ESTADOS_DETECCION_FACIAL[img.deteccion_facial] || "Evidencia visual insuficiente";
    } else {
      domEmoText.textContent = img.motivo || ESTADOS_FACIALES[img.estado] || "Sin evaluación";
    }
  }

  const actionBadge = elemento("student-action-badge");
  if (actionBadge) {
    actionBadge.textContent = img
      ? "Evaluación visual independiente · Identidad desconocida"
      : "Modalidad independiente activa · Sin atribución biométrica";
  }

  // Tarjeta Inferior Izquierda: Predicciones Generadas y Advertencias
  const eventsTitle = elemento("events-card-title");
  if (eventsTitle) eventsTitle.textContent = `📋 Resultados por Modalidad y Advertencias ${etiquetaModalidades}`;

  const itemsResultados = [];
  const itemsAdvertencias = [];

  if (img) {
    const origenVisual = ultimoResultadoImagen ? "IMAGEN" : "VIDEO";
    if (img.estado === "estimacion_experimental" && hipImg) {
      itemsResultados.push(`
        <div class="prob-item conclusive-item">
          <div class="prob-item-text-row">
            <span class="prob-item-title">📸 ${origenVisual} · Clasificación facial concluyente: <strong>${escaparHtml(hipImg.label)}</strong></span>
            <span class="prob-item-pct">${escaparHtml(hipImg.pctTexto)}</span>
          </div>
          <div class="prob-progress-track"><div class="prob-progress-fill" style="width: ${hipImg.pctNum.toFixed(1)}%;"></div></div>
          <div class="prob-item-subnote">Rostros detectados: ${rostros} · Identidad desconocida · Supera umbral ≥ 55% y margen ≥ 10%.</div>
        </div>
      `);
    } else if (img.estado === "abstencion") {
      const motivos = traducirMotivosAbstencion(img.criterio_abstencion);
      itemsResultados.push(`
        <div class="prob-item hypothesis-item">
          <div class="prob-item-text-row">
            <span class="prob-item-title">📸 ${origenVisual} · Hipótesis no concluyente: <strong>${escaparHtml(hipImg ? hipImg.label : "Sin hipótesis")}</strong> (abstención)</span>
            <span class="prob-item-pct">${escaparHtml(hipImg ? hipImg.pctTexto : "—")}</span>
          </div>
          <div class="prob-progress-track"><div class="prob-progress-fill" style="width: ${hipImg ? hipImg.pctNum.toFixed(1) : 0}%;"></div></div>
          <div class="prob-item-subnote">Motivo: ${escaparHtml(motivos)}. No se confirma categoría · Rostros: ${rostros}.</div>
        </div>
      `);
      itemsAdvertencias.push(`<div class="prob-item warning-item"><div class="prob-item-text-row"><span class="prob-item-title">⚠️ Incertidumbre visual (${origenVisual})</span><span class="prob-item-pct">Abstención</span></div><div class="prob-item-subnote">Incertidumbre elevada (${escaparHtml(motivos)}): se informa hipótesis sin confirmar etiqueta categórica.</div></div>`);
    } else {
      const detalle = ESTADOS_DETECCION_FACIAL[img.deteccion_facial] || ESTADOS_FACIALES[img.estado] || img.motivo || "No evaluable";
      itemsResultados.push(`
        <div class="prob-item error-item">
          <div class="prob-item-text-row">
            <span class="prob-item-title">📸 ${origenVisual} · ${escaparHtml(img.estado.replaceAll("_", " "))} (rostros: ${rostros})</span>
            <span class="prob-item-pct">Sin clasificar</span>
          </div>
          <div class="prob-item-subnote">${escaparHtml(detalle)}</div>
        </div>
      `);
      itemsAdvertencias.push(`<div class="prob-item warning-item"><div class="prob-item-text-row"><span class="prob-item-title">⚠️ Evidencia visual insuficiente (${origenVisual})</span><span class="prob-item-pct">Omitida</span></div><div class="prob-item-subnote">${escaparHtml(detalle)}</div></div>`);
    }
  }

  if (aud) {
    if (aud.estado === "estimacion_experimental" && hipAud) {
      const top3 = hipAud.puntajesOrdenados.slice(0, 3).map(([k, v]) => `${formatearCategoria(k)} ${(v * 100).toFixed(1)}%`).join(" · ");
      itemsResultados.push(`
        <div class="prob-item conclusive-item">
          <div class="prob-item-text-row">
            <span class="prob-item-title">🎙️ AUDIO · Clasificación vocal concluyente: <strong>${escaparHtml(hipAud.label)}</strong></span>
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
            <span class="prob-item-title">🎙️ AUDIO · Hipótesis vocal no concluyente: <strong>${escaparHtml(hipAud ? hipAud.label : "Sin hipótesis")}</strong> (abstención)</span>
            <span class="prob-item-pct">${escaparHtml(hipAud ? hipAud.pctTexto : "—")}</span>
          </div>
          <div class="prob-progress-track"><div class="prob-progress-fill" style="width: ${hipAud ? hipAud.pctNum.toFixed(1) : 0}%;"></div></div>
          <div class="prob-item-subnote">Motivo: ${escaparHtml(motivos)}. Top 3 RAVDESS (8 clases, no facial): ${escaparHtml(top3 || "sin puntajes")}.</div>
        </div>
      `);
      itemsAdvertencias.push(`<div class="prob-item warning-item"><div class="prob-item-text-row"><span class="prob-item-title">⚠️ Incertidumbre acústica (AUDIO)</span><span class="prob-item-pct">Abstención</span></div><div class="prob-item-subnote">Señal vocal ambigua (${escaparHtml(motivos)}); resultado mantenido como hipótesis no concluyente.</div></div>`);
    } else if (aud.estado === "caracteristicas_declaradas") {
      itemsResultados.push(`
        <div class="prob-item warning-item">
          <div class="prob-item-text-row">
            <span class="prob-item-title">🎙️ AUDIO · Descriptores acústicos recibidos (${escaparHtml(aud.duracion_segundos ?? "—")}s)</span>
            <span class="prob-item-pct">Pendiente WAV</span>
          </div>
          <div class="prob-item-subnote">Sin segmento PCM16 para inferencia acústica completa.</div>
        </div>
      `);
      itemsAdvertencias.push(`<div class="prob-item warning-item"><div class="prob-item-text-row"><span class="prob-item-title">⚠️ AUDIO sin fragmento WAV</span><span class="prob-item-pct">Pendiente</span></div><div class="prob-item-subnote">Solo se recibieron descriptores escalares sin audio PCM16 compatible con RAVDESS.</div></div>`);
    } else {
      const msgAud = aud.motivo || "Señal acústica inválida o silenciosa.";
      itemsResultados.push(`
        <div class="prob-item error-item">
          <div class="prob-item-text-row">
            <span class="prob-item-title">🎙️ AUDIO · ${escaparHtml(aud.estado.replaceAll("_", " "))}</span>
            <span class="prob-item-pct">No evaluable</span>
          </div>
          <div class="prob-item-subnote">${escaparHtml(msgAud)}</div>
        </div>
      `);
      itemsAdvertencias.push(`<div class="prob-item error-item"><div class="prob-item-text-row"><span class="prob-item-title">⚠️ Evidencia acústica rechazada (AUDIO)</span><span class="prob-item-pct">Aislada</span></div><div class="prob-item-subnote">${escaparHtml(msgAud)}</div></div>`);
    }
  }

  if (acad) {
    if (acad.estado === "estimacion_experimental") {
      const pctRiesgo = Math.round((acad.probabilidad_no_aprueba ?? 0) * 100);
      const desenlaceTxt = acad.desenlace_estimado === "no_aprueba" ? "Riesgo de desaprobación (no aprueba)" : "Aprobación proyectada (aprueba)";
      itemsResultados.push(`
        <div class="prob-item conclusive-item">
          <div class="prob-item-text-row">
            <span class="prob-item-title">📚 ACADÉMICO · ${escaparHtml(desenlaceTxt)} (${escaparHtml(acad.desenlace || "G3 < 10/20")})</span>
            <span class="prob-item-pct">${pctRiesgo}% riesgo</span>
          </div>
          <div class="prob-progress-track"><div class="prob-progress-fill" style="width: ${pctRiesgo}%;"></div></div>
          <div class="prob-item-subnote">Basado en calificaciones curriculares G1 y G2 (escala 0–20). ${escaparHtml(acad.limitacion || "")}</div>
        </div>
      `);
    } else if (acad.estado === "abstencion") {
      const pctRiesgo = acad.probabilidad_no_aprueba != null ? Math.round(acad.probabilidad_no_aprueba * 100) : 0;
      const motivos = traducirMotivosAbstencion(acad.criterio_abstencion);
      itemsResultados.push(`
        <div class="prob-item hypothesis-item">
          <div class="prob-item-text-row">
            <span class="prob-item-title">📚 ACADÉMICO · Hipótesis limítrofe: <strong>${escaparHtml(hipAcad ? hipAcad.label : "Sin confirmar")}</strong> (abstención)</span>
            <span class="prob-item-pct">${pctRiesgo}% riesgo</span>
          </div>
          <div class="prob-progress-track"><div class="prob-progress-fill" style="width: ${pctRiesgo}%;"></div></div>
          <div class="prob-item-subnote">Motivo: ${escaparHtml(motivos)}. No supera umbral ni margen para afirmación concluyente.</div>
        </div>
      `);
    } else if (acad.estado === "evidencia_insuficiente") {
      const faltantes = (acad.campos_faltantes || []).join(", ") || "G1, G2";
      itemsResultados.push(`
        <div class="prob-item warning-item">
          <div class="prob-item-text-row">
            <span class="prob-item-title">📚 ACADÉMICO · Datos curriculares incompletos</span>
            <span class="prob-item-pct">Incompleto</span>
          </div>
          <div class="prob-item-subnote">Campos faltantes: <strong>${escaparHtml(faltantes)}</strong>. El sistema nunca inventa notas ausentes.</div>
        </div>
      `);
      itemsAdvertencias.push(`<div class="prob-item warning-item"><div class="prob-item-text-row"><span class="prob-item-title">⚠️ Datos académicos incompletos</span><span class="prob-item-pct">Sin imputar</span></div><div class="prob-item-subnote">Faltan campos requeridos (${escaparHtml(faltantes)}). No se genera proyección académica artificial.</div></div>`);
    }
  }

  itemsAdvertencias.push('<div class="prediction-empty-notice"><span>🛡️</span><span><strong>Sin sucesos artificiales:</strong> No se fabrican causas previas, distracción ni aprobación escolar a partir de señales visuales o acústicas aisladas.</span></div>');

  const causesList = elemento("causes-list");
  if (causesList) causesList.innerHTML = itemsResultados.join("");
  const consequencesList = elemento("consequences-list");
  if (consequencesList) consequencesList.innerHTML = itemsAdvertencias.join("");
  const eventsFooter = elemento("events-card-footer");
  if (eventsFooter) eventsFooter.innerHTML = "<span>Evaluación independiente recibida · Sin fusión automática entre fuentes</span>";

  // Tarjeta Inferior Derecha: Proyección Académica
  const academicTitle = elemento("academic-card-title");
  if (academicTitle) {
    academicTitle.textContent = acad?.estado === "estimacion_experimental"
      ? "📈 Proyección Académica (Evaluación curricular)"
      : acad?.estado === "abstencion"
        ? "📈 Proyección Académica (Incertidumbre limítrofe)"
        : "📈 Proyección Académica (Sin datos suficientes)";
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
      examRiskDesc.textContent = "No se han recibido calificaciones curriculares compatibles. Las señales de IMAGEN, VIDEO o AUDIO nunca sustituyen notas académicas.";
    }
    if (academicFooter) academicFooter.innerHTML = "<span>Basado exclusivamente en evidencia verificada · Sin historial inventado</span>";
  }

  const narrativeText = elemento("assistant-narrative-text");
  if (narrativeText) {
    const lineas = [`<strong>Resumen de recepción automática ${escaparHtml(etiquetaModalidades)}:</strong>`];
    if (img) {
      const estadoVis = img.estado === "abstencion" && hipImg
        ? `Abstención visual · Hipótesis no concluyente: <strong>${escaparHtml(hipImg.label)}</strong> (${hipImg.pctTexto})`
        : img.estado === "estimacion_experimental" && hipImg
          ? `Expresión observable concluyente: <strong>${escaparHtml(hipImg.label)}</strong> (${hipImg.pctTexto})`
          : escaparHtml(ESTADOS_DETECCION_FACIAL[img.deteccion_facial] || ESTADOS_FACIALES[img.estado] || img.estado);
      lineas.push(`• <strong>Visual:</strong> ${rostros} rostro(s) · ${estadoVis}.`);
    }
    if (aud) {
      const estadoAud = aud.estado === "estimacion_experimental" && hipAud
        ? `Vocal concluyente: <strong>${escaparHtml(hipAud.label)}</strong> (${hipAud.pctTexto})`
        : aud.estado === "abstencion" && hipAud
          ? `Abstención acústica · Hipótesis: <strong>${escaparHtml(hipAud.label)}</strong> (${hipAud.pctTexto})`
          : escaparHtml(aud.motivo || aud.estado.replaceAll("_", " "));
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
    renderizarEstadoEspera();
    return;
  }
  const analisis = salida.analisis || salida;
  const fuentes = analisis.fuentes || {};
  renderizarAnalisisIndependiente(
    fuentes.imagen ?? null,
    analisis.academico ?? salida.academico ?? null,
    fuentes.audio ?? null,
    fuentes.video ?? null
  );
}

async function verificarSaludBackend() {
  const healthEl = elemento("backend-health-text");
  const sidebarConn = elemento("sidebar-connectivity-label");
  if (!healthEl) return;
  try {
    const base = typeof location !== "undefined" && location.origin && location.protocol !== "file:"
      ? location.origin
      : "http://127.0.0.1:8001";
    const resp = await fetch(`${base}/api/salud`, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    healthEl.textContent = "Servicio local de inferencia disponible (recepción automática lista)";
    if (sidebarConn) sidebarConn.textContent = "Servicio de Inferencia Listo";
  } catch {
    healthEl.textContent = "Servicio de inferencia no disponible en este momento";
    if (sidebarConn) sidebarConn.textContent = "Sin conexión al servicio";
  }
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

const btnToggleDetalles = elemento("btn-toggle-students-panel");
if (btnToggleDetalles) {
  btnToggleDetalles.addEventListener("click", () => {
    panelEstudiantesExpandido = !panelEstudiantesExpandido;
    renderizarDetalleVisual(ultimoResultadoImagen || ultimoResultadoVideo);
  });
}

renderizarEstadoEspera();

if (typeof window !== "undefined") {
  iniciarRelojEnVivo();
  void verificarSaludBackend();
  if (typeof window.addEventListener === "function") {
    window.addEventListener("aulapredict:resultados", (ev) => aplicarPayloadExterno(ev?.detail));
  }
}

globalThis.AulaPredict = {
  aplicarResultados: aplicarPayloadExterno,
  reiniciarResultados: renderizarEstadoEspera,
  extraerHipotesis,
  renderizarAnalisisIndependiente,
  verificarSaludBackend
};
