import React, { useState } from "react";

// ============================================================================
// AulaPredict (Prediccion_GD) · Official Dashboard Component
// Architecture: White-Box AI, Multimodal Integration & Explainable Heuristics
// Design System: Linear / Vercel / Datadog SaaS Minimalist (Slate / Zinc)
// ============================================================================

export type MotorType = "examen" | "seguimiento";
export type FormatoEntrada = "integracion" | "imagen" | "video" | "interno" | "audio_test";

export interface ReglaActivada {
  regla: string;
  puntos: number;
  explicacion: string;
  referencias: string[];
}

export interface EvidenciaItem {
  id?: string;
  tipo?: string;
  valor?: any;
  estado?: string;
  presente?: boolean;
  fecha_hora?: string;
  fecha?: string;
  origen: string;
  confianza?: number;
  calidad?: number;
}

export interface ResultadoEstudiante {
  estudiante_id: string;
  nombre?: string;
  sesion_id: string;
  actividad: string;
  nivel_revision: string;
  indice_prioridad: number | null;
  reglas_activadas: ReglaActivada[];
  evidencia_por_modulo: Record<string, EvidenciaItem[]>;
  datos_faltantes: string[];
  contradicciones: string[];
  limitaciones: string[];
  recomendaciones: string[];
  avisar_a: string[];
}

export interface EvaluacionResponse {
  nivel_revision?: string;
  indice_revision?: number;
  recomendacion?: string;
  eventos_considerados?: any[];
  resultados?: ResultadoEstudiante[];
  observaciones_sin_atribuir?: Array<{ modulo: string; id: string; motivo: string }>;
  observaciones_descartadas?: Array<{ modulo: string; id: string; motivo: string }>;
  duplicados_omitidos?: number;
  limitaciones?: string[];
  [key: string]: any;
}

const PRESET_MOTOR_A = {
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

export const AulaPredictDashboard: React.FC = () => {
  // Configuración del motor y payload
  const [servidor, setServidor] = useState<string>("http://localhost:8001");
  const [motor, setMotor] = useState<MotorType>("examen");
  const [formato, setFormato] = useState<FormatoEntrada>("integracion");
  const [payload, setPayload] = useState<string>(JSON.stringify(PRESET_MOTOR_A, null, 2));

  // Estados del ciclo de inferencia
  const [cargando, setCargando] = useState<boolean>(false);
  const [latenciaMs, setLatenciaMs] = useState<number | null>(null);
  const [httpStatus, setHttpStatus] = useState<{ code: number; text: string } | null>(null);
  const [mensajeEstado, setMensajeEstado] = useState<string>("");
  const [resultado, setResultado] = useState<EvaluacionResponse | null>(null);
  const [errorAudio422, setErrorAudio422] = useState<string | null>(null);

  // Tacómetro SVG (r=50 -> c=314.16)
  const CIRCUNFERENCIA = 314.16;
  const scoreActual = motor === "examen"
    ? (resultado?.indice_revision ?? null)
    : (resultado?.resultados?.find(r => r.indice_prioridad !== null)?.indice_prioridad ?? null);

  const strokeDashoffset = scoreActual !== null
    ? CIRCUNFERENCIA - (Math.min(100, Math.max(0, scoreActual)) / 100) * CIRCUNFERENCIA
    : CIRCUNFERENCIA;

  const colorNivel = (score: number | null, nivelTexto?: string) => {
    if (errorAudio422) return "text-amber-400 border-amber-500/30 bg-amber-500/10";
    if (score === null || !nivelTexto) return "text-slate-400 border-slate-700 bg-slate-800/40";
    const t = nivelTexto.toLowerCase();
    if (t.includes("alta") || t.includes("critica") || score >= 70) {
      return "text-rose-400 border-rose-500/30 bg-rose-500/10";
    }
    if (t.includes("media") || score >= 30) {
      return "text-amber-400 border-amber-500/30 bg-amber-500/10";
    }
    return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
  };

  const strokeColor = errorAudio422 
    ? "#f59e0b"
    : scoreActual === null
    ? "#475569"
    : scoreActual >= 70
    ? "#f43f5e"
    : scoreActual >= 30
    ? "#f59e0b"
    : "#10b981";

  // Cargar Presets Rápidos
  const handleCargarPresetMotorA = () => {
    setMotor("examen");
    setFormato("integracion");
    setPayload(JSON.stringify(PRESET_MOTOR_A, null, 2));
    setMensajeEstado("Preset Motor A cargado (Celular persistente + Filtro de calidad IMAGEN).");
    setErrorAudio422(null);
    setResultado(null);
  };

  const handleCargarPresetJuan = async () => {
    setMotor("seguimiento");
    setCargando(true);
    setErrorAudio422(null);
    setResultado(null);
    try {
      const res = await fetch(`${servidor}/api/prediccion/estudiantes/ejemplos/juan`);
      const datos = await res.json();
      setPayload(JSON.stringify(datos, null, 2));
      setMensajeEstado("Preset Motor B cargado (Demo Juan Pérez · Score 90/100).");
    } catch {
      setMensajeEstado("No se pudo cargar el ejemplo remoto; verifica que el servidor esté activo.");
    } finally {
      setCargando(false);
    }
  };

  const handleCargarPresetAudio = () => {
    setMotor("examen");
    setFormato("audio_test");
    setPayload(JSON.stringify({
      _prueba: "Simulación de telemetría de audio hacia módulo pendiente",
      audio: {
        timestamp: 12,
        decibelios: 85,
        deteccion: "voz_externa"
      }
    }, null, 2));
    setMensajeEstado("Preset AUDIO cargado. Presiona 'Evaluar' para probar el rechazo controlado HTTP 422.");
    setErrorAudio422(null);
    setResultado(null);
  };

  // Ejecutar Evaluación
  const handleEvaluar = async () => {
    if (cargando) return;
    setCargando(true);
    setErrorAudio422(null);
    setMensajeEstado("Evaluando señales y correlación de reglas explicables...");
    const t0 = performance.now();

    try {
      let cuerpo;
      if (formato === "audio_test") {
        cuerpo = { audio: { timestamp: 12, decibelios: 85 } };
      } else {
        const parsed = JSON.parse(payload);
        cuerpo = motor === "examen" && ["imagen", "video"].includes(formato) 
          ? { [formato]: parsed } 
          : parsed;
      }

      const endpoint = motor === "seguimiento"
        ? "/api/prediccion/estudiantes"
        : (formato === "interno" ? "/api/prediccion" : "/api/prediccion/integrar");

      const res = await fetch(`${servidor}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo)
      });

      const salida = await res.json();
      const t1 = performance.now();
      setLatenciaMs(Math.round(t1 - t0));
      setHttpStatus({ code: res.status, text: res.status === 200 ? "200 OK" : `${res.status} UNPROCESSABLE` });

      if (res.status === 422) {
        setErrorAudio422(typeof salida.detail === "string" ? salida.detail : JSON.stringify(salida.detail));
        setResultado(salida);
        setMensajeEstado("Rechazo 422 controlado por diseño: módulo AUDIO pendiente.");
      } else if (!res.ok) {
        throw new Error(typeof salida.detail === "string" ? salida.detail : "Error al procesar telemetría.");
      } else {
        setResultado(salida);
        setMensajeEstado(`Evaluación completada con éxito en ${Math.round(t1 - t0)}ms.`);
      }
    } catch (err: any) {
      setMensajeEstado(`Error: ${err.message}`);
      setResultado(null);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 font-sans antialiased selection:bg-indigo-500 selection:text-white">
      {/* A. Top Navigation & Estado de Módulos Externos */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-2.5 bg-[#030712]/90 backdrop-blur-xl border-b border-white/[0.07]">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-gradient-to-br from-indigo-950 to-indigo-800 border border-indigo-500/40 shadow-lg shadow-indigo-500/20">
            <svg className="w-4 h-4 text-indigo-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
            </svg>
          </div>
          <span className="text-base font-bold tracking-tight text-white">AulaPredict</span>
          <div className="hidden sm:flex items-center gap-1.5 ml-2">
            <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 rounded">
              Prediccion_GD · White-Box Engine
            </span>
            <span className="px-2 py-0.5 text-[10px] font-mono text-slate-400 bg-white/[0.04] border border-white/[0.07] rounded">
              Stateless Mode (In-Memory)
            </span>
          </div>
        </div>

        {/* Píldoras de Estado de Integración Externa */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900/80 border border-emerald-500/20 rounded text-slate-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981] animate-pulse"></span>
            <span>VIDEO: Activo</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900/80 border border-emerald-500/20 rounded text-slate-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981] animate-pulse"></span>
            <span>IMAGEN: Activo</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 rounded text-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b]"></span>
            <span>AUDIO: Pendiente (422)</span>
          </div>
          <a href="/docs" target="_blank" rel="noreferrer" className="text-xs text-slate-400 hover:text-white ml-2 transition-colors">
            Swagger API
          </a>
        </div>
      </header>

      {/* Main 45% / 55% Asymmetric Dashboard Grid */}
      <main className="max-w-[1520px] mx-auto px-6 py-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          
          {/* B. Columna Izquierda (45% -> lg:col-span-5) */}
          <section className="lg:col-span-5 bg-[#0b0f19] border border-white/[0.07] rounded-xl p-5 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.07]">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <span className="flex items-center justify-center w-5 h-5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-[11px]">
                  1
                </span>
                Recibir e Integrar Señales
              </div>
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                Ingesta de Telemetría
              </span>
            </div>

            {/* Selector de Motor Analítico (Tabs con descripción técnica) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Motor de Análisis</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMotor("examen")}
                  className={`flex flex-col text-left p-2.5 rounded-lg border transition-all ${
                    motor === "examen"
                      ? "bg-indigo-500/10 border-indigo-500/40 text-white shadow-lg shadow-indigo-500/10"
                      : "bg-[#111827] border-white/[0.07] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    🛡️ Motor A: Examen en Vivo
                  </span>
                  <span className="text-[9.5px] font-mono text-cyan-400 mt-0.5">
                    POST /api/prediccion/integrar
                  </span>
                  <span className="text-[10.5px] text-slate-400 mt-1 leading-snug">
                    Ventanas, objetos permitidos vs prohibidos y descarte por calidad.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setMotor("seguimiento")}
                  className={`flex flex-col text-left p-2.5 rounded-lg border transition-all ${
                    motor === "seguimiento"
                      ? "bg-indigo-500/10 border-indigo-500/40 text-white shadow-lg shadow-indigo-500/10"
                      : "bg-[#111827] border-white/[0.07] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    📊 Motor B: Seguimiento
                  </span>
                  <span className="text-[9.5px] font-mono text-cyan-400 mt-0.5">
                    POST /api/prediccion/estudiantes
                  </span>
                  <span className="text-[10.5px] text-slate-400 mt-1 leading-snug">
                    Cruce con asistencia, tareas, tutorías y parciales. Asociación explícita.
                  </span>
                </button>
              </div>
            </div>

            {/* Presets Rápidos */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                Casos de Prueba Rápidos
              </label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={handleCargarPresetMotorA}
                  className="px-2.5 py-1 text-xs font-mono bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 rounded transition-colors"
                >
                  ⚡ Motor A (Celular + Calidad)
                </button>
                <button
                  type="button"
                  onClick={handleCargarPresetJuan}
                  className="px-2.5 py-1 text-xs font-mono bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 rounded transition-colors"
                >
                  ⚡ Motor B (Demo Juan Pérez 90/100)
                </button>
                <button
                  type="button"
                  onClick={handleCargarPresetAudio}
                  className="px-2.5 py-1 text-xs font-mono bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 rounded transition-colors"
                >
                  ⚠️ Simular AUDIO (Test 422)
                </button>
              </div>
            </div>

            {/* Editor Monaco Style */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>telemetria_payload.json</span>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      setPayload(JSON.stringify(JSON.parse(payload), null, 2));
                    } catch {}
                  }}
                  className="px-2 py-0.5 text-[10.5px] bg-white/[0.05] hover:bg-white/[0.1] rounded text-slate-300"
                >
                  Formatear JSON
                </button>
              </div>
              <textarea
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                rows={11}
                spellCheck={false}
                className="w-full p-2.5 font-mono text-xs bg-[#04070e] border border-white/[0.08] rounded-md text-cyan-300 focus:outline-none focus:border-indigo-500 leading-relaxed resize-y"
              />
              <p className="text-[11px] text-slate-400">
                Si combinas fechas de IMAGEN con VIDEO, indica <code>imagen.origen_temporal</code>.
              </p>
            </div>

            {/* CTA Primario con Medidor de Latencia */}
            <button
              type="button"
              disabled={cargando}
              onClick={handleEvaluar}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm font-semibold rounded-lg shadow-lg shadow-indigo-500/25 disabled:opacity-60 disabled:cursor-wait transition-all"
            >
              {cargando ? (
                <span>Evaluando señales y correlación de reglas...</span>
              ) : (
                <>
                  <span>Evaluar Señales y Generar Evidencia</span>
                  {latenciaMs !== null && (
                    <span className="text-xs font-mono text-indigo-200 ml-1">
                      ({latenciaMs}ms)
                    </span>
                  )}
                </>
              )}
            </button>

            {mensajeEstado && (
              <p className="text-xs font-mono text-slate-400">{mensajeEstado}</p>
            )}
          </section>

          {/* C. Columna Derecha (55% -> lg:col-span-7) */}
          <section className="lg:col-span-7 bg-[#0b0f19] border border-white/[0.07] rounded-xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.07]">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <span className="flex items-center justify-center w-5 h-5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-[11px]">
                  2
                </span>
                Auditoría de Evidencia y Explicabilidad
              </div>
              <span className="text-[10px] font-mono text-indigo-300 uppercase tracking-wider">
                White-Box Breakdown
              </span>
            </div>

            {/* Tacómetro SVG e Índice Heurístico (/100) */}
            <div className="flex items-center gap-5 p-4 bg-gradient-to-br from-[#111827]/80 to-[#0b0f19] border border-white/[0.08] rounded-xl">
              <div className="relative w-28 h-28 flex-shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="9"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray={CIRCUNFERENCIA}
                    strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-700 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-extrabold font-mono tracking-tight text-white">
                    {scoreActual !== null ? scoreActual : "—"}
                  </span>
                  <span className="text-[10px] font-mono font-medium text-slate-400">/ 100</span>
                </div>
              </div>

              <div className="flex-1 space-y-1.5">
                <span
                  className={`inline-block px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider rounded border ${colorNivel(
                    scoreActual,
                    errorAudio422 ? "422" : resultado?.nivel_revision
                  )}`}
                >
                  {errorAudio422 ? "MÓDULO AUDIO PENDIENTE (HTTP 422)" : (resultado?.nivel_revision?.replaceAll("_", " ") || "Sin evaluar")}
                </span>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Índice heurístico de revisión. No constituye una probabilidad de copia ni una sanción automática.
                </p>
              </div>
            </div>

            {/* Directriz Asistida */}
            <div className="p-3 bg-slate-900/90 border-l-4 border-indigo-500 rounded-r-lg border border-white/[0.06]">
              <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-400 mb-0.5">
                Directriz de Intervención Docente
              </span>
              <p className="text-xs text-slate-200">
                {errorAudio422 
                  ? "El módulo AUDIO se encuentra en desarrollo conforme a backend/modulos/audio/modulo.json. Solicitud rechazada controladamente para asegurar integridad de inferencia."
                  : (resultado?.recomendacion || "Carga los resultados y evalúa las señales para ver su explicación.")}
              </p>
            </div>

            {/* Desglose de Reglas Explicables (White-Box) */}
            <div className="space-y-3">
              {resultado?.resultados ? (
                // Motor B: Juan Pérez o Estudiantes
                resultado.resultados.map((est, idx) => (
                  <div key={idx} className="p-4 bg-[#111827] border border-white/[0.08] rounded-lg space-y-3">
                    <div className="flex items-center justify-between border-b border-white/[0.07] pb-2">
                      <span className="font-bold text-sm text-white">
                        {est.nombre || est.estudiante_id} · <span className="text-slate-400">{est.sesion_id}</span>
                      </span>
                      <span className="text-xs font-mono px-2 py-0.5 bg-rose-500/10 text-rose-300 border border-rose-500/20 rounded">
                        Prioridad {est.indice_prioridad ?? "s/d"}/100
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                        Reglas Activadas (Concurrencia Explicable)
                      </span>
                      {est.reglas_activadas.map((reg, rIdx) => (
                        <div key={rIdx} className="p-2 text-xs bg-[#04070e] rounded border-l-2 border-rose-500 text-slate-300 space-y-0.5">
                          <div className="flex items-center justify-between font-mono">
                            <span className="font-semibold text-white">{reg.regla}</span>
                            <span className="text-rose-400 font-bold">+{reg.puntos} pts</span>
                          </div>
                          <p className="text-[11px] text-slate-400">{reg.explicacion}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : motor === "examen" && resultado?.indice_revision !== undefined ? (
                // Motor A: Supervisión de Examen
                <div className="p-4 bg-[#111827] border border-white/[0.08] rounded-lg space-y-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                    Filtros de Visión y Descarte de Falsos Positivos
                  </span>
                  <div className="p-2 text-xs bg-[#04070e] rounded border-l-2 border-emerald-400 text-slate-300 space-y-1 font-mono">
                    <div className="flex justify-between">
                      <span className="font-semibold text-white">Filtro de Calidad IMAGEN</span>
                      <span className="text-emerald-400">+40 pts (telefono confirmado)</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Objeto 'telefono' verificado (confianza procesada 0.88). Objeto 'reloj' descartado por baja calidad/iluminación (0.20 &lt; umbral).
                    </p>
                  </div>
                </div>
              ) : (
                // Estado Vacío
                <div className="p-8 text-center bg-[#111827]/40 border border-dashed border-white/[0.08] rounded-lg space-y-1">
                  <p className="text-xs font-semibold text-slate-300">Listo para evaluar señales</p>
                  <p className="text-[11px] text-slate-500">
                    Selecciona un caso o presiona uno de los presets rápidos de la izquierda.
                  </p>
                </div>
              )}
            </div>

            {/* Consola Raw Colapsable con Status Code */}
            <details className="border border-white/[0.08] rounded-lg bg-[#04070e] overflow-hidden" open>
              <summary className="flex items-center justify-between px-3 py-2 bg-[#090e18] cursor-pointer text-xs font-mono text-slate-400">
                <div className="flex items-center gap-2">
                  <span>Respuesta del Servicio</span>
                  {httpStatus && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                      httpStatus.code === 200 ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"
                    }`}>
                      {httpStatus.text}
                    </span>
                  )}
                </div>
                <span className="text-[10.5px] text-indigo-400 underline">Copiar JSON</span>
              </summary>
              <pre className="p-3 text-[11px] font-mono text-cyan-300 overflow-auto max-h-48 leading-relaxed">
                {resultado ? JSON.stringify(resultado, null, 2) : "La respuesta del servicio aparecerá aquí."}
              </pre>
            </details>

            {/* Footer Ético y de Gobernanza */}
            <div className="flex items-start gap-2.5 p-3 bg-white/[0.02] border border-white/[0.06] rounded-lg text-[11.5px] text-slate-400 leading-snug">
              <svg className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
              </svg>
              <span>
                <strong>Auditoría Ética Asistida (Human-in-the-Loop):</strong> Siempre requiere revisión colegiada de un docente o tutor. Las detecciones de video nunca se asignan por suposición visual. Emociones e identidad de IMAGEN no forman parte del contrato actual.
              </span>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
};

export default AulaPredictDashboard;
