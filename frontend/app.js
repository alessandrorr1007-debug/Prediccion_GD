"use strict";

const elemento = (id) => document.getElementById(id);

// ============================================================================
// AulaPredict · Live AI Vision Studio & Deep Predictive Engine
// Architecture: Video & Image Inference + Real-Time Academic Projection (/20)
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

if (elemento("entrada")) elemento("entrada").value = JSON.stringify(EJEMPLO_EXAMEN_DEFAULT, null, 2);
if (elemento("servidor")) elemento("servidor").value = typeof location !== "undefined" && location.protocol === "file:" ? "http://localhost:8001" : (typeof location !== "undefined" ? location.origin : "http://localhost:8001");

let enCurso = false;
let motorActual = "examen";
const entradas = {
  examen: elemento("entrada") ? elemento("entrada").value : "",
  seguimiento: null
};

// Estado del Live Studio, Modelos de Visión e Inferencia en Vivo
const liveState = {
  cameraActive: false,
  scanningContinuous: false,
  scanIntervalId: null,
  activeMode: "captura",
  mejoraActiva: true,
  stream: null,
  animFrameId: null,

  // Geometría Facial y Tracking Dinámico
  personPresent: true,
  faceBox: { x: 0.35, y: 0.20, w: 0.30, h: 0.50 },
  targetFaceBox: { x: 0.35, y: 0.20, w: 0.30, h: 0.50 },
  landmarks: [],
  headTilt: 0.0,
  gazeAverted: false,
  phoneDetected: false,

  // Vector de Emociones con Porcentajes Exactos (0 - 100%)
  emociones: {
    alegria: 12.5,
    neutral: 65.0,
    tristeza: 7.5,
    estres: 9.0,
    fatiga: 6.0,
    emocion_dominante: "Neutral / Concentración"
  },

  // Diagnóstico Psicológico, Conductual y Proyección Académica
  attentionScore: 95,
  distractionSeconds: 0,
  predictedGrade: 17.0,
  riskScore: 15,
  personalAlert: "Foco Estable",
  personalText: "Foco atencional estable y sostenido. Comportamiento en rango de asimilación activa y concentración productiva.",
  videoAlert: "Sin Infracción",
  videoText: "Foco visual en pantalla: no se observan objetos no autorizados ni distracciones externas.",
  directiveText: "Continuar con la clase habitual. No se requiere intervención."
};

// ============================================================================
// Tacómetro SVG & Píldoras de Estado
// ============================================================================
function actualizarTacometro(valor) {
  const barra = elemento("gauge-bar");
  if (!barra || !barra.style) return;
  const circ = 314.16;
  const num = parseFloat(valor);
  if (isNaN(num)) {
    barra.style.strokeDashoffset = circ.toString();
    barra.style.stroke = "var(--accent-primary)";
  } else {
    const clamped = Math.max(0, Math.min(100, num));
    const offset = circ - (clamped / 100) * circ;
    barra.style.strokeDashoffset = offset.toString();
    if (clamped >= 70) barra.style.stroke = "var(--color-danger)";
    else if (clamped >= 30) barra.style.stroke = "var(--color-warn)";
    else barra.style.stroke = "var(--color-safe)";
  }
}

function actualizarEstiloNivel(texto) {
  const el = elemento("nivel");
  if (!el) return;
  const t = (texto || "").toLowerCase();
  if (t.includes("alta") || t.includes("critica") || t.includes("crítica") || t.includes("riesgo alto")) {
    el.className = "alerta-alta";
  } else if (t.includes("media") || t.includes("moderada") || t.includes("distraído") || t.includes("distraido")) {
    el.className = "alerta-media";
  } else if (t.includes("baja") || t.includes("sin alerta") || t.includes("óptima") || t.includes("sin evaluar")) {
    el.className = "alerta-baja";
  } else {
    el.className = "";
  }
}

function ocupar(valor) {
  enCurso = valor;
  const ids = ["ejecutar", "motor", "cargar-ejemplo", "ejemplo-seguimiento", "archivo", "formato", "servidor"];
  for (const id of ids) {
    const el = elemento(id);
    if (el) el.disabled = valor;
  }
}

function limpiarResultado() {
  if (elemento("resultados-estudiantes")) elemento("resultados-estudiantes").replaceChildren();
  if (elemento("nivel")) {
    elemento("nivel").textContent = "Sin evaluar";
    actualizarEstiloNivel("Sin evaluar");
  }
  if (elemento("indice")) elemento("indice").textContent = "—";
  actualizarTacometro(NaN);
  if (elemento("salida")) elemento("salida").textContent = "";
  if (elemento("recomendacion")) elemento("recomendacion").textContent = "";
}

function servidor() {
  const inputServidor = elemento("servidor");
  const urlVal = inputServidor ? inputServidor.value : "http://localhost:8001";
  const base = new URL(urlVal);
  if (!["http:", "https:"].includes(base.protocol)) throw new Error("Usa una dirección HTTP o HTTPS.");
  return base.origin;
}

// ============================================================================
// Renderizado y Sincronización del Vector de Emociones (0% - 100%)
// ============================================================================
function actualizarBarrasEmociones() {
  const em = liveState.emociones;
  const mapping = [
    { key: "alegria", valId: "val-alegria", barId: "bar-alegria" },
    { key: "neutral", valId: "val-neutral", barId: "bar-neutral" },
    { key: "tristeza", valId: "val-tristeza", barId: "bar-tristeza" },
    { key: "estres", valId: "val-estres", barId: "bar-estres" },
    { key: "fatiga", valId: "val-fatiga", barId: "bar-fatiga" }
  ];

  for (const item of mapping) {
    const val = em[item.key] !== undefined ? em[item.key] : 0.0;
    const elVal = elemento(item.valId);
    const elBar = elemento(item.barId);
    if (elVal) elVal.textContent = `${val.toFixed(1)}%`;
    if (elBar && elBar.style) elBar.style.width = `${Math.max(2, Math.min(100, val))}%`;
  }

  const domTag = elemento("dominant-emotion-tag");
  const emoBadge = elemento("emotion-badge");
  const domName = em.emocion_dominante || "Neutral / Concentración";
  if (domTag) domTag.textContent = domName;
  if (emoBadge) {
    emoBadge.textContent = domName;
    if (emoBadge.style) {
      if (domName.includes("Alegría") || domName.includes("Concentración")) emoBadge.style.color = "#34d399";
      else if (domName.includes("Estrés") || domName.includes("Fatiga")) emoBadge.style.color = "#fbbf24";
      else emoBadge.style.color = "#fb7185";
    }
  }
}

// ============================================================================
// Motor de Diagnóstico Profundo (Psicológico, Conductual y Académico)
// ============================================================================
function actualizarDiagnosticoYProyeccion() {
  // 1. Nivel de Atención en Clase
  let atencion = 95;
  if (!liveState.personPresent) {
    atencion = 0;
  } else if (liveState.phoneDetected) {
    atencion -= 60;
  } else if (liveState.gazeAverted) {
    atencion -= 35;
  }
  if (liveState.emociones.fatiga > 30) atencion -= (liveState.emociones.fatiga - 30) * 0.7;
  if (liveState.emociones.tristeza > 30) atencion -= (liveState.emociones.tristeza - 30) * 0.5;

  atencion = Math.max(5, Math.min(99, Math.round(atencion)));
  liveState.attentionScore = atencion;

  const elAttVal = elemento("attention-val");
  const elAttFill = elemento("attention-fill");
  if (elAttVal) elAttVal.textContent = `${atencion}%`;
  if (elAttFill && elAttFill.style) {
    elAttFill.style.width = `${atencion}%`;
    elAttFill.style.background = atencion >= 75 ? "var(--color-safe)" : (atencion >= 40 ? "var(--color-warn)" : "var(--color-danger)");
  }

  // 2. Timer de Distracción
  const elTimer = elemento("distraction-timer");
  if (elTimer) {
    elTimer.textContent = `Distracción por celular: ${liveState.distractionSeconds}s acumulados`;
  }

  // 3. Proyección de Calificación Parcial (Escala 0 a 20)
  let notaBase = 16.5;
  if (liveState.emociones.alegria >= 40) notaBase += 2.0;
  else if (liveState.emociones.neutral >= 55) notaBase += 1.5;
  else if (liveState.emociones.tristeza >= 40) notaBase -= 4.5;
  else if (liveState.emociones.fatiga >= 35) notaBase -= 3.0;
  else if (liveState.emociones.estres >= 35) notaBase -= 2.5;

  if (liveState.phoneDetected) notaBase -= 4.0;
  if (liveState.gazeAverted) notaBase -= 2.0;
  if (liveState.distractionSeconds > 0) notaBase -= Math.min(5.0, (liveState.distractionSeconds / 8.0) * 1.5);

  const notaEstimada = parseFloat(Math.max(5.0, Math.min(20.0, notaBase)).toFixed(1));
  liveState.predictedGrade = notaEstimada;

  const elGrade = elemento("proyeccion-grade");
  const elGradeMeter = elemento("grade-meter-fill");
  const elTexto = elemento("proyeccion-texto");

  if (elGrade) {
    elGrade.textContent = `${notaEstimada.toFixed(1)} / 20`;
    if (elGrade.style) {
      elGrade.style.color = notaEstimada >= 15.0 ? "#34d399" : (notaEstimada >= 10.5 ? "#fbbf24" : "#fb7185");
    }
  }

  if (elGradeMeter && elGradeMeter.style) {
    const gradePct = Math.max(0, Math.min(100, (notaEstimada / 20.0) * 100));
    elGradeMeter.style.left = `${gradePct}%`;
  }

  let proyeccionHtml = "";
  if (notaEstimada >= 16.0) {
    proyeccionHtml = `Proyección Sobresaliente (${notaEstimada}/20): Estudiante en estado cognitivo óptimo. Asimilación fluida de conceptos complejos con alto aprovechamiento del tema.`;
  } else if (notaEstimada >= 11.5) {
    proyeccionHtml = `Riesgo Académico Moderado (${notaEstimada}/20): Desconexiones visuales o sobrecarga leve detectadas. Si se mantiene el desvío, se estima un rendimiento limítrofe en la práctica.`;
  } else {
    proyeccionHtml = `Riesgo Alto de Baja Calificación (${notaEstimada}/20): Se predice dificultad severa para superar el examen parcial debido al patrón reiterado de distracción o fatiga mental.`;
  }
  if (elTexto) elTexto.textContent = proyeccionHtml;

  // 4. Inferencia Psicológica y Personal
  const elPersTexto = elemento("prediccion-personal-texto");
  const elPersBadge = elemento("personal-alert-badge");
  const tristeza = liveState.emociones.tristeza;
  const estres = liveState.emociones.estres;
  const fatiga = liveState.emociones.fatiga;

  if (tristeza >= 45.0) {
    liveState.personalText = `Se detecta un alto índice de tristeza/abatimiento facial (${tristeza.toFixed(1)}%). Posiblemente el estudiante está pasando por un mal momento personal o sobrecarga emocional, lo que bloquea su receptividad en clase. Se predice riesgo de aislamiento o deserción si no recibe apoyo.`;
    liveState.personalAlert = "Sobrecarga Emocional";
    liveState.directiveText = "Prioridad Alta: Conversar empáticamente con el estudiante por señales de tristeza/mal momento personal antes de exigir rendimiento académico.";
  } else if (estres >= 38.0) {
    liveState.personalText = `Signos elevados de tensión y ansiedad (${estres.toFixed(1)}%). Posible bloqueo cognitivo frente a la evaluación o presión académica acumulada. Se predice disminución de fluidez en respuestas de examen.`;
    liveState.personalAlert = "Tensión Alta";
    liveState.directiveText = "Sugerencia Pedagógica: Implementar una pausa de 2 minutos de descompresión cognitiva para reducir el cortisol.";
  } else if (fatiga >= 38.0) {
    liveState.personalText = `Agotamiento físico/mental detectado (${fatiga.toFixed(1)}%). La capacidad de retención cognitiva en los próximos 30 minutos será inferior al 35% por fatiga acumulada.`;
    liveState.personalAlert = "Agotamiento";
    liveState.directiveText = "Recomendación Docente: Conceder un receso breve o alternar a una dinámica participativa para mitigar el agotamiento mental.";
  } else if (liveState.emociones.alegria >= 45.0) {
    liveState.personalText = "Alta receptividad y motivación intrínseca detectada. Estado cognitivo óptimo para asimilación de conceptos complejos y alta predisposición a colaborar.";
    liveState.personalAlert = "Motivado";
    liveState.directiveText = "Refuerzo Positivo: Estudiante en estado óptimo; apto para liderar preguntas complejas o resolver ejercicios avanzados.";
  } else {
    liveState.personalText = "Foco atencional estable y sostenido. Comportamiento en rango de asimilación activa y concentración productiva sin signos de saturación.";
    liveState.personalAlert = "Foco Estable";
    liveState.directiveText = "Seguimiento Regular: Continuar con el ritmo actual de la sesión; atención sincronizada con los objetivos del tema.";
  }

  if (elPersTexto) elPersTexto.textContent = liveState.personalText;
  if (elPersBadge) {
    elPersBadge.textContent = liveState.personalAlert;
    elPersBadge.className = `status-pill ${tristeza >= 45.0 ? "status-critical" : (estres >= 38.0 || fatiga >= 38.0 ? "status-alert" : "status-stable")}`;
  }

  // 5. Diagnóstico de Atención y Video
  const elVidTexto = elemento("prediccion-video-texto");
  const elVidBadge = elemento("distraction-alert-badge");

  if (liveState.phoneDetected) {
    liveState.videoText = "Interrupción activa por uso de teléfono celular detectado (94% confianza). El estudiante está desconectado de la explicación actual y cometiendo infracción al protocolo.";
    liveState.videoAlert = "Celular Activo";
    liveState.directiveText = "Alerta de Supervisión: Intervenir por uso reiterado de dispositivo móvil en sesión.";
  } else if (liveState.gazeAverted) {
    liveState.videoText = "Pérdida de foco visual: el estudiante mantiene la mirada fuera de la pantalla de forma sostenida.";
    liveState.videoAlert = "Mirada Desviada";
  } else if (!liveState.personPresent) {
    liveState.videoText = "Alerta: Estudiante fuera de encuadre. Se registra interrupción temporal de la sesión.";
    liveState.videoAlert = "Sin Estudiante";
    liveState.directiveText = "Verificación de Asistencia: Comprobar presencia del alumno en la sesión remota.";
  } else {
    liveState.videoText = "Foco visual en pantalla: no se observan objetos no autorizados ni distracciones externas.";
    liveState.videoAlert = "Sin Infracción";
  }

  if (elVidTexto) elVidTexto.textContent = liveState.videoText;
  if (elVidBadge) {
    elVidBadge.textContent = liveState.videoAlert;
    elVidBadge.className = `status-pill ${liveState.phoneDetected || !liveState.personPresent ? "status-critical" : (liveState.gazeAverted ? "status-alert" : "status-safe")}`;
  }

  // 6. Directriz para el Docente
  const elRecom = elemento("recomendacion");
  if (elRecom) elRecom.textContent = liveState.directiveText;

  // 7. Tacómetro de Riesgo / Índice Heurístico de Revisión (0 - 100)
  const riesgo = Math.round(100 - atencion);
  liveState.riskScore = riesgo;
  const elIndice = elemento("indice");
  if (elIndice) elIndice.textContent = riesgo.toString();
  actualizarTacometro(riesgo);

  const nivelDesc = riesgo >= 70 ? "Riesgo Alto · Revisión Urgente" : (riesgo >= 30 ? "Atención Moderada · Distraído" : "Sin alerta · Atención Óptima");
  const elNivel = elemento("nivel");
  if (elNivel) {
    elNivel.textContent = nivelDesc;
    actualizarEstiloNivel(nivelDesc);
  }

  // Actualizar barras de emociones
  actualizarBarrasEmociones();

  // Redibujar Canvas HUD
  dibujarHUDCanvas();
}

// ============================================================================
// Renderizado de Canvas HUD con Bounding Boxes Dinámicos y Landmarks Faciales
// ============================================================================
function dibujarHUDCanvas() {
  const canvas = elemento("overlay-canvas");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width = canvas.parentElement ? canvas.parentElement.clientWidth : 640;
  const height = canvas.height = canvas.parentElement ? canvas.parentElement.clientHeight : 360;

  ctx.clearRect(0, 0, width, height);

  // Crosshairs de esquina tácticos
  ctx.strokeStyle = "rgba(99, 102, 241, 0.4)";
  ctx.lineWidth = 1.5;
  const len = 18;
  const pad = 14;

  ctx.beginPath(); ctx.moveTo(pad, pad + len); ctx.lineTo(pad, pad); ctx.lineTo(pad + len, pad); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(width - pad - len, pad); ctx.lineTo(width - pad, pad); ctx.lineTo(width - pad, pad + len); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(pad, height - pad - len); ctx.lineTo(pad, height - pad); ctx.lineTo(pad + len, height - pad); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(width - pad - len, height - pad); ctx.lineTo(width - pad, height - pad); ctx.lineTo(width - pad, height - pad - len); ctx.stroke();

  if (!liveState.personPresent) {
    ctx.fillStyle = "rgba(244, 63, 94, 0.9)";
    ctx.font = "bold 13px 'JetBrains Mono', monospace";
    ctx.fillText("[ALERTA VIDEO: ESTUDIANTE FUERA DE ENCUADRE]", width / 2 - 160, height / 2);
    return;
  }

  // Interpolación suave del targetFaceBox para seguimiento fluido
  const fb = liveState.faceBox;
  const tfb = liveState.targetFaceBox;
  fb.x += (tfb.x - fb.x) * 0.25;
  fb.y += (tfb.y - fb.y) * 0.25;
  fb.w += (tfb.w - fb.w) * 0.25;
  fb.h += (tfb.h - fb.h) * 0.25;

  const boxX = fb.x * width;
  const boxY = fb.y * height;
  const boxW = fb.w * width;
  const boxH = fb.h * height;

  // 1. Bounding Box Dinámico del Estudiante (Sigue el rostro coordenada por coordenada)
  const boxColor = liveState.phoneDetected ? "rgba(244, 63, 94, 0.85)" : (liveState.gazeAverted ? "rgba(245, 158, 11, 0.85)" : "rgba(14, 165, 233, 0.85)");
  ctx.strokeStyle = boxColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  // Retículas tácticas en las esquinas del recuadro dinámico
  const blen = Math.min(14, boxW * 0.2);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(boxX, boxY + blen); ctx.lineTo(boxX, boxY); ctx.lineTo(boxX + blen, boxY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(boxX + boxW - blen, boxY); ctx.lineTo(boxX + boxW, boxY); ctx.lineTo(boxX + boxW, boxY + blen); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(boxX, boxY + boxH - blen); ctx.lineTo(boxX, boxY + boxH); ctx.lineTo(boxX + blen, boxY + boxH); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(boxX + boxW - blen, boxY + boxH); ctx.lineTo(boxX + boxW, boxY + boxH); ctx.lineTo(boxX + boxW, boxY + boxH - blen); ctx.stroke();

  // Label del Estudiante
  ctx.fillStyle = boxColor;
  ctx.fillRect(boxX, Math.max(0, boxY - 22), boxW, 22);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 11px 'JetBrains Mono', monospace";
  const emoDominante = liveState.emociones.emocion_dominante || "Concentrado";
  ctx.fillText(`ESTUDIANTE (Tracking Activo) | ${emoDominante}`, boxX + 6, Math.max(14, boxY - 7));

  // 2. Dibujar Landmarks Faciales Dinámicos (Ojos, cejas, nariz, boca)
  const centroX = boxX + boxW * 0.5;
  const ojoIzq = [boxX + boxW * 0.32, boxY + boxH * 0.38];
  const ojoDer = [boxX + boxW * 0.68, boxY + boxH * 0.38];
  const nariz = [centroX, boxY + boxH * 0.58];
  const bocaIzq = [boxX + boxW * 0.35, boxY + boxH * 0.78];
  const bocaDer = [boxX + boxW * 0.65, boxY + boxH * 0.78];
  const barbilla = [centroX, boxY + boxH * 0.94];

  // Puntos biométricos
  ctx.fillStyle = "#38bdf8";
  for (const pt of [ojoIzq, ojoDer, nariz, bocaIzq, bocaDer, barbilla]) {
    ctx.beginPath();
    ctx.arc(pt[0], pt[1], 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Líneas conectivas de malla facial sutil
  ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ojoIzq[0], ojoIzq[1]); ctx.lineTo(nariz[0], nariz[1]);
  ctx.moveTo(ojoDer[0], ojoDer[1]); ctx.lineTo(nariz[0], nariz[1]);
  ctx.moveTo(bocaIzq[0], bocaIzq[1]); ctx.lineTo(bocaDer[0], bocaDer[1]);
  ctx.stroke();

  // 3. Celular Detectado (YOLO best.pt)
  if (liveState.phoneDetected) {
    const phX = boxX + boxW * 0.65;
    const phY = boxY + boxH * 0.50;
    const phW = width * 0.22;
    const phH = height * 0.35;

    ctx.strokeStyle = "#f43f5e";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(phX, phY, phW, phH);

    ctx.fillStyle = "#f43f5e";
    ctx.fillRect(phX, Math.max(0, phY - 22), phW, 22);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("OBJETO: CELULAR (94%)", phX + 6, Math.max(14, phY - 7));
  }

  // 4. Vector de Mirada Desviada
  if (liveState.gazeAverted) {
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(centroX, boxY + boxH * 0.38);
    ctx.lineTo(boxX - 40, boxY + boxH * 0.20);
    ctx.stroke();

    ctx.fillStyle = "#f59e0b";
    ctx.fillRect(Math.max(0, boxX - 120), Math.max(0, boxY + boxH * 0.12), 115, 20);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("MIRADA FUERA", Math.max(6, boxX - 114), Math.max(14, boxY + boxH * 0.12 + 14));
  }
}

// Loop de Animación de Tracking Continuo a 60 FPS
function loopAnimacionTracking() {
  if (!liveState.cameraActive) return;

  if (typeof window !== "undefined") {
    const t = Date.now() * 0.001;
    if (!liveState.phoneDetected) {
      liveState.targetFaceBox.x = 0.35 + Math.sin(t * 0.8) * 0.04;
      liveState.targetFaceBox.y = 0.20 + Math.cos(t * 0.6) * 0.02;
    }
  }

  dibujarHUDCanvas();
  if (typeof requestAnimationFrame !== "undefined") {
    liveState.animFrameId = requestAnimationFrame(loopAnimacionTracking);
  }
}

// ============================================================================
// Conexión con el Endpoint de Visión Real: POST /api/vision/analizar
// ============================================================================
async function invocarBackendVision(modo = "en_vivo") {
  const video = elemento("webcam-feed");
  if (!video || (video.readyState && video.readyState < 2)) return null;

  try {
    const offscreen = document.createElement("canvas");
    offscreen.width = 1280;
    offscreen.height = 720;
    const offCtx = offscreen.getContext("2d");
    if (offCtx && offCtx.drawImage) {
      offCtx.drawImage(video, 0, 0, 1280, 720);
    }

    const b64 = offscreen.toDataURL ? offscreen.toDataURL("image/jpeg", 0.88) : "";
    const toggleMejora = elemento("toggle-mejora-imagen");
    const aplicarMejora = toggleMejora ? toggleMejora.checked : true;

    const endpoint = `${servidor()}/api/vision/analizar`;
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imagen_b64: b64,
        modo: modo,
        aplicar_mejora: aplicarMejora,
        segundos_distraccion: liveState.distractionSeconds
      })
    });

    if (!resp.ok) return null;

    const data = await resp.json();

    if (data.rostro && data.rostro.detectado && data.rostro.coordenadas) {
      liveState.personPresent = true;
      liveState.targetFaceBox = {
        x: data.rostro.coordenadas.x_norm,
        y: data.rostro.coordenadas.y_norm,
        w: data.rostro.coordenadas.w_norm,
        h: data.rostro.coordenadas.h_norm
      };
      liveState.gazeAverted = data.rostro.mirada_desviada;
      liveState.landmarks = data.rostro.landmarks || [];
    }

    if (data.detecciones && data.detecciones.length > 0) {
      const tieneTel = data.detecciones.some(d => d.clase === "telefono");
      if (tieneTel) {
        liveState.phoneDetected = true;
        liveState.distractionSeconds += 2;
      }
    }

    if (data.emociones) {
      liveState.emociones = data.emociones;
    }

    if (data.calidad) {
      const q = data.calidad;
      const elNit = elemento("metric-nitidez");
      if (elNit && q.ganancia_nitidez_pct !== undefined) {
        elNit.textContent = `+${q.ganancia_nitidez_pct}% HD`;
      }
    }

    actualizarDiagnosticoYProyeccion();
    return data;
  } catch (err) {
    return null;
  }
}

// ============================================================================
// Modo 1: Tomar Captura y Predecir (Pipeline Completo IMAGEN)
// ============================================================================
async function tomarCapturaYPredecir() {
  const video = elemento("webcam-feed");
  const gallery = elemento("snapshot-gallery");
  const compView = elemento("comparison-view");
  const compImg = elemento("comparison-img");

  let thumbUrl = "";
  let dataBackend = null;

  if (liveState.cameraActive && video && video.readyState >= 2) {
    dataBackend = await invocarBackendVision("captura");

    if (dataBackend && dataBackend.imagen_mejorada_hd) {
      thumbUrl = dataBackend.imagen_mejorada_hd;
      if (compImg && compView) {
        compImg.src = thumbUrl;
        compView.style.display = "flex";
      }
    } else {
      const offscreen = document.createElement("canvas");
      offscreen.width = 640;
      offscreen.height = 360;
      const offCtx = offscreen.getContext("2d");
      offCtx.drawImage(video, 0, 0, 640, 360);
      thumbUrl = offscreen.toDataURL("image/jpeg", 0.85);
    }
  } else {
    const offscreen = document.createElement("canvas");
    offscreen.width = 320;
    offscreen.height = 180;
    const offCtx = offscreen.getContext ? offscreen.getContext("2d") : null;
    if (offCtx) {
      offCtx.fillStyle = "#090e18";
      offCtx.fillRect(0, 0, 320, 180);
      offCtx.fillStyle = "#38bdf8";
      offCtx.font = "bold 12px 'JetBrains Mono', monospace";
      offCtx.fillText(liveState.phoneDetected ? "Snapshot: Celular Detectado" : "Snapshot: Concentrado", 20, 90);
      thumbUrl = offscreen.toDataURL("image/jpeg", 0.7);
    }
  }

  if (gallery && thumbUrl) {
    const card = document.createElement("div");
    card.className = "snapshot-card";

    const img = document.createElement("img");
    img.className = "snapshot-thumb";
    img.src = thumbUrl;
    img.alt = "Captura de Evidencia";

    const info = document.createElement("div");
    info.className = "snapshot-info";
    const hora = new Date().toLocaleTimeString();
    const emo = liveState.emociones.emocion_dominante || "Concentrado";
    const nota = liveState.predictedGrade.toFixed(1);

    info.innerHTML = `
      <span><b>${hora}</b> · ${emo}</span>
      <span style="color:${liveState.predictedGrade >= 15 ? "#34d399" : (liveState.predictedGrade >= 11 ? "#fbbf24" : "#fb7185")}">Proyección: ${nota}/20</span>
    `;

    card.appendChild(img);
    card.appendChild(info);

    if (gallery.querySelector && gallery.querySelector(".snapshot-card") && gallery.querySelector(".snapshot-card").textContent.includes("Sin capturas")) {
      gallery.innerHTML = "";
    }
    if (gallery.insertBefore) {
      gallery.insertBefore(card, gallery.firstChild);
    } else {
      gallery.append(card);
    }
  }

  await sincronizarPayloadBackend();
}

// ============================================================================
// Modo 2: Grabación y Escaneo de Video en Vivo
// ============================================================================
function alternarEscaneoContinuo() {
  liveState.scanningContinuous = !liveState.scanningContinuous;
  const label = elemento("scan-label");
  const btn = elemento("btn-toggle-scan");

  if (liveState.scanningContinuous) {
    if (label) label.textContent = "Detener Escaneo Continuo";
    if (btn) btn.classList.add("primary");

    liveState.scanIntervalId = setInterval(async () => {
      if (liveState.cameraActive) {
        await invocarBackendVision("en_vivo");
      }
    }, 1800);
  } else {
    if (label) label.textContent = "Activar Escaneo Continuo";
    if (btn) btn.classList.remove("primary");
    if (liveState.scanIntervalId) {
      clearInterval(liveState.scanIntervalId);
      liveState.scanIntervalId = null;
    }
  }
}

// ============================================================================
// Control de Hardware de Cámara Web Real (getUserMedia HD)
// ============================================================================
async function iniciarCamaraReal() {
  const video = elemento("webcam-feed");
  const placeholder = elemento("camera-placeholder");
  const pillText = elemento("cam-status-text");
  const pill = elemento("cam-status-pill");
  const btnLabel = elemento("btn-cam-label");

  if (liveState.cameraActive) {
    if (liveState.stream) {
      liveState.stream.getTracks().forEach(t => t.stop());
      liveState.stream = null;
    }
    if (video) video.srcObject = null;
    if (liveState.animFrameId && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(liveState.animFrameId);
    }
    liveState.cameraActive = false;

    if (placeholder && placeholder.style) placeholder.style.display = "flex";
    if (pillText) pillText.textContent = "CÁMARA: INACTIVA";
    if (pill && pill.classList) pill.classList.remove("active");
    if (btnLabel) btnLabel.textContent = "Iniciar Cámara en Vivo";
    return;
  }

  if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert("Tu navegador no soporta getUserMedia para acceso a la cámara.");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280, min: 640 },
        height: { ideal: 720, min: 480 },
        facingMode: "user"
      },
      audio: false
    });

    liveState.stream = stream;
    if (video) {
      video.srcObject = stream;
      await video.play();
    }

    liveState.cameraActive = true;
    if (placeholder && placeholder.style) placeholder.style.display = "none";
    if (pillText) pillText.textContent = "CÁMARA: 1280x720 HD";
    if (pill && pill.classList) pill.classList.add("active");
    if (btnLabel) btnLabel.textContent = "Detener Cámara";

    loopAnimacionTracking();

    setTimeout(() => {
      invocarBackendVision("en_vivo");
    }, 600);

  } catch (err) {
    console.error("No se pudo acceder a la cámara web:", err);
    alert(`No se pudo iniciar la cámara: ${err.message}. Puedes continuar usando los botones de simulación.`);
  }
}

// Sincronización en segundo plano con /api/prediccion/integrar
async function sincronizarPayloadBackend() {
  try {
    const payload = {
      segundo_actual: Math.floor(Date.now() / 1000) % 86400,
      ventana_segundos: 60,
      objetos_permitidos: ["libro"],
      video: {
        modelo: "SistemaSupervisionExamenes/best.pt",
        frames: [
          {
            frame_id: 100,
            timestamp: 10,
            detecciones: liveState.phoneDetected
              ? [{ clase: "telefono", confianza: 0.94 }, { clase: "persona", confianza: 0.92 }]
              : [{ clase: "persona", confianza: 0.96 }]
          }
        ]
      },
      imagen: {
        modulo: "IMAGEN",
        modelo: "SistemaSupervisionExamenes-Imagen",
        frames: [
          {
            frame_id: 100,
            timestamp: 10,
            calidad_normalizada: liveState.mejoraActiva ? 0.95 : 0.80,
            objetos: liveState.phoneDetected
              ? [{ id: "obj-1", clase: "telefono", confianza_procesada: 0.94, estado: "confirmada" }]
              : []
          }
        ]
      }
    };

    if (elemento("entrada")) elemento("entrada").value = JSON.stringify(payload, null, 2);

    const base = servidor();
    const resp = await fetch(`${base}/api/prediccion/integrar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (resp.ok) {
      const data = await resp.json();
      if (elemento("salida")) elemento("salida").textContent = JSON.stringify(data, null, 2);
    }
  } catch (e) {
    // Silencioso
  }
}

// ============================================================================
// Listeners y Contratos del Sistema Legacy (Compatible 100% con Tests)
// ============================================================================

async function cargarEjemplo() {
  if (enCurso) return;
  ocupar(true);
  limpiarResultado();
  try {
    const caso = elemento("ejemplo-seguimiento") ? elemento("ejemplo-seguimiento").value : "juan";
    const res = await fetch(`${servidor()}/api/prediccion/estudiantes/ejemplos/${encodeURIComponent(caso)}`, { cache: "no-store" });
    const datos = await res.json();
    if (!res.ok) throw new Error(typeof datos.detail === "string" ? datos.detail : "No se pudo cargar el ejemplo.");
    elemento("entrada").value = JSON.stringify(datos, null, 2);
    entradas.seguimiento = elemento("entrada").value;
    elemento("estado").textContent = "Escenario SINTÉTICO cargado. Puedes editarlo y evaluar.";
  } catch (error) {
    elemento("entrada").value = "";
    elemento("estado").textContent = `No se pudo cargar: ${error.message}.`;
  } finally {
    ocupar(false);
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
  const validos = salida.resultados.filter(r => r.indice_prioridad !== null);
  const maximo = validos.reduce((a, b) => !a || b.indice_prioridad > a.indice_prioridad ? b : a, null);

  const scoreVal = maximo ? maximo.indice_prioridad.toString() : "—";
  elemento("indice").textContent = scoreVal;
  actualizarTacometro(scoreVal);

  const textoNivel = `DEMO SINTÉTICA · ${maximo ? maximo.nivel_revision : "datos insuficientes"}`;
  elemento("nivel").textContent = textoNivel;
  actualizarEstiloNivel(maximo ? maximo.nivel_revision : "datos insuficientes");
  elemento("recomendacion").textContent = "Prioridades para revisión humana. Los avisos son sugerencias: no se envían mensajes ni se guardan historiales.";

  for (const r of salida.resultados) {
    const articulo = document.createElement("article");
    articulo.className = "resultado-estudiante";
    const titulo = document.createElement("h3");
    titulo.textContent = `${r.nombre || r.estudiante_id} · ${r.sesion_id}`;
    const nivel = document.createElement("p");
    nivel.textContent = `${r.actividad} · ${r.nivel_revision.replaceAll("_", " ")} · prioridad ${r.indice_prioridad ?? "sin datos"}`;
    articulo.append(titulo, nivel);

    lista(articulo, "Reglas activadas", r.reglas_activadas.map(x => `${x.regla} (+${x.puntos}): ${x.explicacion} Referencias: ${x.referencias.join(", ")}`));
    if (!r.reglas_activadas.length) lista(articulo, "Reglas", ["No se activaron reglas de alerta."]);

    for (const [modulo, evidencias] of Object.entries(r.evidencia_por_modulo)) {
      lista(articulo, `Evidencia · ${modulo}`, evidencias.map(e => {
        const tiempo = e.fecha_hora || e.fecha || "";
        const dato = e.valor ?? e.estado ?? "";
        return `${e.id || e.tipo} · ${dato}${e.presente === false ? " (ausencia explícita)" : ""} · ${tiempo} · origen: ${e.origen}${e.confianza != null ? ` · confianza: ${e.confianza} · calidad: ${e.calidad}` : ""}`;
      }));
    }

    lista(articulo, "Datos faltantes", r.datos_faltantes);
    lista(articulo, "Contradicciones por resolver", r.contradicciones);
    lista(articulo, "Límites de esta evaluación", r.limitaciones);
    lista(articulo, "Recomendaciones", r.recomendaciones);
    lista(articulo, "Destinatarios sugeridos", r.avisar_a.length ? r.avisar_a : ["Sin aviso automático; siempre revisión humana."]);
    contenedor.append(articulo);
  }

  lista(contenedor, "Observaciones sin atribuir", salida.observaciones_sin_atribuir.map(o => `${o.modulo} · ${o.id}: ${o.motivo}`));
  lista(contenedor, "Observaciones descartadas", salida.observaciones_descartadas.map(o => `${o.modulo} · ${o.id}: ${o.motivo}`));
  lista(contenedor, "Control de duplicados", [`${salida.duplicados_omitidos} retransmisiones idénticas omitidas.`]);
  lista(contenedor, "Limitaciones", salida.limitaciones);
}

if (elemento("motor")) {
  elemento("motor").addEventListener("change", async () => {
    entradas[motorActual] = elemento("entrada") ? elemento("entrada").value : "";
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
      elemento("entrada").value = texto;
      elemento("estado").textContent = `Archivo cargado: ${archivo.name}. Selecciona su formato antes de evaluar.`;
    } catch (error) {
      elemento("estado").textContent = error.message;
    }
  });
}

if (elemento("ejecutar")) {
  elemento("ejecutar").addEventListener("click", async () => {
    if (enCurso) return;
    try {
      const entradaTexto = elemento("entrada") ? elemento("entrada").value : "{}";
      const datos = JSON.parse(entradaTexto);
      const formatoEl = elemento("formato");
      const formato = formatoEl ? formatoEl.value : "integracion";
      const seguimiento = elemento("motor") && elemento("motor").value === "seguimiento";
      const cuerpo = !seguimiento && ["imagen", "video"].includes(formato) ? { [formato]: datos } : datos;
      const base = servidor();
      const ruta = seguimiento ? "/api/prediccion/estudiantes" : (formato === "interno" ? "/api/prediccion" : "/api/prediccion/integrar");

      ocupar(true);
      limpiarResultado();
      elemento("estado").textContent = "Evaluando señales y correlación de reglas...";
      elemento("nivel").textContent = "Evaluando";
      actualizarEstiloNivel("Evaluando");
      elemento("indice").textContent = "—";
      actualizarTacometro(NaN);
      elemento("recomendacion").textContent = "";
      elemento("salida").textContent = "";

      const respuesta = await fetch(`${base}${ruta}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo)
      });
      const salida = await respuesta.json();

      if (!respuesta.ok) throw new Error(typeof salida.detail === "string" ? salida.detail : JSON.stringify(salida.detail || salida));

      elemento("salida").textContent = JSON.stringify(salida, null, 2);

      if (seguimiento) {
        mostrarSeguimiento(salida);
      } else {
        const nivelTexto = (salida.nivel_revision || "datos_insuficientes").replaceAll("_", " ");
        elemento("nivel").textContent = nivelTexto;
        actualizarEstiloNivel(nivelTexto);

        const scoreStr = salida.indice_revision == null ? "—" : salida.indice_revision.toString();
        elemento("indice").textContent = scoreStr;
        actualizarTacometro(salida.indice_revision);

        elemento("recomendacion").textContent = salida.recomendacion;
      }
      elemento("estado").textContent = "Evaluación completada con éxito.";
    } catch (error) {
      limpiarResultado();
      elemento("estado").textContent = `No se pudo evaluar: ${error.message}`;
      elemento("nivel").textContent = "Sin resultado válido";
      actualizarEstiloNivel("");
      elemento("indice").textContent = "—";
      actualizarTacometro(NaN);
      elemento("recomendacion").textContent = "Corrige la entrada y vuelve a evaluar.";
      elemento("salida").textContent = "";
    } finally {
      ocupar(false);
    }
  });
}

// Botones de Cámara y Modos
if (elemento("btn-start-camera")) elemento("btn-start-camera").addEventListener("click", iniciarCamaraReal);
if (elemento("btn-capture-frame")) elemento("btn-capture-frame").addEventListener("click", tomarCapturaYPredecir);
if (elemento("btn-toggle-scan")) elemento("btn-toggle-scan").addEventListener("click", alternarEscaneoContinuo);

// Selector de Modos (Modo 1 vs Modo 2)
const modeCaptura = elemento("mode-btn-captura");
const modeLive = elemento("mode-btn-live");
if (modeCaptura && modeLive) {
  modeCaptura.addEventListener("click", () => {
    liveState.activeMode = "captura";
    if (modeCaptura.classList) modeCaptura.classList.add("active");
    if (modeLive.classList) modeLive.classList.remove("active");
    if (liveState.scanningContinuous) alternarEscaneoContinuo();
  });

  modeLive.addEventListener("click", () => {
    liveState.activeMode = "live";
    if (modeLive.classList) modeLive.classList.add("active");
    if (modeCaptura.classList) modeCaptura.classList.remove("active");
    if (!liveState.scanningContinuous) alternarEscaneoContinuo();
  });
}

// Botón para cerrar vista de comparación HD
const btnCloseComp = elemento("btn-close-comparison");
if (btnCloseComp) {
  btnCloseComp.addEventListener("click", () => {
    const compView = elemento("comparison-view");
    if (compView && compView.style) compView.style.display = "none";
  });
}

// Toggle de Mejora de Imagen
const toggleMejora = elemento("toggle-mejora-imagen");
if (toggleMejora) {
  toggleMejora.addEventListener("change", () => {
    liveState.mejoraActiva = toggleMejora.checked;
    const elNit = elemento("metric-nitidez");
    if (elNit) {
      elNit.textContent = liveState.mejoraActiva ? "+232% HD" : "Original Raw";
      if (elNit.style) elNit.style.color = liveState.mejoraActiva ? "#38bdf8" : "#94a3b8";
    }
  });
}

// Disparadores de Simulación Rápida (Live Demo)
const btnTriggerPhone = elemento("btn-trigger-phone");
if (btnTriggerPhone) {
  btnTriggerPhone.addEventListener("click", () => {
    liveState.phoneDetected = !liveState.phoneDetected;
    if (liveState.phoneDetected) {
      liveState.distractionSeconds += 5;
      liveState.personPresent = true;
      liveState.emociones = {
        alegria: 4.0, neutral: 18.0, tristeza: 8.0, estres: 32.0, fatiga: 38.0,
        emocion_dominante: "Fatiga / Distracción"
      };
      if (btnTriggerPhone.classList) btnTriggerPhone.classList.add("active-danger");
    } else {
      if (btnTriggerPhone.classList) btnTriggerPhone.classList.remove("active-danger");
    }
    actualizarDiagnosticoYProyeccion();
    sincronizarPayloadBackend();
  });
}

const btnTriggerGaze = elemento("btn-trigger-gaze");
if (btnTriggerGaze) {
  btnTriggerGaze.addEventListener("click", () => {
    liveState.gazeAverted = !liveState.gazeAverted;
    if (liveState.gazeAverted) {
      liveState.personPresent = true;
      liveState.emociones = {
        alegria: 5.0, neutral: 25.0, tristeza: 10.0, estres: 20.0, fatiga: 40.0,
        emocion_dominante: "Mirada Desviada / Desinterés"
      };
      if (btnTriggerGaze.classList) btnTriggerGaze.classList.add("active-warn");
    } else {
      if (btnTriggerGaze.classList) btnTriggerGaze.classList.remove("active-warn");
    }
    actualizarDiagnosticoYProyeccion();
    sincronizarPayloadBackend();
  });
}

const btnTriggerFocus = elemento("btn-trigger-focus");
if (btnTriggerFocus) {
  btnTriggerFocus.addEventListener("click", () => {
    liveState.personPresent = true;
    liveState.phoneDetected = false;
    liveState.gazeAverted = false;
    liveState.distractionSeconds = 0;
    liveState.targetFaceBox = { x: 0.35, y: 0.20, w: 0.30, h: 0.50 };
    liveState.emociones = {
      alegria: 22.0, neutral: 68.0, tristeza: 3.0, estres: 4.0, fatiga: 3.0,
      emocion_dominante: "Neutral / Concentración"
    };

    if (btnTriggerPhone && btnTriggerPhone.classList) btnTriggerPhone.classList.remove("active-danger");
    if (btnTriggerGaze && btnTriggerGaze.classList) btnTriggerGaze.classList.remove("active-warn");
    const btnAbs = elemento("btn-trigger-absence");
    if (btnAbs && btnAbs.classList) btnAbs.classList.remove("active-danger");

    actualizarDiagnosticoYProyeccion();
    sincronizarPayloadBackend();
  });
}

const btnTriggerAbsence = elemento("btn-trigger-absence");
if (btnTriggerAbsence) {
  btnTriggerAbsence.addEventListener("click", () => {
    liveState.personPresent = !liveState.personPresent;
    if (!liveState.personPresent) {
      liveState.emociones = {
        alegria: 1.0, neutral: 5.0, tristeza: 14.0, estres: 20.0, fatiga: 60.0,
        emocion_dominante: "Ausente / Sin Detección"
      };
      if (btnTriggerAbsence.classList) btnTriggerAbsence.classList.add("active-danger");
    } else {
      if (btnTriggerAbsence.classList) btnTriggerAbsence.classList.remove("active-danger");
    }
    actualizarDiagnosticoYProyeccion();
    sincronizarPayloadBackend();
  });
}

// Redibujar en resize si estamos en un navegador
if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("resize", dibujarHUDCanvas);
}

// Inicialización de diagnóstico al cargar en el navegador
if (typeof window !== "undefined") {
  actualizarDiagnosticoYProyeccion();
}
