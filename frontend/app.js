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
let estudianteSeleccionadoId = 1;
let webcamStream = null;
let animCanvasId = null;
let modoCapturaCongelada = false;

// Datos iniciales de demostración hasta realizar la primera captura
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

estudiantesEnCaptura = JSON.parse(JSON.stringify(DEMO_INICIAL_ESTUDIANTES));

// ============================================================================
// RENDERIZADO DE PANELES DE PREDICCIÓN
// ============================================================================

function renderizarPanelesInferiores(estudiante) {
  const labels = typeof document !== "undefined" && document.querySelectorAll ? document.querySelectorAll(".selected-student-label") : [];
  labels.forEach(el => {
    el.textContent = estudiante ? `(${estudiante.nombre})` : "(Sin selección)";
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

  if (!estudiante) {
    // Reseteo limpio cuando no hay estudiantes en la captura
    if (emoNeutral && barNeutral) { emoNeutral.textContent = "0%"; barNeutral.style.width = "0%"; }
    if (emoFelicidad && barFelicidad) { emoFelicidad.textContent = "0%"; barFelicidad.style.width = "0%"; }
    if (emoTristeza && barTristeza) { emoTristeza.textContent = "0%"; barTristeza.style.width = "0%"; }
    if (emoMiedo && barMiedo) { emoMiedo.textContent = "0%"; barMiedo.style.width = "0%"; }
    if (emoEnojo && barEnojo) { emoEnojo.textContent = "0%"; barEnojo.style.width = "0%"; }
    if (emoSorpresa && barSorpresa) { emoSorpresa.textContent = "0%"; barSorpresa.style.width = "0%"; }
    if (emoDisgusto && barDisgusto) { emoDisgusto.textContent = "0%"; barDisgusto.style.width = "0%"; }
    if (domEmoText) domEmoText.textContent = "Esperando detección en captura";
    if (actionBadge) actionBadge.textContent = "Sin alumnos detectados";

    const causesList = elemento("causes-list");
    if (causesList) {
      causesList.innerHTML = `<div class="prediction-empty-notice">⚠️ Esperando detección de estudiantes para inferir acontecimientos previos.</div>`;
    }
    const consequencesList = elemento("consequences-list");
    if (consequencesList) {
      consequencesList.innerHTML = `<div class="prediction-empty-notice">⚠️ Esperando detección de estudiantes para estimar consecuencias futuras.</div>`;
    }
    const riskBanner = elemento("risk-score-banner");
    const riesgoScoreNum = elemento("riesgo-score-num");
    const riesgoNivelText = elemento("riesgo-nivel-text");
    const examRiskDesc = elemento("exam-risk-desc");
    const narrativeText = elemento("assistant-narrative-text");

    if (riskBanner) riskBanner.className = "risk-score-banner bg-risk-optimal";
    if (riesgoScoreNum) riesgoScoreNum.textContent = "0";
    if (riesgoNivelText) riesgoNivelText.textContent = "Sin Alumnos Evaluados";
    if (examRiskDesc) examRiskDesc.textContent = "Encuadra la cámara o sube una imagen de aula con alumnos para calcular el riesgo.";
    if (narrativeText) {
      narrativeText.innerHTML = "No se detectaron estudiantes en la captura actual. Asegúrate de encuadrar al grupo o sube una foto con alumnos para generar la predicción asistida.";
    }
    return;
  }

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
    domEmoText.textContent = emos.dominante || "Neutral / Concentración (😐)";
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

function renderizarCuadriculaEstudiantes() {
  const container = elemento("students-grid");
  if (!container) return;

  const countBadge = elemento("students-count-badge");
  if (countBadge) {
    countBadge.textContent = `${estudiantesEnCaptura.length} Alumno${estudiantesEnCaptura.length === 1 ? "" : "s"} Detectado${estudiantesEnCaptura.length === 1 ? "" : "s"}`;
  }

  if (estudiantesEnCaptura.length === 0) {
    container.innerHTML = `
      <div class="students-empty-state">
        <div class="empty-state-icon">🚫</div>
        <div class="empty-state-title">No se detectaron estudiantes en la captura</div>
        <div class="empty-state-desc">Asegúrate de que haya al menos un alumno visible en el encuadre o toma una nueva captura para generar predicciones.</div>
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
            <span class="student-card-title"><strong>${est.nombre}</strong> (ID: ${est.subId})</span>
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

    // Dibujar recuadro de cada alumno detectado
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
    if (estudiantesEnCaptura.length === 0 && modoCapturaCongelada) {
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

async function iniciarCamara() {
  const video = elemento("webcam-feed");
  const fallback = elemento("camera-placeholder");

  try {
    if (typeof navigator !== "undefined" && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false
      });
      webcamStream = stream;
      if (video) {
        video.srcObject = stream;
        video.classList.add("active");
        video.play().catch(() => {});
      }
      if (fallback) fallback.classList.add("hidden");
    }
  } catch (err) {
    console.warn("No se pudo iniciar cámara web:", err);
  }
}

// Obtiene la imagen en base64 de la cámara o de la simulación
function capturarFrameBase64() {
  const video = elemento("webcam-feed");
  const canvasTemp = document.createElement("canvas");
  const w = (video && video.videoWidth) ? video.videoWidth : 1280;
  const h = (video && video.videoHeight) ? video.videoHeight : 720;
  canvasTemp.width = w;
  canvasTemp.height = h;
  const ctx = canvasTemp.getContext("2d");

  if (video && video.videoWidth > 0 && !video.paused) {
    ctx.drawImage(video, 0, 0, w, h);
  } else {
    // Generar gradiente de aula si no hay webcam activa
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#1E293B");
    grad.addColorStop(1, "#0F172A");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 24px Inter, sans-serif";
    ctx.fillText("AulaPredict · Captura de Aula Universitaria", 40, 60);
  }
  return canvasTemp.toDataURL("image/jpeg", 0.88);
}

// Acción principal: "📸 Capturar Imagen y Predecir"
async function ejecutarCapturaYPrediccion() {
  const btnCapture = elemento("btn-capture-predict");
  const statusIndicator = elemento("capture-status-indicator");
  const statusText = elemento("capture-status-text");
  const video = elemento("webcam-feed");
  const imgDisplay = elemento("captured-image-display");
  const locationLabel = elemento("cam-location-label");

  if (btnCapture) {
    btnCapture.disabled = true;
    btnCapture.innerHTML = `<span>⏳</span><span>Analizando con Motor de Predicción...</span>`;
  }
  if (statusText) statusText.textContent = "Analizando Captura...";

  const imagenB64 = capturarFrameBase64();

  // Congelar la imagen capturada en pantalla
  if (imgDisplay) {
    imgDisplay.src = imagenB64;
    imgDisplay.style.display = "block";
    if (video) video.style.display = "none";
  }
  modoCapturaCongelada = true;

  // Simular contexto recibido de Imagen/Video si fue seleccionado
  const selContexto = elemento("select-contexto-simulado");
  let contextoExterno = null;
  if (selContexto) {
    if (selContexto.value === "celular") {
      contextoExterno = { acciones_detectadas: ["uso_celular"], objetos: ["telefono"] };
    } else if (selContexto.value === "audifonos") {
      contextoExterno = { acciones_detectadas: ["uso_audifonos"], objetos: ["audifonos"] };
    } else if (selContexto.value === "cansancio") {
      contextoExterno = { acciones_detectadas: ["postura_cansancio", "durmiendo"], objetos: [] };
    }
  }

  try {
    const payload = { imagen_b64: imagenB64 };
    if (contextoExterno) {
      payload.contexto_externo = contextoExterno;
    }

    const res = await fetch(`${servidor()}/api/prediccion/analizar-captura`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`Error en servidor: HTTP ${res.status}`);
    }

    const data = await res.json();
    if (data.total_alumnos > 0 && data.estudiantes && data.estudiantes.length > 0) {
      estudiantesEnCaptura = data.estudiantes;
      seleccionarEstudiante(estudiantesEnCaptura[0].id);
      if (statusText) statusText.textContent = `Captura Analizada (${estudiantesEnCaptura.length} Alumnos)`;
    } else {
      // ESTADO LIMPIO: Cero personas detectadas
      estudiantesEnCaptura = [];
      estudianteSeleccionadoId = null;
      renderizarCuadriculaEstudiantes();
      renderizarPanelesInferiores(null);
      if (statusText) statusText.textContent = "0 Alumnos Detectados";
    }

    if (locationLabel) locationLabel.textContent = `Aula 301 · ${data.resolucion_captura || "HD"}`;
  } catch (err) {
    console.warn("Fallo en backend, usando predicción local calibrada:", err);
    if (statusText) statusText.textContent = "Error al procesar captura";
  } finally {
    if (btnCapture) {
      btnCapture.disabled = false;
      btnCapture.innerHTML = `<span class="capture-icon">📸</span><span class="capture-text">Capturar Imagen y Predecir</span>`;
    }
  }
}

// Acción: "🔄 Nueva Captura"
function volverANuevaCaptura() {
  const video = elemento("webcam-feed");
  const imgDisplay = elemento("captured-image-display");
  const statusText = elemento("capture-status-text");

  if (imgDisplay) imgDisplay.style.display = "none";
  if (video) video.style.display = "block";
  modoCapturaCongelada = false;

  if (statusText) statusText.textContent = "Cámara Lista";
}

// Acción: "🖼️ Probar con Captura Grupal"
async function cargarEscenarioAulaEjemplo() {
  const statusText = elemento("capture-status-text");
  const locationLabel = elemento("cam-location-label");
  if (statusText) statusText.textContent = "Cargando Captura Grupal...";

  try {
    const res = await fetch(`${servidor()}/api/prediccion/ejemplo-aula`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (data.estudiantes && data.estudiantes.length > 0) {
      estudiantesEnCaptura = data.estudiantes;
      seleccionarEstudiante(3); // Seleccionar alumno con celular para ver la alerta
    }
    if (statusText) statusText.textContent = "Captura Grupal (5 Alumnos)";
    if (locationLabel) locationLabel.textContent = "Aula 301 · 5 Alumnos en Captura";
  } catch (err) {
    console.warn("Error cargando ejemplo grupal:", err);
  }
}

// Acción: "📁 Subir Foto de Aula"
function configurarSubidaFoto() {
  const fileInput = elemento("input-upload-image");
  if (!fileInput) return;

  fileInput.addEventListener("change", async (e) => {
    const file = e.target && e.target.files ? e.target.files[0] : null;
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const b64 = evt.target.result;
      const imgDisplay = elemento("captured-image-display");
      const video = elemento("webcam-feed");
      const statusText = elemento("capture-status-text");

      if (imgDisplay) {
        imgDisplay.src = b64;
        imgDisplay.style.display = "block";
        if (video) video.style.display = "none";
      }

      if (statusText) statusText.textContent = "Analizando Foto Subida...";
      modoCapturaCongelada = true;

      // Leer contexto simulado si está activo
      const selContexto = elemento("select-contexto-simulado");
      let contextoExterno = null;
      if (selContexto) {
        if (selContexto.value === "celular") {
          contextoExterno = { acciones_detectadas: ["uso_celular"], objetos: ["telefono"] };
        } else if (selContexto.value === "audifonos") {
          contextoExterno = { acciones_detectadas: ["uso_audifonos"], objetos: ["audifonos"] };
        } else if (selContexto.value === "cansancio") {
          contextoExterno = { acciones_detectadas: ["postura_cansancio", "durmiendo"], objetos: [] };
        }
      }

      try {
        const payload = { imagen_b64: b64 };
        if (contextoExterno) payload.contexto_externo = contextoExterno;

        const res = await fetch(`${servidor()}/api/prediccion/analizar-captura`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const data = await res.json();
          if (data.total_alumnos > 0 && data.estudiantes && data.estudiantes.length > 0) {
            estudiantesEnCaptura = data.estudiantes;
            seleccionarEstudiante(estudiantesEnCaptura[0].id);
            if (statusText) statusText.textContent = `Foto Analizada (${estudiantesEnCaptura.length} Alumnos)`;
          } else {
            estudiantesEnCaptura = [];
            estudianteSeleccionadoId = null;
            renderizarCuadriculaEstudiantes();
            renderizarPanelesInferiores(null);
            if (statusText) statusText.textContent = "0 Alumnos Detectados";
          }
        }
      } catch (err) {
        console.warn("Error procesando foto subida:", err);
      }
    };
    reader.readAsDataURL(file);
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
  if (btnNewCapture) btnNewCapture.addEventListener("click", volverANuevaCaptura);
  if (btnGroupClassroom) btnGroupClassroom.addEventListener("click", cargarEscenarioAulaEjemplo);

  configurarSubidaFoto();
}

if (typeof window !== "undefined") {
  renderizarCuadriculaEstudiantes();
  renderizarPanelesInferiores(estudiantesEnCaptura[0]);
  iniciarRelojEnVivo();
  iniciarRenderizadoCanvas();
  configurarEventosCaptura();
  iniciarCamara();
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

  for (const r of (salida.resultados || [])) {
    const articulo = document.createElement("article");
    articulo.className = "resultado-estudiante";
    const titulo = document.createElement("h3");
    titulo.textContent = `${r.nombre || r.estudiante_id} · ${r.sesion_id}`;
    const nivel = document.createElement("p");
    nivel.textContent = `${r.actividad} · ${(r.nivel_revision || "").replaceAll("_", " ")} · prioridad ${r.indice_prioridad ?? "sin datos"}`;
    articulo.append(titulo, nivel);

    if (r.reglas_activadas) {
      lista(articulo, "Reglas activadas", r.reglas_activadas.map(x => `${x.regla} (+${x.puntos}): ${x.explicacion} Referencias: ${(x.referencias || []).join(", ")}`));
      if (!r.reglas_activadas.length) lista(articulo, "Reglas", ["No se activaron reglas de alerta."]);
    }

    if (r.evidencia_por_modulo) {
      for (const [modulo, evidencias] of Object.entries(r.evidencia_por_modulo)) {
        lista(articulo, `Evidencia · ${modulo}`, evidencias.map(e => {
          const tiempo = e.fecha_hora || e.fecha || "";
          const dato = e.valor ?? e.estado ?? "";
          return `${e.id || e.tipo} · ${dato}${e.presente === false ? " (ausencia explícita)" : ""} · ${tiempo} · origen: ${e.origen}${e.confianza != null ? ` · confianza: ${e.confianza} · calidad: ${e.calidad}` : ""}`;
        }));
      }
    }

    if (r.datos_faltantes) lista(articulo, "Datos faltantes", r.datos_faltantes);
    if (r.contradicciones) lista(articulo, "Contradicciones por resolver", r.contradicciones);
    if (r.limitaciones) lista(articulo, "Límites de esta evaluación", r.limitaciones);
    if (r.recomendaciones) lista(articulo, "Recomendaciones", r.recomendaciones);
    if (r.avisar_a) lista(articulo, "Destinatarios sugeridos", r.avisar_a.length ? r.avisar_a : ["Sin aviso automático; siempre revisión humana."]);
    contenedor.append(articulo);
  }

  if (salida.observaciones_sin_atribuir) {
    lista(contenedor, "Observaciones sin atribuir", salida.observaciones_sin_atribuir.map(o => `${o.modulo} · ${o.id}: ${o.motivo}`));
  }
  if (salida.observaciones_descartadas) {
    lista(contenedor, "Observaciones descartadas", salida.observaciones_descartadas.map(o => `${o.modulo} · ${o.id}: ${o.motivo}`));
  }
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

if (elemento("motor")) {
  elemento("motor").addEventListener("change", async () => {
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
  });
}

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

      if (!respuesta.ok) throw new Error(typeof salida.detail === "string" ? salida.detail : JSON.stringify(salida.detail || salida));

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
