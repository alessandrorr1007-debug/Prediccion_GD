import React, { useState, useEffect, useRef } from "react";

// ============================================================================
// AulaPredict Live AI Studio · Real-Time Vision & Academic Projection
// Framework: React + Tailwind CSS
// ============================================================================

export interface SnapshotItem {
  id: string;
  url: string;
  timestamp: string;
  label: string;
  score: number;
}

export const AulaPredictDashboard: React.FC = () => {
  // Referencias para la Cámara Web y Canvas
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Estados de Cámara e Inferencia
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [continuousScan, setContinuousScan] = useState<boolean>(false);

  // Estados de Simulación en Vivo (Disparadores de Exposición)
  const [phoneDetected, setPhoneDetected] = useState<boolean>(false);
  const [gazeAverted, setGazeAverted] = useState<boolean>(false);
  const [personPresent, setPersonPresent] = useState<boolean>(true);
  const [distractionSecs, setDistractionSecs] = useState<number>(0);

  // Diagnóstico de Comportamiento en Vivo
  const [attentionScore, setAttentionScore] = useState<number>(95);
  const [emotion, setEmotion] = useState<string>("Concentrado / Atento");
  const [predictedGrade, setPredictedGrade] = useState<number>(17.0);
  const [riskScore, setRiskScore] = useState<number>(15);

  // Galería de Snapshots
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);

  // Servidor y Drawer Técnico
  const [servidor] = useState<string>("http://localhost:8001");
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [rawOutput, setRawOutput] = useState<string>("");

  // Iniciar / Detener Cámara Web Real
  const toggleCamera = async () => {
    if (cameraActive) {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
      setCameraActive(false);
    } else {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          alert("Navegador no soporta acceso directo a cámara web.");
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraActive(true);
      } catch (err: any) {
        alert(`No se pudo acceder a la cámara: ${err.message}. Puedes usar los disparadores interactivos.`);
      }
    }
  };

  // Dibujar Bounding Boxes en el Canvas
  const drawHUD = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = (canvas.width = canvas.parentElement?.clientWidth || 640);
    const height = (canvas.height = canvas.parentElement?.clientHeight || 360);

    ctx.clearRect(0, 0, width, height);

    // Crosshairs en esquinas
    ctx.strokeStyle = "rgba(99, 102, 241, 0.4)";
    ctx.lineWidth = 1.5;
    const len = 16;
    const pad = 12;

    ctx.beginPath(); ctx.moveTo(pad, pad + len); ctx.lineTo(pad, pad); ctx.lineTo(pad + len, pad); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(width - pad - len, pad); ctx.lineTo(width - pad, pad); ctx.lineTo(width - pad, pad + len); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad, height - pad - len); ctx.lineTo(pad, height - pad); ctx.lineTo(pad + len, height - pad); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(width - pad - len, height - pad); ctx.lineTo(width - pad, height - pad); ctx.lineTo(width - pad, height - pad - len); ctx.stroke();

    if (!personPresent) {
      ctx.fillStyle = "rgba(244, 63, 94, 0.85)";
      ctx.font = "bold 13px monospace";
      ctx.fillText("[ALERTA VIDEO: ESTUDIANTE FUERA DE ENCUADRE]", width / 2 - 140, height / 2);
      return;
    }

    // Estudiante / Rostro
    const fx = width * 0.32;
    const fy = height * 0.18;
    const fw = width * 0.36;
    const fh = height * 0.58;

    ctx.strokeStyle = phoneDetected ? "#f43f5e" : gazeAverted ? "#f59e0b" : "#10b981";
    ctx.lineWidth = 2;
    ctx.strokeRect(fx, fy, fw, fh);

    ctx.fillStyle = phoneDetected ? "#f43f5e" : gazeAverted ? "#f59e0b" : "#10b981";
    ctx.fillRect(fx, fy - 20, fw, 20);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 11px monospace";
    ctx.fillText(`Estudiante: 96% | ${emotion}`, fx + 6, fy - 5);

    // Celular
    if (phoneDetected) {
      const px = width * 0.62;
      const py = height * 0.48;
      const pw = width * 0.22;
      const ph = height * 0.38;

      ctx.strokeStyle = "#f43f5e";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(px, py, pw, ph);

      ctx.fillStyle = "#f43f5e";
      ctx.fillRect(px, py - 20, pw, 20);
      ctx.fillStyle = "#ffffff";
      ctx.fillText("VIDEO: CELULAR (94%)", px + 4, py - 5);
    }
  };

  // Recalcular Diagnóstico y Proyecciones
  useEffect(() => {
    let atencion = 95;
    let emo = "Concentrado / Atento";

    if (!personPresent) {
      atencion = 0;
      emo = "Ausente";
    } else if (phoneDetected) {
      atencion -= 55;
      emo = "Distraído (Uso de Celular)";
    } else if (gazeAverted) {
      atencion -= 35;
      emo = "Mirada Desviada / Desinterés";
    }

    atencion = Math.max(0, Math.min(100, atencion));
    setAttentionScore(atencion);
    setEmotion(emo);

    const riesgo = Math.round(100 - atencion);
    setRiskScore(riesgo);

    let nota = 10.0 + (atencion / 100) * 8.5;
    if (phoneDetected) nota -= 3.0;
    if (distractionSecs > 10) nota -= 1.5;
    nota = Math.max(5.0, Math.min(20.0, nota));
    setPredictedGrade(parseFloat(nota.toFixed(1)));

    drawHUD();
  }, [phoneDetected, gazeAverted, personPresent, distractionSecs]);

  // Capturar Snapshot
  const captureSnapshot = () => {
    const video = videoRef.current;
    const offscreen = document.createElement("canvas");
    offscreen.width = 320;
    offscreen.height = 180;
    const ctx = offscreen.getContext("2d");

    if (cameraActive && video && video.readyState >= 2 && ctx) {
      ctx.drawImage(video, 0, 0, 320, 180);
    } else if (ctx) {
      ctx.fillStyle = "#070a12";
      ctx.fillRect(0, 0, 320, 180);
      ctx.fillStyle = "#818cf8";
      ctx.font = "bold 13px monospace";
      ctx.fillText(phoneDetected ? "Captura: Celular" : "Captura: Normal", 20, 90);
    }

    const now = new Date();
    const snap: SnapshotItem = {
      id: Math.random().toString(),
      url: offscreen.toDataURL("image/jpeg", 0.7),
      timestamp: `${now.getHours()}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`,
      label: phoneDetected ? "⚠️ Celular Detectado" : "✓ Atención Normal",
      score: riskScore
    };

    setSnapshots((prev) => [snap, ...prev.slice(0, 5)]);

    // Sincronizar automáticamente con backend
    syncBackend();
  };

  const syncBackend = async () => {
    try {
      const payload = {
        segundo_actual: 12,
        ventana_segundos: 60,
        objetos_permitidos: ["libro"],
        video: {
          frames: [
            {
              frame_id: 80,
              timestamp: 10,
              calidad: 0.9,
              detecciones: phoneDetected
                ? [{ clase: "persona", confianza: 0.94 }, { clase: "telefono", confianza: 0.92 }]
                : [{ clase: "persona", confianza: 0.96 }]
            }
          ]
        },
        imagen: {
          frames: [
            {
              frame_id: 80,
              timestamp: 10,
              calidad_normalizada: 0.88,
              objetos: phoneDetected
                ? [{ id: "obj-1", clase: "telefono", confianza_procesada: 0.94, estado: "confirmada" }]
                : []
            }
          ]
        }
      };

      const res = await fetch(`${servidor}/api/prediccion/integrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        setRawOutput(JSON.stringify(data, null, 2));
      }
    } catch {}
  };

  const CIRC = 314.16;
  const strokeOffset = CIRC - (riskScore / 100) * CIRC;
  const strokeColor = riskScore >= 70 ? "#f43f5e" : riskScore >= 30 ? "#f59e0b" : "#10b981";

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 font-sans antialiased selection:bg-indigo-500 selection:text-white">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-2.5 bg-[#030712]/90 backdrop-blur-xl border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded bg-gradient-to-br from-indigo-950 to-indigo-800 border border-indigo-500/40 shadow-lg shadow-indigo-500/20">
            <svg className="w-4 h-4 text-indigo-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
            </svg>
          </div>
          <span className="text-base font-bold text-white tracking-tight">AulaPredict Live Studio</span>
          <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 rounded">
            Vision AI · Real-Time
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border ${cameraActive ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-slate-900 border-white/[0.08] text-slate-400"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cameraActive ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`}></span>
            <span>{cameraActive ? "CÁMARA: EN VIVO" : "CÁMARA: INACTIVA"}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 border border-emerald-500/20 rounded text-slate-300">
            <span>VIDEO: Activo</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 border border-emerald-500/20 rounded text-slate-300">
            <span>IMAGEN: Activo</span>
          </div>
        </div>
      </header>

      {/* Main Studio Grid */}
      <main className="max-w-[1560px] mx-auto px-6 py-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          
          {/* PANEL IZQUIERDO: Live Camera & Vision HUD (7 cols) */}
          <section className="lg:col-span-7 bg-[#0b0f19] border border-white/[0.08] rounded-xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                📹 Visor de Visión Computacional en Tiempo Real
              </h2>
              <span className="text-[10.5px] font-mono text-cyan-400 uppercase tracking-wider">
                VIDEO + IMAGEN HUD
              </span>
            </div>

            {/* Viewport de Cámara */}
            <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-white/[0.12] shadow-2xl">
              <video ref={videoRef} playsInline autoPlay muted className="w-full h-full object-cover -scale-x-100" />
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

              {!cameraActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#070a12] to-[#0d1322] text-slate-400 gap-2 p-4 text-center">
                  <p className="text-xs">
                    <strong>Cámara web no iniciada</strong><br />
                    Haz clic en "Iniciar Cámara en Vivo" o usa los disparadores de simulación.
                  </p>
                </div>
              )}

              <div className="absolute top-3 left-3 right-3 flex justify-between pointer-events-none text-[10.5px] font-mono">
                <span className="px-2 py-0.5 bg-slate-950/80 backdrop-blur border border-rose-500/40 text-rose-400 rounded">
                  LIVE · 30 FPS
                </span>
                <span className="px-2 py-0.5 bg-slate-950/80 backdrop-blur border border-white/[0.15] text-cyan-400 rounded">
                  Inferencia: ~18ms
                </span>
              </div>
            </div>

            {/* Controles de Cámara */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={toggleCamera}
                className="flex-1 py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-indigo-500/25 transition-all"
              >
                {cameraActive ? "Detener Cámara" : "Iniciar Cámara en Vivo"}
              </button>
              <button
                type="button"
                onClick={captureSnapshot}
                className="flex-1 py-2.5 px-4 bg-white/[0.06] hover:bg-white/[0.1] text-white text-xs font-semibold rounded-lg border border-white/[0.08] transition-all"
              >
                Tomar Captura y Predecir
              </button>
              <button
                type="button"
                onClick={() => setContinuousScan(!continuousScan)}
                className={`flex-1 py-2.5 px-4 text-xs font-semibold rounded-lg border transition-all ${
                  continuousScan
                    ? "bg-rose-500/20 border-rose-500/40 text-rose-300"
                    : "bg-white/[0.06] hover:bg-white/[0.1] border-white/[0.08] text-white"
                }`}
              >
                {continuousScan ? "Detener Escaneo" : "Activar Escaneo Continuo"}
              </button>
            </div>

            {/* Disparadores de Simulación Rápida (Demo Controls) */}
            <div className="p-3 bg-[#080c16] border border-white/[0.07] rounded-lg space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-indigo-400 uppercase tracking-wider font-bold">
                <span>Disparadores de Simulación (Live Demo)</span>
                <span className="text-slate-500">Forzar estados en vivo</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPhoneDetected(!phoneDetected);
                    if (!phoneDetected) setDistractionSecs((s) => s + 12);
                  }}
                  className={`py-2 px-2 text-xs font-semibold rounded border transition-all ${
                    phoneDetected ? "bg-rose-500/20 border-rose-500 text-rose-300" : "bg-slate-900 border-white/[0.08] text-slate-300 hover:text-white"
                  }`}
                >
                  📱 Celular en Mano
                </button>
                <button
                  type="button"
                  onClick={() => setGazeAverted(!gazeAverted)}
                  className={`py-2 px-2 text-xs font-semibold rounded border transition-all ${
                    gazeAverted ? "bg-amber-500/20 border-amber-500 text-amber-300" : "bg-slate-900 border-white/[0.08] text-slate-300 hover:text-white"
                  }`}
                >
                  👀 Mirada Desviada
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPhoneDetected(false);
                    setGazeAverted(false);
                    setPersonPresent(true);
                  }}
                  className="py-2 px-2 text-xs font-semibold rounded border bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 transition-all"
                >
                  🧠 Concentrado
                </button>
                <button
                  type="button"
                  onClick={() => setPersonPresent(!personPresent)}
                  className={`py-2 px-2 text-xs font-semibold rounded border transition-all ${
                    !personPresent ? "bg-rose-500/20 border-rose-500 text-rose-300" : "bg-slate-900 border-white/[0.08] text-slate-300 hover:text-white"
                  }`}
                >
                  👤 Fuera de Encuadre
                </button>
              </div>
            </div>

            {/* Línea de Tiempo de Snapshots */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                Línea de Tiempo de Evidencia (Snapshots)
              </span>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {snapshots.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No hay capturas aún. Presiona "Tomar Captura".</p>
                ) : (
                  snapshots.map((s) => (
                    <div key={s.id} className="flex-shrink-0 w-32 bg-[#090e18] border border-white/[0.08] rounded overflow-hidden text-[10px] font-mono">
                      <img src={s.url} alt="Snap" className="w-full h-16 object-cover" />
                      <div className="p-1.5">
                        <span className="text-rose-400 font-bold block">{s.label}</span>
                        <span className="text-slate-400">{s.timestamp} · {s.score}/100</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* PANEL DERECHO: El Cerebro de "PREDICCIÓN" (5 cols) */}
          <section className="lg:col-span-5 bg-[#0b0f19] border border-white/[0.08] rounded-xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                ⚡ Cerebro de Predicción Académica
              </h2>
              <span className="text-[10.5px] font-mono text-indigo-400 uppercase tracking-wider">
                White-Box AI
              </span>
            </div>

            {/* 1. Diagnóstico de Atención y Emoción */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-[#090e18] border border-white/[0.08] rounded-lg">
                <span className="text-xs font-semibold text-slate-400 block mb-1">% Nivel de Atención</span>
                <span className="text-2xl font-extrabold font-mono text-white">{attentionScore}%</span>
                <div className="h-1.5 bg-white/[0.08] rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${attentionScore}%`,
                      backgroundColor: attentionScore >= 75 ? "#10b981" : attentionScore >= 40 ? "#f59e0b" : "#f43f5e"
                    }}
                  />
                </div>
              </div>
              <div className="p-3 bg-[#090e18] border border-white/[0.08] rounded-lg">
                <span className="text-xs font-semibold text-slate-400 block mb-1">Estado Cognitivo</span>
                <span className={`text-sm font-bold block mt-1 ${attentionScore >= 75 ? "text-emerald-400" : attentionScore >= 40 ? "text-amber-400" : "text-rose-400"}`}>
                  {emotion}
                </span>
                <span className="text-[10px] font-mono text-slate-400 block mt-2">
                  Distracción: {distractionSecs}s acumulados
                </span>
              </div>
            </div>

            {/* 2. Tacómetro Circular SVG (Score Heurístico) */}
            <div className="flex items-center gap-4 p-4 bg-gradient-to-br from-[#111827]/80 to-[#0b0f19] border border-white/[0.08] rounded-xl">
              <div className="relative w-24 h-24 flex-shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="9" />
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray={CIRC}
                    strokeDashoffset={strokeOffset}
                    className="transition-all duration-700 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-extrabold font-mono text-white">{riskScore}</span>
                  <span className="text-[9px] font-mono text-slate-400">/ 100</span>
                </div>
              </div>

              <div className="flex-1 space-y-1">
                <span className={`inline-block px-2 py-0.5 text-xs font-bold uppercase tracking-wider rounded border ${
                  riskScore >= 70 ? "bg-rose-500/10 text-rose-300 border-rose-500/30" : riskScore >= 30 ? "bg-amber-500/10 text-amber-300 border-amber-500/30" : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                }`}>
                  {riskScore >= 70 ? "Riesgo Alto · Revisión" : riskScore >= 30 ? "Atención Moderada" : "Atención Óptima"}
                </span>
                <p className="text-xs text-slate-400 leading-snug">
                  Índice heurístico explicable. No constituye sanción automática.
                </p>
              </div>
            </div>

            {/* 3. Proyección Académica a Futuro */}
            <div className="p-3 bg-indigo-500/[0.07] border border-indigo-500/25 rounded-lg space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-mono text-[10.5px] font-bold text-indigo-400 uppercase">
                  Proyección de Rendimiento en Examen Parcial
                </span>
                <span className="font-mono font-bold text-cyan-300">{predictedGrade.toFixed(1)} / 20</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {predictedGrade >= 16.0
                  ? "Proyección Favorable: Estudiante concentrado. Se proyecta calificación sobresaliente."
                  : predictedGrade >= 11.5
                  ? "Riesgo Moderado: Desconexiones intermitentes. Se estima nota limítrofe en la práctica de hoy."
                  : `Riesgo Crítico de Reprobar: Alta persistencia de distracción con celular. Se proyecta nota baja (${predictedGrade.toFixed(1)}/20).`}
              </p>
            </div>

            {/* Directriz Docente */}
            <div className="p-3 bg-slate-900/80 border-l-4 border-indigo-500 rounded-r-lg border border-white/[0.06]">
              <span className="text-[10px] font-mono text-indigo-400 font-bold uppercase block mb-0.5">
                Directriz Pedagógica
              </span>
              <p className="text-xs text-slate-200">
                {phoneDetected
                  ? "Intervención requerida: Solicitar guardar dispositivos electrónicos para evitar pérdida del hilo conductor de la clase."
                  : "Comportamiento dentro de parámetros normales. Continuar con la clase habitual."}
              </p>
            </div>

            {/* Inspector Técnico Colapsable */}
            <div className="border border-white/[0.08] rounded-lg bg-[#04070e] overflow-hidden">
              <button
                type="button"
                onClick={() => setDrawerOpen(!drawerOpen)}
                className="w-full flex items-center justify-between px-3 py-2 bg-[#090e18] text-xs font-mono text-slate-400 hover:text-slate-200"
              >
                <span>⚙️ Inspector Técnico de Payload JSON</span>
                <span>{drawerOpen ? "▲ Ocultar" : "▼ Ver Payload"}</span>
              </button>
              {drawerOpen && (
                <pre className="p-3 text-[11px] font-mono text-cyan-300 overflow-auto max-h-40 leading-relaxed">
                  {rawOutput || "Haz clic en 'Tomar Captura y Predecir' para ver el JSON transmitido al backend."}
                </pre>
              )}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
};

export default AulaPredictDashboard;
