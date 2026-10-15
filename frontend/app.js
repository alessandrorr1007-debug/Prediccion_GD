"use strict";

const elemento = (id) => (typeof document !== "undefined" && document.getElementById ? document.getElementById(id) : null);

// ============================================================================
// AulaPredict · Cerebro Integrador de Predicciones y Supervisión Universitaria
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
// MODELO DE DATOS DE ESTUDIANTES (AULA UNIVERSITARIA MULTI-USUARIO)
// ============================================================================
const ESTUDIANTES_INICIALES = [
  {
    id: 1,
    nombre: "Estudiante 1",
    subId: "0.91",
    estado: "Concentrado",
    estadoClase: "status-concentrado",
    atencion: 92,
    tipoAtencion: "attention-fill-green",
    emociones: {
      fatiga: 6,
      estres: 8,
      tristeza: 4,
      neutral: 82,
      dominante: "Neutral / Concentración (😊)"
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
    box: { x: 0.15, y: 0.20, w: 0.25, h: 0.55 },
    label: "Estudiante 1 - Persona (0.91)",
    distractor: false
  },
  {
    id: 2,
    nombre: "Estudiante 2",
    subId: "0.86",
    estado: "Atención baja (Fatiga)",
    estadoClase: "status-fatiga",
    atencion: 42,
    tipoAtencion: "attention-fill-amber",
    emociones: {
      fatiga: 56,
      estres: 22,
      tristeza: 14,
      neutral: 8,
      dominante: "Distracción / Fatiga (😴)"
    },
    causas: [
      { texto: "Posible sobrecarga de tareas o desvelo nocturno prolongado", prob: 82 },
      { texto: "Tránsito pesado o contratiempo antes de ingresar al aula", prob: 75 }
    ],
    consecuencias: [
      { texto: "Dificultad o bloqueo para retener el tema de la sesión de hoy", prob: 78 },
      { texto: "Riesgo moderado a alto de desaprobación ('jalar') en el examen parcial", prob: 65 }
    ],
    score: 68,
    nivelRiesgo: "Riesgo de Desempeño: ALTO / REQUIERE ATENCIÓN",
    esRiesgoAlto: true,
    alertaExamen: "Riesgo Moderado-Alto de Desaprobación: Fatiga acumulada que compromete la comprensión de fórmulas clave para el parcial.",
    narrativa: "El Estudiante 2 ingresó visiblemente cansado con microsueños detectados en cámara y parpadeo lento. Se predice una retención deficiente de la sesión de hoy y riesgo de jalar el examen parcial si no recupera horas de descanso. **Recomendación:** Se sugiere pausa activa y derivación preventiva a asesoría académica.",
    box: { x: 0.45, y: 0.18, w: 0.23, h: 0.52 },
    label: "Estudiante 2 - Persona (0.86)",
    distractor: false
  },
  {
    id: 3,
    nombre: "Estudiante 3",
    subId: "0.82",
    estado: "Alerta Crítica (Celular / Distracción)",
    estadoClase: "status-alerta",
    atencion: 15,
    tipoAtencion: "attention-fill-danger",
    emociones: {
      fatiga: 48,
      estres: 32,
      tristeza: 12,
      neutral: 8,
      dominante: "Distracción / Fatiga (😴)"
    },
    causas: [
      { texto: "Posible sobrecarga de tareas o desvelo nocturno", prob: 82 },
      { texto: "Tránsito, retraso o contratiempo antes de ingresar", prob: 75 }
    ],
    consecuencias: [
      { texto: "Alto riesgo de desaprobación ('jalar') en el examen parcial si el comportamiento se mantiene", prob: 88 },
      { texto: "Dificultad o bloqueo para retener el tema de la sesión de hoy", prob: 78 }
    ],
    score: 74,
    nivelRiesgo: "Riesgo de Desempeño: ALTO / REQUIERE ATENCIÓN",
    esRiesgoAlto: true,
    alertaExamen: "Probable pérdida de continuidad ('jalar') en el examen parcial si persiste este nivel de distracción.",
    narrativa: "El Estudiante 3 ingresó con señales de fatiga acumulada y se ha detectado uso sostenido de teléfono celular bajo la mesa. Se predice una falta de retención del tema actual y un alto riesgo de desaprobar ('jalar') el examen parcial en camino si no hay intervención. **Recomendación:** Se sugiere tutoría o acercamiento preventivo del docente.",
    box: { x: 0.72, y: 0.22, w: 0.24, h: 0.54 },
    label: "Estudiante 3 - Persona (0.82)",
    distractor: true,
    distractorBox: { x: 0.77, y: 0.58, w: 0.12, h: 0.18, label: "Celular (0.88)" }
  },
  {
    id: 4,
    nombre: "Estudiante 4",
    subId: "0.79",
    estado: "Distraído (Mirada desviada)",
    estadoClase: "status-distraido",
    atencion: 38,
    tipoAtencion: "attention-fill-amber",
    emociones: {
      fatiga: 35,
      estres: 45,
      tristeza: 15,
      neutral: 5,
      dominante: "Estrés / Ansiedad (😟)"
    },
    causas: [
      { texto: "Posible conflicto personal o mal momento emocional previo al aula", prob: 84 },
      { texto: "Desmotivación o frustración por calificaciones recientes", prob: 68 }
    ],
    consecuencias: [
      { texto: "Ansiedad ante evaluaciones que bloquea el rendimiento en clase", prob: 74 },
      { texto: "Riesgo notable de desaprobar ('jalar') el examen parcial por evasión y estrés", prob: 71 }
    ],
    score: 65,
    nivelRiesgo: "Riesgo de Desempeño: ALTO / REQUIERE ATENCIÓN",
    esRiesgoAlto: true,
    alertaExamen: "Riesgo Significativo de Desaprobación: Ansiedad elevada que impide procesar ejercicios complejos evaluados en el parcial.",
    narrativa: "El Estudiante 4 presenta postura tensa, mirada evasiva y signos evidentes de angustia durante la explicación teórica. Se estima una baja asimilación y riesgo latente de jalar el examen parcial. **Recomendación:** Acercamiento empático del docente y apoyo psicopedagógico universitario.",
    box: { x: 0.05, y: 0.35, w: 0.22, h: 0.50 },
    label: "Estudiante 4 - Persona (0.79)",
    distractor: false
  },
  {
    id: 5,
    nombre: "Estudiante 5",
    subId: "0.88",
    estado: "Concentrado",
    estadoClase: "status-concentrado",
    atencion: 85,
    tipoAtencion: "attention-fill-blue",
    emociones: {
      fatiga: 8,
      estres: 10,
      tristeza: 5,
      neutral: 77,
      dominante: "Neutral / Concentración (😊)"
    },
    causas: [
      { texto: "Descanso adecuado y preparación previa del tema", prob: 89 },
      { texto: "Estabilidad emocional y motivación activa", prob: 81 }
    ],
    consecuencias: [
      { texto: "Progreso académico continuo y participación efectiva en clase", prob: 85 },
      { texto: "Bajo riesgo de desaprobación ('jalar') en el examen parcial", prob: 15 }
    ],
    score: 20,
    nivelRiesgo: "Riesgo de Desempeño: BAJO / ÓPTIMO",
    esRiesgoAlto: false,
    alertaExamen: "Bajo Riesgo de Desaprobación: Atención sostenida y alta probabilidad de superar el examen parcial satisfactoriamente.",
    narrativa: "El Estudiante 5 mantiene un comportamiento académico ordenado, toma de apuntes consistente y contacto visual con el docente. **Recomendación:** Continuar reconociendo su constancia académica y proponerle ejercicios de profundización.",
    box: { x: 0.32, y: 0.35, w: 0.22, h: 0.50 },
    label: "Estudiante 5 - Persona (0.88)",
    distractor: false
  }
];

let estudiantesData = JSON.parse(JSON.stringify(ESTUDIANTES_INICIALES));
let estudianteSeleccionadoId = 3;
let modoActual = "classroom";
let webcamStream = null;
let animCanvasId = null;

// ============================================================================
// FUNCIONES DE RENDERIZADO DEL DASHBOARD (PREDICCIÓN EN VIVO)
// ============================================================================

function renderizarPanelesInferiores(estudiante) {
  if (!estudiante) return;

  const labels = typeof document !== "undefined" && document.querySelectorAll ? document.querySelectorAll(".selected-student-label") : [];
  labels.forEach(el => {
    el.textContent = `(${estudiante.nombre})`;
  });

  const emoFatiga = elemento("emo-pct-fatiga");
  const barFatiga = elemento("emo-bar-fatiga");
  const emoEstres = elemento("emo-pct-estres");
  const barEstres = elemento("emo-bar-estres");
  const emoTristeza = elemento("emo-pct-tristeza");
  const barTristeza = elemento("emo-bar-tristeza");
  const emoNeutral = elemento("emo-pct-neutral");
  const barNeutral = elemento("emo-bar-neutral");
  const domEmoText = elemento("dominant-emotion-text");

  if (emoFatiga && barFatiga) {
    emoFatiga.textContent = `${estudiante.emociones.fatiga}%`;
    barFatiga.style.width = `${estudiante.emociones.fatiga}%`;
  }
  if (emoEstres && barEstres) {
    emoEstres.textContent = `${estudiante.emociones.estres}%`;
    barEstres.style.width = `${estudiante.emociones.estres}%`;
  }
  if (emoTristeza && barTristeza) {
    emoTristeza.textContent = `${estudiante.emociones.tristeza}%`;
    barTristeza.style.width = `${estudiante.emociones.tristeza}%`;
  }
  if (emoNeutral && barNeutral) {
    emoNeutral.textContent = `${estudiante.emociones.neutral}%`;
    barNeutral.style.width = `${estudiante.emociones.neutral}%`;
  }
  if (domEmoText) {
    domEmoText.textContent = estudiante.emociones.dominante;
  }

  const causesList = elemento("causes-list");
  if (causesList) {
    causesList.innerHTML = estudiante.causas.map(c => `
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
    consequencesList.innerHTML = estudiante.consecuencias.map(c => `
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
    narrativeText.innerHTML = estudiante.narrativa.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  }
}

function renderizarCuadriculaEstudiantes() {
  const container = elemento("students-grid");
  if (!container) return;

  const visibles = modoActual === "webcam" ? estudiantesData.slice(0, 2) : estudiantesData;
  const countBadge = elemento("students-count-badge");
  if (countBadge) {
    countBadge.textContent = `${visibles.length} Alumno${visibles.length === 1 ? "" : "s"} Detectado${visibles.length === 1 ? "" : "s"}`;
  }

  container.innerHTML = visibles.map(est => {
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
  const estudiante = estudiantesData.find(e => e.id === id) || estudiantesData[0];
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

    const alumnos = modoActual === "webcam" ? estudiantesData.slice(0, 1) : estudiantesData;

    alumnos.forEach(est => {
      const isSelected = est.id === estudianteSeleccionadoId;
      const bx = est.box.x * w;
      const by = est.box.y * h;
      const bw = est.box.w * w;
      const bh = est.box.h * h;

      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.strokeStyle = isSelected ? "#1D7AFC" : "#2563EB";
      ctx.fillStyle = isSelected ? "rgba(29, 122, 252, 0.12)" : "rgba(37, 99, 235, 0.06)";
      
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

    animCanvasId = requestAnimationFrame(renderLoop);
  };

  renderLoop();

  canvas.addEventListener("click", (evt) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = (evt.clientX - rect.left) / rect.width;
    const clickY = (evt.clientY - rect.top) / rect.height;

    const alumnos = modoActual === "webcam" ? estudiantesData.slice(0, 1) : estudiantesData;
    for (const est of alumnos) {
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

async function toggleWebcam() {
  const video = elemento("webcam-feed");
  const fallback = elemento("camera-placeholder");
  const btnLabel = elemento("btn-cam-label");

  if (webcamStream) {
    webcamStream.getTracks().forEach(t => t.stop());
    webcamStream = null;
    if (video) {
      video.srcObject = null;
      video.classList.remove("active");
    }
    if (fallback) fallback.classList.remove("hidden");
    if (btnLabel) btnLabel.textContent = "Iniciar Cámara";
    return;
  }

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
      if (btnLabel) btnLabel.textContent = "Detener Cámara";

      seleccionarEstudiante(1);
    }
  } catch (err) {
    console.warn("No se pudo acceder a la cámara web física:", err);
  }
}

function configurarInteraccionesCliente() {
  const btnWebcamMode = elemento("btn-mode-webcam");
  const btnClassroomMode = elemento("btn-mode-classroom");
  const btnStartCam = elemento("btn-start-camera");
  const btnToggleCam = elemento("btn-toggle-cam-stream");

  if (btnWebcamMode && btnClassroomMode) {
    btnWebcamMode.addEventListener("click", () => {
      modoActual = "webcam";
      btnWebcamMode.classList.add("active");
      btnClassroomMode.classList.remove("active");
      seleccionarEstudiante(1);
      if (!webcamStream) toggleWebcam();
    });

    btnClassroomMode.addEventListener("click", () => {
      modoActual = "classroom";
      btnClassroomMode.classList.add("active");
      btnWebcamMode.classList.remove("active");
      renderizarCuadriculaEstudiantes();
      seleccionarEstudiante(3);
    });
  }

  if (btnStartCam) btnStartCam.addEventListener("click", toggleWebcam);
  if (btnToggleCam) btnToggleCam.addEventListener("click", toggleWebcam);

  const btnTriggerPhone = elemento("btn-trigger-phone");
  const btnTriggerGaze = elemento("btn-trigger-gaze");
  const btnTriggerFocus = elemento("btn-trigger-focus");

  if (btnTriggerPhone) {
    btnTriggerPhone.addEventListener("click", () => {
      const target = estudiantesData.find(e => e.id === estudianteSeleccionadoId) || estudiantesData[0];
      target.estado = "Alerta Crítica (Celular / Distracción)";
      target.estadoClase = "status-alerta";
      target.atencion = 12;
      target.tipoAtencion = "attention-fill-danger";
      target.distractor = true;
      target.distractorBox = { x: target.box.x + 0.05, y: target.box.y + 0.35, w: 0.12, h: 0.18, label: "Celular (0.92)" };
      target.score = 88;
      target.nivelRiesgo = "Riesgo de Desempeño: ALTO / REQUIERE ATENCIÓN";
      target.esRiesgoAlto = true;
      target.emociones.fatiga = 42;
      target.emociones.estres = 38;
      target.emociones.neutral = 8;
      target.emociones.dominante = "Distracción / Fatiga (😴)";
      target.alertaExamen = "Probable pérdida de continuidad ('jalar') en el examen parcial si persiste este nivel de distracción por uso de celular.";
      target.narrativa = `El ${target.nombre} presenta uso de dispositivo celular no autorizado frente a cámara. Se pronostica desaprobación inminente del examen parcial si la conducta persiste. **Recomendación:** Notificación inmediata y retención de foco pedagógico.`;

      if (btnTriggerPhone) btnTriggerPhone.classList.add("active");
      if (btnTriggerGaze) btnTriggerGaze.classList.remove("active");
      if (btnTriggerFocus) btnTriggerFocus.classList.remove("active");

      renderizarCuadriculaEstudiantes();
      renderizarPanelesInferiores(target);
    });
  }

  if (btnTriggerGaze) {
    btnTriggerGaze.addEventListener("click", () => {
      const target = estudiantesData.find(e => e.id === estudianteSeleccionadoId) || estudiantesData[0];
      target.estado = "Distraído (Mirada desviada)";
      target.estadoClase = "status-distraido";
      target.atencion = 35;
      target.tipoAtencion = "attention-fill-amber";
      target.distractor = false;
      target.score = 62;
      target.nivelRiesgo = "Riesgo de Desempeño: ALTO / REQUIERE ATENCIÓN";
      target.esRiesgoAlto = true;
      target.emociones.fatiga = 30;
      target.emociones.estres = 45;
      target.emociones.neutral = 15;
      target.emociones.dominante = "Estrés / Ansiedad (😟)";
      target.alertaExamen = "Riesgo de Desaprobación: Pérdida recurrente de atención visual que compromete temas clave evaluados en el parcial.";

      if (btnTriggerPhone) btnTriggerPhone.classList.remove("active");
      if (btnTriggerGaze) btnTriggerGaze.classList.add("active");
      if (btnTriggerFocus) btnTriggerFocus.classList.remove("active");

      renderizarCuadriculaEstudiantes();
      renderizarPanelesInferiores(target);
    });
  }

  if (btnTriggerFocus) {
    btnTriggerFocus.addEventListener("click", () => {
      const target = estudiantesData.find(e => e.id === estudianteSeleccionadoId) || estudiantesData[0];
      target.estado = "Concentrado";
      target.estadoClase = "status-concentrado";
      target.atencion = 94;
      target.tipoAtencion = "attention-fill-green";
      target.distractor = false;
      target.score = 12;
      target.nivelRiesgo = "Riesgo de Desempeño: BAJO / ÓPTIMO";
      target.esRiesgoAlto = false;
      target.emociones.fatiga = 5;
      target.emociones.estres = 7;
      target.emociones.neutral = 85;
      target.emociones.dominante = "Neutral / Concentración (😊)";
      target.alertaExamen = "Bajo riesgo de desaprobación ('jalar'). Atención óptima sostenida para aprobar el examen parcial.";
      target.narrativa = `El ${target.nombre} mantiene un nivel de concentración excelente y sincronizado con la sesión. **Recomendación:** Mantener la cadencia actual.`;

      if (btnTriggerPhone) btnTriggerPhone.classList.remove("active");
      if (btnTriggerGaze) btnTriggerGaze.classList.remove("active");
      if (btnTriggerFocus) btnTriggerFocus.classList.add("active");

      renderizarCuadriculaEstudiantes();
      renderizarPanelesInferiores(target);
    });
  }
}

if (typeof window !== "undefined") {
  renderizarCuadriculaEstudiantes();
  renderizarPanelesInferiores(estudiantesData.find(e => e.id === estudianteSeleccionadoId));
  iniciarRelojEnVivo();
  iniciarRenderizadoCanvas();
  configurarInteraccionesCliente();
}

// ============================================================================
// SUITE DE PRUEBAS AUTOMATIZADAS Y CONTROLADORES EXACTOS
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
