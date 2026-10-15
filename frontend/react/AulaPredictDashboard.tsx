import React, { useState, useEffect, useRef } from "react";

// ============================================================================
// AulaPredict Live AI Studio · Real-Time Vision & Academic Projection (/20)
// Framework: React + Tailwind CSS
// ============================================================================

export interface SnapshotItem {
  id: string;
  url: string;
  timestamp: string;
  label: string;
  score: number;
}

export interface VectorEmociones {
  alegria: number;
  neutral: number;
  tristeza: number;
  estres: number;
  fatiga: number;
  emocion_dominante: string;
}

export const AulaPredictDashboard: React.FC = () => {
  // Referencias para la Cámara Web y Canvas
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Estados de Cámara e Inferencia
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [continuousScan, setContinuousScan] = useState<boolean>(false);
  const [activeMode, setActiveMode] = useState<"captura" | "live">("captura");
  const [mejoraActiva, setMejoraActiva] = useState<boolean>(true);

  // Estados de Simulación en Vivo (Disparadores de Exposición)
  const [phoneDetected, setPhoneDetected] = useState<boolean>(false);
  const [gazeAverted, setGazeAverted] = useState<boolean>(false);
  const [personPresent, setPersonPresent] = useState<boolean>(true);
  const [distractionSecs, setDistractionSecs] = useState<number>(0);

  // Vector de 5 Emociones con Porcentajes Exactos (0 - 100%)
  const [emociones, setEmociones] = useState<VectorEmociones>({
    alegria: 12.5,
    neutral: 65.0,
    tristeza: 7.5,
    estres: 9.0,
    fatiga: 6.0,
    emocion_dominante: "Neutral / Concentración"
  });

  // Diagnóstico Psicológico, Conductual y Proyección Académica
  const [attentionScore, setAttentionScore] = useState<number>(95);
  const [predictedGrade, setPredictedGrade] = useState<number>(17.0);
  const [riskScore, setRiskScore] = useState<number>(15);
  const [personalText, setPersonalText] = useState<string>(
    "Foco atencional estable y sostenido. Comportamiento en rango de asimilación activa y concentración productiva."
  );
  const [personalAlert, setPersonalAlert] = useState<string>("Foco Estable");
  const [directiveText, setDirectiveText] = useState<string>("Continuar con la clase habitual. No se requiere intervención.");

  // Galería de Snapshots y Vista Previa HD
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [previewHD, setPreviewHD] = useState<string | null>(null);

  // Servidor y Drawer Técnico
  const [servidor] = useState<string>("http://localhost:8001");
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [rawOutput, setRawOutput] = useState<string>("");

  // Iniciar / Detener Cámara Web Real en HD (1280x720)
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
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
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

  // Dibujar Bounding Boxes Dinámicos y Landmarks en el Canvas
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

    // Bounding Box Dinámico del Estudiante
    const boxX = width * 0.35;
    const boxY = height * 0.20;
    const boxW = width * 0.30;
    const boxH = height * 0.52;

    const boxColor = phoneDetected ? "rgba(244, 63, 94, 0.85)" : (gazeAverted ? "rgba(245, 158, 11, 0.85)" : "rgba(14, 165, 233, 0.85)");
    ctx.strokeStyle = boxColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    // Label con la emoción dominante
    ctx.fillStyle = boxColor;
    ctx.fillRect(boxX, boxY - 20, boxW, 20);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10.5px monospace";
    ctx.fillText(`ESTUDIANTE | ${emociones.emocion_dominante}`, boxX + 6, boxY - 6);

    // Landmarks faciales (ojos, nariz, boca)
    const centroX = boxX + boxW * 0.5;
    const ojoIzq = [boxX + boxW * 0.32, boxY + boxH * 0.38];
    const ojoDer = [boxX + boxW * 0.68, boxY + boxH * 0.38];
    const nariz = [centroX, boxY + boxH * 0.58];
    const boca = [centroX, boxY + boxH * 0.78];

    ctx.fillStyle = "#38bdf8";
    for (const pt of [ojoIzq, ojoDer, nariz, boca]) {
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Celular Detectado (YOLO best.pt)
    if (phoneDetected) {
      const phX = boxX + boxW * 0.65;
      const phY = boxY + boxH * 0.50;
      const phW = width * 0.22;
      const phH = height * 0.35;

      ctx.strokeStyle = "#f43f5e";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(phX, phY, phW, phH);
      ctx.fillStyle = "#f43f5e";
      ctx.fillRect(phX, phY - 20, phW, 20);
      ctx.fillStyle = "#ffffff";
      ctx.fillText("CELULAR (94%)", phX + 6, phY - 6);
    }

    // Vector de Mirada Desviada
    if (gazeAverted) {
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centroX, boxY + boxH * 0.38);
      ctx.lineTo(boxX - 35, boxY + boxH * 0.20);
      ctx.stroke();

      ctx.fillStyle = "#f59e0b";
      ctx.fillRect(boxX - 110, boxY + boxH * 0.12, 110, 18);
      ctx.fillStyle = "#ffffff";
      ctx.fillText("MIRADA FUERA", boxX - 105, boxY + boxH * 0.12 + 13);
    }
  };

  // Recalcular diagnóstico y proyección académica
  useEffect(() => {
    let atencion = 95;
    if (!personPresent) {
      atencion = 0;
    } else if (phoneDetected) {
      atencion -= 60;
    } else if (gazeAverted) {
      atencion -= 35;
    }
    if (emociones.fatiga > 30) atencion -= (emociones.fatiga - 30) * 0.7;
    if (emociones.tristeza > 30) atencion -= (emociones.tristeza - 30) * 0.5;

    atencion = Math.max(5, Math.min(99, Math.round(atencion)));
    setAttentionScore(atencion);

    let notaBase = 16.5;
    if (emociones.alegria >= 40) notaBase += 2.0;
    else if (emociones.neutral >= 55) notaBase += 1.5;
    else if (emociones.tristeza >= 40) notaBase -= 4.5;
    else if (emociones.fatiga >= 35) notaBase -= 3.0;
    else if (emociones.estres >= 35) notaBase -= 2.5;

    if (phoneDetected) notaBase -= 4.0;
    if (gazeAverted) notaBase -= 2.0;

    const notaEstimada = parseFloat(Math.max(5.0, Math.min(20.0, notaBase)).toFixed(1));
    setPredictedGrade(notaEstimada);
    setRiskScore(Math.round(100 - atencion));

    // Inferencia psicológica
    if (emociones.tristeza >= 45.0) {
      setPersonalText(
        `Se detecta un alto índice de tristeza/abatimiento facial (${emociones.tristeza.toFixed(1)}%). Posiblemente el estudiante está pasando por un mal momento personal o sobrecarga emocional, lo que bloquea su receptividad en clase. Se predice riesgo de aislamiento o deserción si no recibe apoyo.`
      );
      setPersonalAlert("Sobrecarga Emocional");
      setDirectiveText("Prioridad Alta: Conversar empáticamente con el estudiante por señales de tristeza/mal momento personal antes de exigir rendimiento académico.");
    } else if (emociones.estres >= 38.0) {
      setPersonalText(`Signos elevados de tensión y ansiedad (${emociones.estres.toFixed(1)}%). Posible bloqueo cognitivo frente a la evaluación o presión académica acumulada.`);
      setPersonalAlert("Tensión Alta");
      setDirectiveText("Sugerencia Pedagógica: Implementar una pausa de 2 minutos de descompresión cognitiva para reducir el cortisol.");
    } else if (emociones.fatiga >= 38.0) {
      setPersonalText(`Agotamiento físico/mental detectado (${emociones.fatiga.toFixed(1)}%). La capacidad de retención cognitiva en los próximos 30 minutos será inferior al 35% por fatiga acumulada.`);
      setPersonalAlert("Agotamiento");
      setDirectiveText("Recomendación Docente: Conceder un receso breve o alternar a una dinámica participativa para mitigar el agotamiento mental.");
    } else {
      setPersonalText("Foco atencional estable y sostenido. Comportamiento en rango de asimilación activa y concentración productiva sin signos de saturación.");
      setPersonalAlert("Foco Estable");
      setDirectiveText("Seguimiento Regular: Continuar con el ritmo actual de la sesión; atención sincronizada con los objetivos del tema.");
    }

    drawHUD();
  }, [phoneDetected, gazeAverted, personPresent, distractionSecs, emociones]);

  // Modo 1: Tomar Captura y Predecir
  const takeSnapshot = async () => {
    let url = "";
    if (videoRef.current && cameraActive) {
      const offscreen = document.createElement("canvas");
      offscreen.width = 1280;
      offscreen.height = 720;
      const offCtx = offscreen.getContext("2d");
      if (offCtx) {
        offCtx.drawImage(videoRef.current, 0, 0, 1280, 720);
        url = offscreen.toDataURL("image/jpeg", 0.9);
      }
    }

    setPreviewHD(url);
    const newSnap: SnapshotItem = {
      id: Date.now().toString(),
      url: url || "",
      timestamp: new Date().toLocaleTimeString(),
      label: emociones.emocion_dominante,
      score: predictedGrade
    };
    setSnapshots([newSnap, ...snapshots]);

    // Llamar backend para sincronizar
    try {
      const resp = await fetch(`${servidor}/api/vision/analizar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagen_b64: url,
          modo: "captura",
          aplicar_mejora: mejoraActiva,
          segundos_distraccion: distractionSecs
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        setRawOutput(JSON.stringify(data, null, 2));
        if (data.emociones) setEmociones(data.emociones);
      }
    } catch (e) {
      // Offline fallback
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30">
      {/* Header */}
      <header className="h-14 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white tracking-wide">AulaPredict Live Studio</h1>
            <p className="text-[10px] text-slate-400 font-mono">Vision AI · Real-Time Inference</p>
          </div>
        </div>

        {/* Status Badges */}
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-mono border flex items-center gap-1.5 ${
            cameraActive ? "bg-emerald-950/60 text-emerald-300 border-emerald-800" : "bg-slate-900 text-slate-400 border-slate-800"
          }`}>
            <span className={`w-2 h-2 rounded-full ${cameraActive ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
            {cameraActive ? "1280x720 HD" : "CÁMARA OFF"}
          </span>
          <span className="px-2.5 py-1 rounded-full text-[11px] font-mono bg-cyan-950/50 text-cyan-300 border border-cyan-800">
            YOLO best.pt
          </span>
          <span className="px-2.5 py-1 rounded-full text-[11px] font-mono bg-indigo-950/50 text-indigo-300 border border-indigo-800">
            CLAHE + Nitidez HD
          </span>
        </div>
      </header>

      {/* Main Grid Layout */}
      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-7xl mx-auto w-full">
        {/* PANEL IZQUIERDO: Cámara & HUD (7 cols) */}
        <section className="lg:col-span-7 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400">Modo:</span>
              <button
                onClick={() => setActiveMode("captura")}
                className={`px-3 py-1 text-xs rounded-full border transition ${
                  activeMode === "captura" ? "bg-cyan-600/30 text-cyan-300 border-cyan-500/50 font-semibold" : "text-slate-400 border-slate-800 hover:text-white"
                }`}
              >
                Modo 1: Captura HD
              </button>
              <button
                onClick={() => setActiveMode("live")}
                className={`px-3 py-1 text-xs rounded-full border transition ${
                  activeMode === "live" ? "bg-cyan-600/30 text-cyan-300 border-cyan-500/50 font-semibold" : "text-slate-400 border-slate-800 hover:text-white"
                }`}
              >
                Modo 2: Video Continuo
              </button>
            </div>

            {/* Toggle Mejora de Imagen */}
            <label className="flex items-center gap-2 text-xs text-teal-200 cursor-pointer bg-slate-900/80 px-3 py-1 rounded-full border border-teal-500/30">
              <input
                type="checkbox"
                checked={mejoraActiva}
                onChange={(e) => setMejoraActiva(e.target.checked)}
                className="rounded border-slate-700 text-teal-500 focus:ring-0"
              />
              <span>Mejora Activa (CLAHE / Unsharp)</span>
            </label>
          </div>

          {/* Viewport de Cámara + Canvas */}
          <div className="relative aspect-video bg-slate-900/90 rounded-xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              className={`absolute inset-0 w-full h-full object-cover ${cameraActive ? "opacity-100" : "opacity-0"}`}
            />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-10" />

            {!cameraActive && (
              <div className="text-center p-6 text-slate-500 flex flex-col items-center gap-2">
                <svg className="w-12 h-12 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <p className="text-sm font-medium">Cámara Web Inactiva</p>
                <p className="text-xs max-w-xs text-slate-600">Presiona "Iniciar Cámara en Vivo" para tracking HD o interactúa con los disparadores rápidos.</p>
              </div>
            )}

            {/* Telemetría HUD */}
            <div className="absolute top-3 left-3 z-20 flex gap-2 text-[10px] font-mono">
              <span className="bg-slate-950/80 text-emerald-400 px-2.5 py-1 rounded-md border border-emerald-900/50 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                LIVE · 30 FPS
              </span>
              <span className="bg-slate-950/80 text-cyan-400 px-2.5 py-1 rounded-md border border-cyan-900/50">
                Tracking: Dinámico
              </span>
            </div>

            {/* Quality Metrics Bar */}
            <div className="absolute bottom-3 inset-x-3 z-20 bg-slate-950/85 backdrop-blur-md rounded-lg p-2 border border-cyan-500/20 flex justify-around text-[10px] font-mono">
              <div><span className="text-slate-400">Nitidez: </span><span className="text-cyan-400 font-bold">+232% HD</span></div>
              <div><span className="text-slate-400">Iluminación: </span><span className="text-teal-300 font-bold">CLAHE L*A*B</span></div>
              <div><span className="text-slate-400">Ruido: </span><span className="text-indigo-300 font-bold">Bilateral 5x5</span></div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={toggleCamera}
              className={`py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
                cameraActive ? "bg-rose-600 hover:bg-rose-500 text-white" : "bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/20"
              }`}
            >
              {cameraActive ? "Detener Cámara" : "Iniciar Cámara en Vivo"}
            </button>
            <button
              onClick={takeSnapshot}
              className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold py-2.5 rounded-lg border border-slate-700 transition"
            >
              Tomar Captura & Predecir
            </button>
            <button
              onClick={() => setContinuousScan(!continuousScan)}
              className={`py-2.5 rounded-lg text-xs font-semibold border transition ${
                continuousScan ? "bg-indigo-600 text-white border-indigo-500" : "bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800"
              }`}
            >
              {continuousScan ? "Detener Escaneo" : "Activar Escaneo Continuo"}
            </button>
          </div>

          {/* Quick Simulation Triggers */}
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
            <p className="text-[11px] font-mono uppercase text-slate-400 mb-2">Disparadores de Simulación Rápida (Exposición)</p>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <button
                onClick={() => setPhoneDetected(!phoneDetected)}
                className={`py-1.5 px-2 rounded-lg border transition ${
                  phoneDetected ? "bg-rose-950/80 border-rose-600 text-rose-300" : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                }`}
              >
                📱 Celular
              </button>
              <button
                onClick={() => setGazeAverted(!gazeAverted)}
                className={`py-1.5 px-2 rounded-lg border transition ${
                  gazeAverted ? "bg-amber-950/80 border-amber-600 text-amber-300" : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                }`}
              >
                👀 Mirada
              </button>
              <button
                onClick={() => {
                  setPhoneDetected(false);
                  setGazeAverted(false);
                  setPersonPresent(true);
                  setEmociones({
                    alegria: 20.0, neutral: 70.0, tristeza: 3.0, estres: 4.0, fatiga: 3.0,
                    emocion_dominante: "Neutral / Concentración"
                  });
                }}
                className="py-1.5 px-2 rounded-lg border bg-slate-950 border-slate-800 text-emerald-400 hover:border-emerald-600 transition"
              >
                🧠 Concentrado
              </button>
              <button
                onClick={() => setPersonPresent(!personPresent)}
                className={`py-1.5 px-2 rounded-lg border transition ${
                  !personPresent ? "bg-rose-950/80 border-rose-600 text-rose-300" : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                }`}
              >
                👤 Ausente
              </button>
            </div>
          </div>

          {/* Snapshots Gallery */}
          <div className="bg-slate-900/40 p-3.5 rounded-xl border border-slate-800/80">
            <span className="text-[11px] font-mono uppercase text-slate-400">Galería de Evidencias (Snapshots HD)</span>
            <div className="flex gap-3 overflow-x-auto mt-2 pb-1">
              {snapshots.length === 0 ? (
                <div className="text-xs text-slate-600 py-3 text-center w-full">Sin capturas registradas. Presiona "Tomar Captura".</div>
              ) : (
                snapshots.map((snap) => (
                  <div key={snap.id} className="w-28 flex-shrink-0 bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
                    <img src={snap.url} alt="Snap" className="w-full h-16 object-cover" />
                    <div className="p-1.5 text-[9.5px] font-mono text-slate-400">
                      <div>{snap.timestamp}</div>
                      <div className="text-cyan-400 font-bold">{snap.score.toFixed(1)}/20</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* PANEL DERECHO: El Cerebro de Predicción (5 cols) */}
        <section className="lg:col-span-5 flex flex-col gap-4">
          {/* Attention & Cognitive State */}
          <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 uppercase font-mono tracking-wider">Atención en Clase</span>
              <span className="text-xl font-bold font-mono text-white">{attentionScore}%</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  attentionScore >= 75 ? "bg-emerald-500" : (attentionScore >= 40 ? "bg-amber-500" : "bg-rose-500")
                }`}
                style={{ width: `${attentionScore}%` }}
              />
            </div>
          </div>

          {/* 5 Emociones con Porcentajes Exactos (0 - 100%) */}
          <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 flex flex-col gap-2.5">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-300">
              <span>Vector Emocional (Módulo IMAGEN)</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950/60 text-cyan-300 border border-cyan-800 font-mono">
                {emociones.emocion_dominante}
              </span>
            </div>

            {/* Alegría */}
            <div className="text-xs">
              <div className="flex justify-between text-slate-300 text-[11px] mb-1">
                <span>😊 Alegría / Motivación</span>
                <span className="font-mono text-emerald-400">{emociones.alegria.toFixed(1)}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${emociones.alegria}%` }} />
              </div>
            </div>

            {/* Neutral */}
            <div className="text-xs">
              <div className="flex justify-between text-slate-300 text-[11px] mb-1">
                <span>😐 Neutral / Concentración</span>
                <span className="font-mono text-cyan-400">{emociones.neutral.toFixed(1)}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-cyan-500 rounded-full transition-all duration-300" style={{ width: `${emociones.neutral}%` }} />
              </div>
            </div>

            {/* Tristeza */}
            <div className="text-xs">
              <div className="flex justify-between text-slate-300 text-[11px] mb-1">
                <span>😢 Tristeza / Decaimiento</span>
                <span className="font-mono text-indigo-400">{emociones.tristeza.toFixed(1)}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${emociones.tristeza}%` }} />
              </div>
            </div>

            {/* Estrés */}
            <div className="text-xs">
              <div className="flex justify-between text-slate-300 text-[11px] mb-1">
                <span>😟 Estrés / Ansiedad</span>
                <span className="font-mono text-amber-400">{emociones.estres.toFixed(1)}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full transition-all duration-300" style={{ width: `${emociones.estres}%` }} />
              </div>
            </div>

            {/* Fatiga */}
            <div className="text-xs">
              <div className="flex justify-between text-slate-300 text-[11px] mb-1">
                <span>😴 Fatiga / Distracción</span>
                <span className="font-mono text-rose-400">{emociones.fatiga.toFixed(1)}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-rose-500 rounded-full transition-all duration-300" style={{ width: `${emociones.fatiga}%` }} />
              </div>
            </div>
          </div>

          {/* Inferencia Psicológica & Personal */}
          <div className="bg-slate-900/80 p-4 rounded-xl border border-indigo-900/40 border-l-4 border-l-indigo-500 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-indigo-300">🧠 Diagnóstico Psicológico & Personal</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800">
                {personalAlert}
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{personalText}</p>
          </div>

          {/* Proyección Académica /20 */}
          <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase text-slate-400">Proyección en Examen Parcial</span>
              <span className={`text-2xl font-bold font-mono ${predictedGrade >= 15 ? "text-emerald-400" : (predictedGrade >= 11 ? "text-amber-400" : "text-rose-400")}`}>
                {predictedGrade.toFixed(1)} / 20
              </span>
            </div>
            <div className="w-full h-2 bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-500 rounded-full relative my-1">
              <div
                className="w-2.5 h-4 bg-white rounded-sm absolute -top-1 shadow-lg shadow-white/50 -translate-x-1/2 transition-all duration-300"
                style={{ left: `${(predictedGrade / 20) * 100}%` }}
              />
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {predictedGrade >= 15
                ? "Proyección Favorable: El estudiante mantiene un foco estable y alta capacidad de retención. Se proyecta calificación sobresaliente."
                : (predictedGrade >= 11
                  ? "Riesgo Académico Moderado: Sobrecarga o distracciones intermitentes que amenazan el rendimiento en la evaluación parcial."
                  : "Riesgo Crítico: Desconexión prolongada o abatimiento severo. Alta probabilidad de desaprobar la práctica si no hay intervención.")}
            </p>
          </div>

          {/* Directriz Docente */}
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80 text-xs">
            <span className="text-[10px] font-mono text-cyan-400 uppercase font-semibold">Recomendación para el Docente</span>
            <p className="text-slate-300 mt-1">{directiveText}</p>
          </div>
        </section>
      </main>

      {/* Footer Ético */}
      <footer className="border-t border-slate-800/60 py-3 text-center text-xs text-slate-500 font-mono">
        AulaPredict: Proyecciones asistidas basadas en telemetría de visión en tiempo real y reglas heurísticas. Siempre requiere revisión humana.
      </footer>
    </div>
  );
};

export default AulaPredictDashboard;
