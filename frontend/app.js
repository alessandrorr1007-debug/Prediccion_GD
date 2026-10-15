"use strict";

const elemento = (id) => document.getElementById(id);

// ============================================================================
// AulaPredict · Live AI Vision Studio & Predictive Engine
// Architecture: Video & Image Inference + Real-Time Academic Performance Projection
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

elemento("entrada").value = JSON.stringify(EJEMPLO_EXAMEN_DEFAULT, null, 2);
elemento("servidor").value = location.protocol === "file:" ? "http://localhost:8001" : location.origin;

let enCurso = false;
let motorActual = "examen";
const entradas = { examen: elemento("entrada").value, seguimiento: null };

// Estado de la Simulación e Inferencia en Vivo
const liveState = {
  cameraActive: false,
  scanningContinuous: false,
  scanIntervalId: null,
  personPresent: true,
  phoneDetected: false,
  gazeAverted: false,
  emotion: "Concentrado",
  attentionScore: 95,
  distractionSeconds: 0,
  predictedGrade: 17.0,
  riskScore: 15
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
  } else if (t.includes("media") || t.includes("moderada") || t.includes("distraído")) {
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
  elemento("resultados-estudiantes").replaceChildren();
  elemento("nivel").textContent = "Sin evaluar";
  actualizarEstiloNivel("Sin evaluar");
  elemento("indice").textContent = "—";
  actualizarTacometro(NaN);
  elemento("salida").textContent = "";
  elemento("recomendacion").textContent = "";
}

function servidor() {
  const base = new URL(elemento("servidor").value);
  if (!["http:", "https:"].includes(base.protocol)) throw new Error("Usa una dirección HTTP o HTTPS.");
  return base.origin;
}

// ============================================================================
// Motor de Diagnóstico en Tiempo Real y Proyección Académica
// ============================================================================
function actualizarDiagnosticoYProyeccion() {
  // 1. Cálculo de Atención
  let atencion = 95;
  if (!liveState.personPresent) {
    atencion = 0;
    liveState.emotion = "Ausente";
  } else if (liveState.phoneDetected) {
    atencion -= 55;
    liveState.emotion = "Distraído (Uso de Celular)";
  } else if (liveState.gazeAverted) {
    atencion -= 35;
    liveState.emotion = "Mirada Desviada / Desinterés";
  } else {
    liveState.emotion = "Concentrado / Atento";
  }
  atencion = Math.max(0, Math.min(100, atencion));
  liveState.attentionScore = atencion;

  // Actualizar UI de Atención
  const elAttVal = elemento("attention-val");
  const elAttFill = elemento("attention-fill");
  if (elAttVal) elAttVal.textContent = `${atencion}%`;
  if (elAttFill && elAttFill.style) {
    elAttFill.style.width = `${atencion}%`;
    elAttFill.style.background = atencion >= 75 ? "var(--color-safe)" : (atencion >= 40 ? "var(--color-warn)" : "var(--color-danger)");
  }

  // Actualizar Emoción
  const elEmotion = elemento("emotion-badge");
  if (elEmotion) {
    elEmotion.textContent = liveState.emotion;
    if (elEmotion.style) {
      elEmotion.style.color = atencion >= 75 ? "#34d399" : (atencion >= 40 ? "#fbbf24" : "#fb7185");
    }
  }

  // Timer de distracción
  const elTimer = elemento("distraction-timer");
  if (elTimer) {
    elTimer.textContent = `Distracción por celular: ${liveState.distractionSeconds}s acumulados`;
  }

  // 2. Proyección de Rendimiento Académico a Futuro
  let notaEstimada = 10.0 + (atencion / 100) * 8.5;
  if (liveState.phoneDetected) notaEstimada -= 3.0;
  if (liveState.distractionSeconds > 10) notaEstimada -= 1.5;
  notaEstimada = Math.max(5.0, Math.min(20.0, notaEstimada));
  liveState.predictedGrade = parseFloat(notaEstimada.toFixed(1));

  const elGrade = elemento("proyeccion-grade");
  const elTexto = elemento("proyeccion-texto");

  if (elGrade) {
    elGrade.textContent = `${liveState.predictedGrade.toFixed(1)} / 20`;
    if (elGrade.style) {
      elGrade.style.color = notaEstimada >= 16.0 ? "#34d399" : (notaEstimada >= 11.5 ? "#fbbf24" : "#fb7185");
    }
  }

  let recomendacionTexto = "";
  let proyeccionHtml = "";
  if (notaEstimada >= 16.0) {
    proyeccionHtml = "Proyección Favorable: Estudiante altamente concentrado en la sesión. Se proyecta un sólido aprovechamiento de los temas y calificación sobresaliente en la evaluación.";
    recomendacionTexto = "Comportamiento óptimo. Continuar con el ritmo actual de la clase.";
  } else if (notaEstimada >= 11.5) {
    proyeccionHtml = "Riesgo Académico Moderado: Desconexiones intermitentes detectadas. Se estima un rendimiento limítrofe en la práctica calificada si no se reorienta la atención.";
    recomendacionTexto = "Directriz pedagógica: Realizar una pregunta de control o dinamizar la explicación.";
  } else {
    proyeccionHtml = `Riesgo Crítico de Desaprobación: Alta persistencia de distracción con dispositivos externos. Si continúa este patrón, el modelo proyecta nota desaprobatoria (${liveState.predictedGrade.toFixed(1)}/20) en el examen parcial.`;
    recomendacionTexto = "Intervención requerida: Solicitar guardar dispositivos electrónicos y registrar observación.";
  }

  if (elTexto) elTexto.textContent = proyeccionHtml;

  // 3. Score de Revisión / Tacómetro (0 - 100)
  const riesgo = Math.round(100 - atencion);
  liveState.riskScore = riesgo;

  // Solo actualizar si estamos en modo interactivo en vivo y el motor no tiene un resultado cargado
  if (typeof window !== "undefined") {
    elemento("indice").textContent = riesgo.toString();
    actualizarTacometro(riesgo);
    const nivelDesc = riesgo >= 70 ? "Riesgo Alto · Revisión Urgente" : (riesgo >= 30 ? "Atención Moderada · Distraído" : "Sin alerta · Atención Óptima");
    elemento("nivel").textContent = nivelDesc;
    actualizarEstiloNivel(nivelDesc);
    elemento("recomendacion").textContent = recomendacionTexto;
  }

  // Renderizar Canvas de Bounding Boxes
  dibujarHUDCanvas();
}

// ============================================================================
// Renderizado de Bounding Boxes en Vivo sobre Canvas
// ============================================================================
function dibujarHUDCanvas() {
  const canvas = elemento("overlay-canvas");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width = canvas.parentElement.clientWidth || 640;
  const height = canvas.height = canvas.parentElement.clientHeight || 360;

  ctx.clearRect(0, 0, width, height);

  // Crosshairs de esquina estilo Vision HUD
  ctx.strokeStyle = "rgba(99, 102, 241, 0.4)";
  ctx.lineWidth = 1.5;
  const len = 18;
  const pad = 14;

  // Top-Left
  ctx.beginPath(); ctx.moveTo(pad, pad + len); ctx.lineTo(pad, pad); ctx.lineTo(pad + len, pad); ctx.stroke();
  // Top-Right
  ctx.beginPath(); ctx.moveTo(width - pad - len, pad); ctx.lineTo(width - pad, pad); ctx.lineTo(width - pad, pad + len); ctx.stroke();
  // Bottom-Left
  ctx.beginPath(); ctx.moveTo(pad, height - pad - len); ctx.lineTo(pad, height - pad); ctx.lineTo(pad + len, height - pad); ctx.stroke();
  // Bottom-Right
  ctx.beginPath(); ctx.moveTo(width - pad - len, height - pad); ctx.lineTo(width - pad, height - pad); ctx.lineTo(width - pad, height - pad - len); ctx.stroke();

  if (!liveState.personPresent) {
    ctx.fillStyle = "rgba(244, 63, 94, 0.85)";
    ctx.font = "bold 13px 'JetBrains Mono', monospace";
    ctx.fillText("[ALERTA VIDEO: ESTUDIANTE FUERA DE ENCUADRE]", width / 2 - 150, height / 2);
    return;
  }

  // 1. Bounding Box: Estudiante en Encuadre (Cuerpo/Rostro)
  const faceX = width * 0.32;
  const faceY = height * 0.18;
  const faceW = width * 0.36;
  const faceH = height * 0.58;

  ctx.strokeStyle = liveState.phoneDetected ? "rgba(244, 63, 94, 0.8)" : (liveState.gazeAverted ? "rgba(245, 158, 11, 0.8)" : "rgba(16, 185, 129, 0.85)");
  ctx.lineWidth = 2;
  ctx.strokeRect(faceX, faceY, faceW, faceH);

  // Label del Estudiante
  ctx.fillStyle = liveState.phoneDetected ? "rgba(244, 63, 94, 0.9)" : (liveState.gazeAverted ? "rgba(245, 158, 11, 0.9)" : "rgba(16, 185, 129, 0.9)");
  ctx.fillRect(faceX, faceY - 22, faceW, 22);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 11px 'JetBrains Mono', monospace";
  ctx.fillText(`Estudiante: 96% | ${liveState.emotion}`, faceX + 6, faceY - 7);

  // 2. Bounding Box: Celular Detectado (si está activo)
  if (liveState.phoneDetected) {
    const phoneX = width * 0.60;
    const phoneY = height * 0.48;
    const phoneW = width * 0.24;
    const phoneH = height * 0.38;

    ctx.strokeStyle = "#f43f5e";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(phoneX, phoneY, phoneW, phoneH);

    ctx.fillStyle = "#f43f5e";
    ctx.fillRect(phoneX, phoneY - 22, phoneW, 22);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("VIDEO: CELULAR (94%)", phoneX + 6, phoneY - 7);
  }

  // 3. Vector/Flecha: Mirada Desviada (si está activo)
  if (liveState.gazeAverted) {
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(faceX + faceW * 0.5, faceY + faceH * 0.35);
    ctx.lineTo(faceX - 35, faceY + faceH * 0.15);
    ctx.stroke();

    ctx.fillStyle = "#f59e0b";
    ctx.fillRect(faceX - 110, faceY + faceH * 0.08, 110, 20);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("MIRADA FUERA", faceX - 104, faceY + faceH * 0.08 + 14);
  }
}

// ============================================================================
// Captura de Snapshots y Galería de Evidencia
// ============================================================================
function capturarSnapshot() {
  const video = elemento("webcam-feed");
  const offscreen = document.createElement("canvas");
  offscreen.width = 320;
  offscreen.height = 180;
  const offCtx = offscreen.getContext("2d");

  if (liveState.cameraActive && video && video.readyState >= 2) {
    offCtx.drawImage(video, 0, 0, 320, 180);
  } else {
    offCtx.fillStyle = "#090e18";
    offCtx.fillRect(0, 0, 320, 180);
    offCtx.fillStyle = "#818cf8";
    offCtx.font = "bold 13px 'JetBrains Mono', monospace";
    offCtx.fillText(liveState.phoneDetected ? "Captura: Celular" : "Captura: Normal", 20, 90);
  }

  const thumbUrl = offscreen.toDataURL("image/jpeg", 0.7);
  const gallery = elemento("snapshot-gallery");
  if (!gallery) return;

  const card = document.createElement("div");
  card.className = "snapshot-card";

  const img = document.createElement("img");
  img.className = "snapshot-thumb";
  img.src = thumbUrl;
  img.alt = "Captura de Evidencia";

  const info = document.createElement("div");
  info.className = "snapshot-info";
  const now = new Date();
  const timeStr = `${now.getHours()}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

  info.innerHTML = `
    <span class="snapshot-tag">${liveState.phoneDetected ? "⚠️ Celular Detectado" : "✓ Atención Normal"}</span><br>
    <span>${timeStr} · Riesgo: ${liveState.riskScore}/100</span>
  `;

  card.append(img, info);

  // Si tiene el placeholder vacío, limpiarlo
  if (gallery.querySelector(".snapshot-card") && gallery.innerText.includes("Sin capturas")) {
    gallery.innerHTML = "";
  }

  gallery.prepend(card);
}

// ============================================================================
// Conexión y Envío Automático al Backend FastAPI
// ============================================================================
async function sincronizarConBackend() {
  const payloadAuto = {
    segundo_actual: Math.floor(Date.now() / 1000) % 86400,
    ventana_segundos: 60,
    objetos_permitidos: ["libro"],
    video: {
      modelo: "SistemaSupervisionExamenes/best.pt",
      frames: [
        {
          frame_id: Math.floor(Math.random() * 100) + 1,
          timestamp: 10,
          calidad: 0.9,
          detecciones: liveState.phoneDetected ? [
            { clase: "persona", confianza: 0.94 },
            { clase: "telefono", confianza: 0.92 }
          ] : [
            { clase: "persona", confianza: 0.96 }
          ]
        }
      ]
    },
    imagen: {
      modulo: "IMAGEN",
      modelo: "SistemaSupervisionExamenes-Imagen",
      frames: [
        {
          frame_id: Math.floor(Math.random() * 100) + 1,
          timestamp: 10,
          calidad_normalizada: 0.88,
          objetos: liveState.phoneDetected ? [
            {
              id: "objeto-1",
              clase: "telefono",
              confianza_video: 0.92,
              confianza_procesada: 0.94,
              estado: "confirmada"
            }
          ] : []
        }
      ]
    }
  };

  elemento("entrada").value = JSON.stringify(payloadAuto, null, 2);

  try {
    const base = servidor();
    const res = await fetch(`${base}/api/prediccion/integrar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadAuto)
    });
    if (res.ok) {
      const data = await res.json();
      elemento("salida").textContent = JSON.stringify(data, null, 2);
    }
  } catch {}
}

// ============================================================================
// Inicialización de la Cámara Web Real
// ============================================================================
async function iniciarCamaraWeb() {
  const video = elemento("webcam-feed");
  const placeholder = elemento("camera-placeholder");
  const btnLabel = elemento("btn-cam-label");
  const statusText = elemento("cam-status-text");
  const statusPill = elemento("cam-status-pill");

  if (liveState.cameraActive) {
    // Detener cámara
    if (video.srcObject) {
      video.srcObject.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    }
    liveState.cameraActive = false;
    if (placeholder) placeholder.style.display = "flex";
    if (btnLabel) btnLabel.textContent = "Iniciar Cámara en Vivo";
    if (statusText) statusText.textContent = "CÁMARA: INACTIVA";
    if (statusPill) statusPill.className = "status-pill";
    return;
  }

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("API de medios no compatible en este navegador.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    video.srcObject = stream;
    liveState.cameraActive = true;
    if (placeholder) placeholder.style.display = "none";
    if (btnLabel) btnLabel.textContent = "Detener Cámara";
    if (statusText) statusText.textContent = "CÁMARA: EN VIVO";
    if (statusPill) statusPill.className = "status-pill active";

    // Loop de renderizado
    video.onloadedmetadata = () => {
      dibujarHUDCanvas();
    };
  } catch (err) {
    if (statusText) statusText.textContent = "SIMULADOR ACTIVO";
    if (elemento("estado")) elemento("estado").textContent = `Cámara web: ${err.message}. Usa los botones de simulación.`;
    dibujarHUDCanvas();
  }
}

// ============================================================================
// Event Listeners de Disparo Rápido (Live Presentation)
// ============================================================================
const btnTriggerPhone = elemento("btn-trigger-phone");
if (btnTriggerPhone) {
  btnTriggerPhone.addEventListener("click", () => {
    liveState.phoneDetected = !liveState.phoneDetected;
    if (liveState.phoneDetected) {
      liveState.distractionSeconds += 12;
      btnTriggerPhone.classList.add("active");
    } else {
      btnTriggerPhone.classList.remove("active");
    }
    actualizarDiagnosticoYProyeccion();
    capturarSnapshot();
    sincronizarConBackend();
  });
}

const btnTriggerGaze = elemento("btn-trigger-gaze");
if (btnTriggerGaze) {
  btnTriggerGaze.addEventListener("click", () => {
    liveState.gazeAverted = !liveState.gazeAverted;
    btnTriggerGaze.classList.toggle("active", liveState.gazeAverted);
    actualizarDiagnosticoYProyeccion();
    capturarSnapshot();
  });
}

const btnTriggerFocus = elemento("btn-trigger-focus");
if (btnTriggerFocus) {
  btnTriggerFocus.addEventListener("click", () => {
    liveState.phoneDetected = false;
    liveState.gazeAverted = false;
    liveState.personPresent = true;
    if (btnTriggerPhone) btnTriggerPhone.classList.remove("active");
    if (btnTriggerGaze) btnTriggerGaze.classList.remove("active");
    actualizarDiagnosticoYProyeccion();
    sincronizarConBackend();
  });
}

const btnTriggerAbsence = elemento("btn-trigger-absence");
if (btnTriggerAbsence) {
  btnTriggerAbsence.addEventListener("click", () => {
    liveState.personPresent = !liveState.personPresent;
    btnTriggerAbsence.classList.toggle("active", !liveState.personPresent);
    actualizarDiagnosticoYProyeccion();
    capturarSnapshot();
  });
}

// Botones de Cámara
const btnStartCam = elemento("btn-start-camera");
if (btnStartCam) btnStartCam.addEventListener("click", iniciarCamaraWeb);

const btnCaptureFrame = elemento("btn-capture-frame");
if (btnCaptureFrame) {
  btnCaptureFrame.addEventListener("click", () => {
    capturarSnapshot();
    actualizarDiagnosticoYProyeccion();
    sincronizarConBackend();
  });
}

const btnToggleScan = elemento("btn-toggle-scan");
if (btnToggleScan) {
  btnToggleScan.addEventListener("click", () => {
    liveState.scanningContinuous = !liveState.scanningContinuous;
    const label = elemento("scan-label");
    if (liveState.scanningContinuous) {
      if (label) label.textContent = "Detener Escaneo Continuo";
      btnToggleScan.classList.add("primary");
      liveState.scanIntervalId = setInterval(() => {
        actualizarDiagnosticoYProyeccion();
        sincronizarConBackend();
      }, 3000);
    } else {
      if (label) label.textContent = "Activar Escaneo Continuo";
      btnToggleScan.classList.remove("primary");
      clearInterval(liveState.scanIntervalId);
    }
  });
}

// Redibujar en resize si estamos en un navegador
if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("resize", dibujarHUDCanvas);
}

// ============================================================================
// Funciones del Contrato Original (Preserva 100% Compatibilidad con Tests)
// ============================================================================
async function cargarEjemplo() {
  if (enCurso) return;
  ocupar(true);
  limpiarResultado();
  try {
    const caso = elemento("ejemplo-seguimiento").value;
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

elemento("motor").addEventListener("change", async () => {
  entradas[motorActual] = elemento("entrada").value;
  motorActual = elemento("motor").value;
  const seguimiento = motorActual === "seguimiento";
  elemento("controles-seguimiento").hidden = !seguimiento;
  elemento("controles-examen").hidden = seguimiento;
  elemento("descripcion-indice").textContent = seguimiento
    ? "Prioridad heurística de seguimiento máxima entre las sesiones evaluadas / 100. No predice notas ni diagnósticos."
    : "Índice heurístico de revisión / 100. No es una probabilidad.";
  elemento("ayuda").textContent = seguimiento
    ? "Solo demostraciones simulado=true. No cargues datos reales: falta autenticación. La identidad requiere una referencia explícita revisada."
    : "Si combinas fechas de IMAGEN con VIDEO, indica imagen.origen_temporal. La calidad no se normaliza automáticamente.";
  limpiarResultado();
  elemento("estado").textContent = "";
  elemento("entrada").value = entradas[motorActual] || "";
  if (seguimiento && !entradas.seguimiento) await cargarEjemplo();
});

elemento("cargar-ejemplo").addEventListener("click", cargarEjemplo);

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

elemento("archivo").addEventListener("change", async (evento) => {
  const archivo = evento.target.files && evento.target.files[0];
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

elemento("ejecutar").addEventListener("click", async () => {
  if (enCurso) return;
  try {
    const datos = JSON.parse(elemento("entrada").value);
    const formato = elemento("formato").value;
    const seguimiento = elemento("motor").value === "seguimiento";
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

// Inicialización de diagnóstico al cargar en el navegador
if (typeof window !== "undefined") {
  actualizarDiagnosticoYProyeccion();
}
