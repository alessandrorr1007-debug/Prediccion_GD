import React, { useState, useEffect, useRef } from "react";

// ============================================================================
// AulaPredict · Cerebro Integrador de Predicciones y Supervisión Universitaria
// Componente Oficial React (Tema Claro Corporativo Universitario)
// ============================================================================

export interface EstudianteAula {
  id: number;
  nombre: string;
  subId: string;
  estado: string;
  estadoClase: string;
  atencion: number;
  tipoAtencion: string;
  emociones: {
    fatiga: number;
    estres: number;
    tristeza: number;
    neutral: number;
    dominante: string;
  };
  causas: Array<{ texto: string; prob: number }>;
  consecuencias: Array<{ texto: string; prob: number }>;
  score: number;
  nivelRiesgo: string;
  esRiesgoAlto: boolean;
  alertaExamen: string;
  narrativa: string;
  box: { x: number; y: number; w: number; h: number };
  label: string;
  distractor: boolean;
  distractorBox?: { x: number; y: number; w: number; h: number; label: string };
}

const ESTUDIANTES_MOCK: EstudianteAula[] = [
  {
    id: 1,
    nombre: "Estudiante 1",
    subId: "0.91",
    estado: "Concentrado",
    estadoClase: "text-emerald-700",
    atencion: 92,
    tipoAtencion: "bg-emerald-500",
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
    estadoClase: "text-amber-600",
    atencion: 42,
    tipoAtencion: "bg-amber-500",
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
    estadoClase: "text-red-600",
    atencion: 15,
    tipoAtencion: "bg-red-500",
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
    estadoClase: "text-amber-600",
    atencion: 38,
    tipoAtencion: "bg-amber-500",
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
    estadoClase: "text-emerald-700",
    atencion: 85,
    tipoAtencion: "bg-blue-500",
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

export const AulaPredictDashboard: React.FC = () => {
  const [estudiantes, setEstudiantes] = useState<EstudianteAula[]>(ESTUDIANTES_MOCK);
  const [seleccionadoId, setSeleccionadoId] = useState<number>(3);
  const [modo, setModo] = useState<"webcam" | "classroom">("classroom");
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [liveClock, setLiveClock] = useState<string>("15/10/2026 18:00:00");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const alumnoActual = estudiantes.find((e) => e.id === seleccionadoId) || estudiantes[0];

  // Reloj en tiempo real
  useEffect(() => {
    const timer = setInterval(() => {
      const ahora = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      setLiveClock(
        `${pad(ahora.getDate())}/${pad(ahora.getMonth() + 1)}/${ahora.getFullYear()} ${pad(
          ahora.getHours()
        )}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())}`
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: false
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraActive(true);
        setSeleccionadoId(1);
      } catch (err: any) {
        alert(`No se pudo acceder a la cámara: ${err.message}.`);
      }
    }
  };

  // Renderizado dinámico de Canvas HUD
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const w = canvas.clientWidth || 640;
      const h = canvas.clientHeight || 360;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      ctx.clearRect(0, 0, w, h);

      const visibles = modo === "webcam" ? estudiantes.slice(0, 1) : estudiantes;

      visibles.forEach((est) => {
        const isSelected = est.id === seleccionadoId;
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

        ctx.font = "bold 11px Inter, sans-serif";
        const textWidth = ctx.measureText(est.label).width;
        ctx.fillStyle = isSelected ? "#1D7AFC" : "#2563EB";
        ctx.fillRect(bx, by - 22, textWidth + 14, 22);
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(est.label, bx + 7, by - 7);

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

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [estudiantes, seleccionadoId, modo]);

  return (
    <div className="flex min-h-screen bg-[#F4F6F9] font-sans text-slate-800">
      {/* SIDEBAR FIJO (#0F294A) */}
      <aside className="w-64 min-w-[260px] bg-[#0F294A] text-slate-200 flex flex-col justify-between p-6 sticky top-0 h-screen shadow-md">
        <div>
          <div className="flex items-center gap-3 pb-5 border-b border-white/10">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1D7AFC] to-[#0F294A] flex items-center justify-center text-white shadow-lg">
              🎓
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">Sistema de Supervisión Inteligente</h1>
              <p className="text-[10px] text-slate-400 mt-0.5">Aula Inteligente para Educación Universitaria</p>
            </div>
          </div>

          <nav className="mt-6 flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 mb-1">
              Módulos de Análisis
            </span>
            <button className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-slate-300 opacity-50 cursor-not-allowed text-xs font-medium text-left">
              <span>🎥</span>
              <span className="flex-1">Video</span>
              <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded">V1</span>
            </button>
            <button className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-slate-300 opacity-50 cursor-not-allowed text-xs font-medium text-left">
              <span>🖼️</span>
              <span className="flex-1">Imágenes</span>
              <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded">V1</span>
            </button>
            <button className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-[#1D7AFC] text-white font-semibold text-xs shadow-md text-left">
              <span>🔮</span>
              <span className="flex-1">Predicciones</span>
              <span className="text-[9px] bg-white/20 px-2 py-0.5 rounded-full font-bold">ACTIVO</span>
            </button>
          </nav>
        </div>

        <div className="pt-4 border-t border-white/10 flex flex-col gap-2 text-xs">
          <div className="flex items-center gap-2 text-emerald-300 font-medium text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#10B981] animate-pulse"></span>
            <span>Red Local Conectada</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">AulaPredict Core v2.4</span>
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* HEADER SUPERIOR BLANCO */}
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-40 shadow-sm">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Cerebro Integrador Multimodal</span>
            <h2 className="text-xl font-bold text-slate-900 leading-tight">🎥 Panel de Inferencia de Predicciones</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cerebro Integrador de AulaPredict - Análisis de causas previas, comportamiento en vivo y proyección de rendimiento académico para múltiples alumnos
            </p>
          </div>

          <div className="flex items-center gap-2.5 px-3.5 py-1.5 border border-slate-200 rounded-full bg-white hover:bg-slate-50 cursor-pointer transition-all">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
              AD
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-semibold text-slate-900">Administrador</span>
              <span className="text-[10px] text-slate-500">Supervisión Docente</span>
            </div>
            <span className="text-xs text-slate-400 ml-1">⌄</span>
          </div>
        </header>

        {/* CUERPO DEL DASHBOARD */}
        <main className="p-8 flex flex-col gap-5 flex-1">
          {/* FILA SUPERIOR: CÁMARA (48%) + SELECCIÓN DE ALUMNOS (52%) */}
          <div className="grid grid-cols-1 lg:grid-cols-[48%_52%] gap-5 items-stretch">
            {/* Tarjeta Izquierda: Cámara Web Real */}
            <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-sm font-bold text-slate-900">🎥 Cámara en tiempo real (En vivo)</h3>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-50 border border-emerald-200 rounded-full text-[11px] font-semibold text-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    En vivo
                  </span>
                </div>

                <div className="inline-flex bg-slate-100 border border-slate-200 rounded-lg p-0.5 text-[11px]">
                  <button
                    onClick={() => {
                      setModo("webcam");
                      setSeleccionadoId(1);
                      if (!cameraActive) toggleCamera();
                    }}
                    className={`px-3 py-1 rounded-md font-semibold transition-all ${
                      modo === "webcam" ? "bg-white text-blue-600 shadow-sm" : "text-slate-600"
                    }`}
                  >
                    🎥 Modo Cámara Real
                  </button>
                  <button
                    onClick={() => {
                      setModo("classroom");
                      setSeleccionadoId(3);
                    }}
                    className={`px-3 py-1 rounded-md font-semibold transition-all ${
                      modo === "classroom" ? "bg-white text-blue-600 shadow-sm" : "text-slate-600"
                    }`}
                  >
                    👥 Simular Aula (5 Alumnos)
                  </button>
                </div>
              </div>

              {/* Viewport de Cámara */}
              <div className="relative w-full aspect-video bg-slate-900 rounded-lg overflow-hidden shadow-inner">
                <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 w-full h-full object-cover ${cameraActive ? "block" : "hidden"}`} />
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-10 cursor-crosshair" />

                {!cameraActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-gradient-to-b from-slate-800 to-slate-900 text-white z-0">
                    <div className="w-14 h-14 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-3 text-2xl">
                      📹
                    </div>
                    <h4 className="text-sm font-semibold mb-1">Cámara Web en Espera</h4>
                    <p className="text-xs text-slate-400 max-w-xs mb-4">Haz clic para activar el seguimiento facial o navega por los alumnos en la cuadrícula.</p>
                    <button
                      onClick={toggleCamera}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all shadow-md"
                    >
                      ▶ Iniciar Cámara Web
                    </button>
                  </div>
                )}

                {/* Telemetría HUD */}
                <div className="absolute top-2.5 left-3 z-20 bg-slate-900/80 backdrop-blur-sm border border-white/10 rounded-full px-2.5 py-0.5 flex items-center gap-1.5 text-[10px] font-mono text-slate-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                  <span>LIVE · 30 FPS · HD</span>
                </div>

                {/* Barra Inferior Translúcida: Reloj en vivo y Aula 301 */}
                <div className="absolute bottom-0 inset-x-0 z-20 bg-slate-900/85 backdrop-blur-md border-t border-white/10 px-4 py-2 flex items-center justify-between text-xs text-slate-200">
                  <span className="font-mono text-slate-300">{liveClock}</span>
                  <span className="bg-blue-600/30 border border-blue-400/40 text-blue-200 px-2.5 py-0.5 rounded-full font-semibold text-[11px]">
                    Aula 301
                  </span>
                </div>
              </div>

              {/* Botones de acción */}
              <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleCamera}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
                  >
                    <span>📹</span>
                    <span>{cameraActive ? "Detener Cámara" : "Iniciar Cámara"}</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="font-medium">Prueba rápida:</span>
                  <button
                    onClick={() => {
                      const copia = [...estudiantes];
                      const est = copia.find((e) => e.id === seleccionadoId);
                      if (est) {
                        est.distractor = true;
                        est.atencion = 12;
                        est.estado = "Alerta Crítica (Celular / Distracción)";
                        est.score = 88;
                        est.esRiesgoAlto = true;
                        est.emociones.fatiga = 45;
                        est.emociones.dominante = "Distracción / Fatiga (😴)";
                      }
                      setEstudiantes(copia);
                    }}
                    className="border border-slate-200 px-2 py-0.5 rounded-full hover:bg-slate-50 text-[11px]"
                  >
                    📱 Celular
                  </button>
                  <button
                    onClick={() => {
                      const copia = [...estudiantes];
                      const est = copia.find((e) => e.id === seleccionadoId);
                      if (est) {
                        est.distractor = false;
                        est.atencion = 94;
                        est.estado = "Concentrado";
                        est.score = 12;
                        est.esRiesgoAlto = false;
                        est.emociones.neutral = 85;
                        est.emociones.dominante = "Neutral / Concentración (😊)";
                      }
                      setEstudiantes(copia);
                    }}
                    className="border border-slate-200 px-2 py-0.5 rounded-full hover:bg-slate-50 text-[11px]"
                  >
                    🎯 Concentrado
                  </button>
                </div>
              </div>
            </section>

            {/* Tarjeta Derecha: Selección y Estado de Alumnos en Aula */}
            <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">🎯 Selección y Estado de Alumnos en Aula</h3>
                  <p className="text-[11.5px] text-slate-500">Haz clic en cualquier alumno para actualizar su pronóstico en vivo</p>
                </div>
                <span className="bg-blue-50 border border-blue-200 text-blue-700 font-bold text-xs px-3 py-1 rounded-full">
                  {modo === "webcam" ? "2 Alumnos Detectados" : "5 Alumnos Detectados"}
                </span>
              </div>

              {/* Grid 2 Columnas de Tarjetas de Alumnos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 mt-2">
                {(modo === "webcam" ? estudiantes.slice(0, 2) : estudiantes).map((est) => {
                  const isSelected = est.id === seleccionadoId;
                  return (
                    <div
                      key={est.id}
                      onClick={() => setSeleccionadoId(est.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
                        isSelected
                          ? "border-2 border-blue-600 bg-slate-50/70 shadow-md ring-2 ring-blue-500/20"
                          : "border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${
                            isSelected ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {est.id}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {est.nombre} (ID: {est.subId})
                          </span>
                          <span className={`text-[11px] font-semibold ${est.estadoClase}`}>● {est.estado}</span>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-slate-500">Atención Estimada</span>
                          <span className="font-bold text-slate-800">{est.atencion}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${est.tipoAtencion}`} style={{ width: `${est.atencion}%` }}></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* FILA INFERIOR: 3 TARJETAS DE PREDICCIÓN (33% · 34% · 33%) */}
          <div className="grid grid-cols-1 lg:grid-cols-[33%_34%_33%] gap-5 items-stretch">
            {/* Tarjeta 1: Emociones */}
            <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-0.5">
                  🔮 Predicción de Estado y Emociones en Vivo <span className="text-blue-600 font-bold">({alumnoActual.nombre})</span>
                </h3>
                <span className="text-[11px] text-slate-400">Predicción de Estado y Emociones en Vivo</span>

                <div className="mt-4 flex flex-col gap-3.5">
                  {/* 1. Fatiga */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-slate-700">Distracción / Fatiga (😴)</span>
                      <span className="font-mono font-bold text-[#F97316]">{alumnoActual.emociones.fatiga}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#F97316] rounded-full" style={{ width: `${alumnoActual.emociones.fatiga}%` }}></div>
                    </div>
                  </div>

                  {/* 2. Estrés */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-slate-700">Estrés / Ansiedad (😟)</span>
                      <span className="font-mono font-bold text-[#F59E0B]">{alumnoActual.emociones.estres}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#F59E0B] rounded-full" style={{ width: `${alumnoActual.emociones.estres}%` }}></div>
                    </div>
                  </div>

                  {/* 3. Tristeza */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-slate-700">Tristeza / Desatención (😢)</span>
                      <span className="font-mono font-bold text-yellow-600">{alumnoActual.emociones.tristeza}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#FACC15] rounded-full" style={{ width: `${alumnoActual.emociones.tristeza}%` }}></div>
                    </div>
                  </div>

                  {/* 4. Neutral */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-slate-700">Neutral / Concentración (😊)</span>
                      <span className="font-mono font-bold text-blue-600">{alumnoActual.emociones.neutral}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#60A5FA] rounded-full" style={{ width: `${alumnoActual.emociones.neutral}%` }}></div>
                    </div>
                  </div>
                </div>

                {/* Píldora Dominante */}
                <div className="mt-4 p-2.5 rounded-lg bg-orange-50 border border-orange-200 text-xs text-orange-900 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0"></span>
                  <span>
                    Estado Emocional Dominante: <strong>{alumnoActual.emociones.dominante}</strong>
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200 text-[10.5px] text-slate-500 font-medium">
                ✅ Inferencia Bayesiana Activa (Alta Definición)
              </div>
            </section>

            {/* Tarjeta 2: Sucesos Probables */}
            <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-4">
                  📋 Predicción de Sucesos Probables <span className="text-blue-600 font-bold">({alumnoActual.nombre})</span>
                </h3>

                <div className="flex flex-col gap-4">
                  {/* Bloque 1: Causas */}
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5 mb-2">
                      <span>⏳</span> Acontecimientos Previos (Causas Probables)
                    </span>
                    <div className="flex flex-col gap-2">
                      {alumnoActual.causas.map((c, i) => (
                        <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-2 flex flex-col gap-1.5">
                          <div className="flex justify-between text-[11.5px] items-start gap-2">
                            <span className="text-slate-700 font-medium">{c.texto}</span>
                            <span className="font-mono font-bold text-blue-600 whitespace-nowrap">{c.prob}% prob.</span>
                          </div>
                          <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${c.prob}%` }}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bloque 2: Consecuencias */}
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5 mb-2">
                      <span>🎯</span> Acontecimientos Futuros (Consecuencias Estimadas)
                    </span>
                    <div className="flex flex-col gap-2">
                      {alumnoActual.consecuencias.map((c, i) => (
                        <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-2 flex flex-col gap-1.5">
                          <div className="flex justify-between text-[11.5px] items-start gap-2">
                            <span className="text-slate-700 font-medium">{c.texto}</span>
                            <span className="font-mono font-bold text-blue-600 whitespace-nowrap">{c.prob}% prob.</span>
                          </div>
                          <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${c.prob}%` }}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Tarjeta 3: Análisis y Proyección Académica */}
            <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-3">
                  📈 Análisis y Proyección Académica <span className="text-blue-600 font-bold">({alumnoActual.nombre})</span>
                </h3>

                {/* Banner de Score */}
                <div
                  className={`p-3.5 rounded-lg flex items-center gap-4 mb-3 border ${
                    alumnoActual.esRiesgoAlto ? "bg-rose-50 border-rose-200" : "bg-emerald-50 border-emerald-200"
                  }`}
                >
                  <div className="flex items-baseline gap-1">
                    <span
                      className={`text-3xl font-extrabold font-mono ${
                        alumnoActual.esRiesgoAlto ? "text-rose-600" : "text-emerald-600"
                      }`}
                    >
                      {alumnoActual.score}
                    </span>
                    <span className="text-xs text-slate-500 font-semibold">/ 100</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Índice Heurístico</span>
                    <span
                      className={`text-xs font-bold ${
                        alumnoActual.esRiesgoAlto ? "text-rose-700" : "text-emerald-700"
                      }`}
                    >
                      {alumnoActual.nivelRiesgo}
                    </span>
                  </div>
                </div>

                {/* Alerta de Examen Parcial */}
                <div className="p-3 bg-red-50 border border-red-200 border-l-4 border-l-red-600 rounded-lg text-xs text-red-900 mb-3 flex items-start gap-2.5">
                  <span className="text-base leading-none">⚠️</span>
                  <div>
                    <strong className="block text-red-950 font-bold mb-0.5">Riesgo de Desaprobación:</strong>
                    <p className="leading-relaxed">{alumnoActual.alertaExamen}</p>
                  </div>
                </div>

                {/* Caja Asistente Predictivo */}
                <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-950 flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 text-blue-700 font-bold uppercase text-[11px] tracking-wide">
                    <span>✨</span>
                    <span>Asistente Predictivo en Vivo</span>
                  </div>
                  <p className="text-[11.5px] leading-relaxed text-blue-900">
                    {alumnoActual.narrativa.replace(/\*\*(.*?)\*\*/g, "$1")}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200 text-[10.5px] text-slate-500 font-medium">
                🔮 Basado en AulaPredict v2.0 (Motor de Inferencia Explicable SHAP)
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AulaPredictDashboard;
