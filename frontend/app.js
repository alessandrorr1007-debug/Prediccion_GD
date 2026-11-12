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
    // Reseteo limpio cuando no hay estudiantes en la captura o antes de capturar
    if (emoNeutral && barNeutral) { emoNeutral.textContent = "0%"; barNeutral.style.width = "0%"; }
    if (emoFelicidad && barFelicidad) { emoFelicidad.textContent = "0%"; barFelicidad.style.width = "0%"; }
    if (emoTristeza && barTristeza) { emoTristeza.textContent = "0%"; barTristeza.style.width = "0%"; }
    if (emoMiedo && barMiedo) { emoMiedo.textContent = "0%"; barMiedo.style.width = "0%"; }
    if (emoEnojo && barEnojo) { emoEnojo.textContent = "0%"; barEnojo.style.width = "0%"; }
    if (emoSorpresa && barSorpresa) { emoSorpresa.textContent = "0%"; barSorpresa.style.width = "0%"; }
    if (emoDisgusto && barDisgusto) { emoDisgusto.textContent = "0%"; barDisgusto.style.width = "0%"; }
    if (domEmoText) domEmoText.textContent = "Sin evaluar — Esperando captura";
    if (actionBadge) actionBadge.textContent = "Esperando detección en captura";

    const causesList = elemento("causes-list");
    if (causesList) {
      causesList.innerHTML = `<div class="prediction-empty-notice"><span>⏳</span><span>Esperando captura de aula para proyectar acontecimientos previos...</span></div>`;
    }
    const consequencesList = elemento("consequences-list");
    if (consequencesList) {
      consequencesList.innerHTML = `<div class="prediction-empty-notice"><span>⏳</span><span>Esperando captura de aula para proyectar consecuencias futuras...</span></div>`;
    }
    const riskBanner = elemento("risk-score-banner");
    const riesgoScoreNum = elemento("riesgo-score-num");
    const riesgoNivelText = elemento("riesgo-nivel-text");
    const examRiskDesc = elemento("exam-risk-desc");
    const narrativeText = elemento("assistant-narrative-text");

    if (riskBanner) riskBanner.className = "risk-score-banner bg-risk-optimal";
    if (riesgoScoreNum) riesgoScoreNum.textContent = "—";
    if (riesgoNivelText) riesgoNivelText.textContent = "Sin evaluar — Esperando captura";
    if (examRiskDesc) examRiskDesc.textContent = "Presiona 'Capturar Imagen y Predecir' (o recibe una captura) para calcular el riesgo académico del estudiante.";
    if (narrativeText) {
      narrativeText.innerHTML = "Esperando captura para evaluar las emociones y el desempeño de los estudiantes en el aula.";
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
    if (!modoCapturaCongelada && estudiantesEnCaptura.length === 0) {
      countBadge.textContent = "Esperando captura";
    } else {
      countBadge.textContent = `${estudiantesEnCaptura.length} Alumno${estudiantesEnCaptura.length === 1 ? "" : "s"} Detectado${estudiantesEnCaptura.length === 1 ? "" : "s"}`;
    }
  }

  if (estudiantesEnCaptura.length === 0) {
    if (estadoCuadricula === "sin_modelos") {
      container.textContent = "Modelos de predicción no disponibles para esta imagen.";
    } else if (estadoCuadricula !== "sin_personas") {
      // Estado Inicial / En espera de captura (Preview de cámara limpia)
      container.innerHTML = `
        <div class="students-empty-state waiting-state">
          <div class="empty-state-icon">📸</div>
          <div class="empty-state-title">Esperando captura de imagen</div>
          <div class="empty-state-desc">Presiona 'Capturar Imagen y Predecir' (o recibe una captura del módulo de Imagen) para detectar a los alumnos presentes y ejecutar el modelo de predicción.</div>
        </div>
      `;
    } else {
      // Post-captura: Ninguna persona detectada en la foto tomada
      container.innerHTML = `
        <div class="students-empty-state">
          <div class="empty-state-icon">🚫</div>
          <div class="empty-state-title">No se detectaron estudiantes en la captura</div>
          <div class="empty-state-desc">Asegúrate de que haya al menos un alumno visible en el encuadre o toma una nueva captura para generar predicciones.</div>
        </div>
      `;
    }
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
  estimacion_experimental: "Estimación de expresión disponible",
  abstencion: "Abstención del modelo facial",
  evidencia_insuficiente: "Evidencia facial insuficiente",
  imagen_invalida: "El servidor no pudo decodificar la foto",
  modelo_no_disponible: "Modelo facial no disponible",
  error_inferencia: "Error técnico durante el análisis facial"
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
      estudiantesEnCaptura = [];
      estadoCuadricula = "espera";
      seleccionarEstudiante(null);
      elemento("cam-location-label").textContent = "Captura facial";
      lista(resultadoFacial, "Expresión facial experimental · identidad desconocida", lineasDemoModelo("Imagen", datos));
      estadoCaptura(ESTADOS_FACIALES[datos.estado]);
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
    estadoCuadricula = "espera";
    seleccionarEstudiante(null);
    estadoCaptura(agotado ? "El servidor tardó demasiado en responder. Puedes reintentar." : error.message);
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

  if (statusText) statusText.textContent = sesionCamara?.lista ? "Cámara lista" : "Cámara detenida";
  if (!sesionCamara) estadoAutomatico("La captura automática requiere una cámara activa.");
  renderizarCuadriculaEstudiantes();
  renderizarPanelesInferiores(null);
}

// Acción: "🖼️ Probar con Captura Grupal"
function cargarEscenarioAulaEjemplo() {
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

  configurarSubidaFoto();
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
  boton.disabled = true;
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
      if (!modulo) li.textContent = `${nombre} · estado no disponible`;
      else if (fuente === "audio") li.textContent = `${nombre} · productor y contrato pendientes`;
      else if (!modulo.archivos_presentes?.length) li.textContent = `${nombre} · adaptador no disponible`;
      else li.textContent = `${nombre} · adaptador disponible · ${modulo.validacion || "Validación del productor pendiente"}`;
      panel.append(li);
    }
  } catch {
    const li = document.createElement("li");
    li.textContent = "No se pudo consultar el estado de imagen, video y audio.";
    panel.replaceChildren(li);
  } finally {
    boton.disabled = false;
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
    const entrada = JSON.parse(elemento("experimental-json").value);
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
    estado.textContent = "Evaluación experimental completada.";
  } catch (error) {
    resultados.replaceChildren();
    estado.textContent = `No se pudo evaluar: ${error.message}`;
  } finally {
    boton.disabled = false;
  }
});

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
