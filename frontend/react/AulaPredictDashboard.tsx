import React, { useState, useEffect } from "react";

// ============================================================================
// AulaPredict · Dashboard Analítico UI/UX (React + Tailwind CSS)
// Estilo SaaS Vercel / Linear / Datadog
// ============================================================================

export type MotorType = "examen" | "seguimiento";
export type FormatoEntrada = "integracion" | "imagen" | "video" | "interno";

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
  resultados?: ResultadoEstudiante[];
  observaciones_sin_atribuir?: Array<{ modulo: string; id: string; motivo: string }>;
  observaciones_descartadas?: Array<{ modulo: string; id: string; motivo: string }>;
  duplicados_omitidos?: number;
  limitaciones?: string[];
  [key: string]: any;
}

const EJEMPLO_EXAMEN = {
  _nota: "SINTÉTICO: ejemplo de integración, pendiente de validar con salidas reales",
  segundo_actual: 12,
  objetos_permitidos: ["libro"],
  video: {
    frames: [
      {
        frame_id: 80,
        timestamp: 10,
        detecciones: [{ clase: "telefono", confianza: 0.82 }]
      }
    ]
  },
  imagen: {
    frames: [
      {
        frame_id: 80,
        timestamp: 10,
        objetos: [
          {
            id: "objeto-1",
            clase: "telefono",
            confianza_procesada: 0.88,
            estado: "confirmada"
          }
        ]
      }
    ]
  }
};

export const AulaPredictDashboard: React.FC = () => {
  // Estados reactivos principales
  const [servidor, setServidor] = useState<string>("http://localhost:8001");
  const [motor, setMotor] = useState<MotorType>("examen");
  const [formato, setFormato] = useState<FormatoEntrada>("integracion");
  const [ejemploSeguimiento, setEjemploSeguimiento] = useState<string>("juan");
  const [payload, setPayload] = useState<string>(JSON.stringify(EJEMPLO_EXAMEN, null, 2));

  // Estados del ciclo de inferencia
  const [cargando, setCargando] = useState<boolean>(false);
  const [mensajeEstado, setMensajeEstado] = useState<string>("");
  const [resultado, setResultado] = useState<EvaluacionResponse | null>(null);
  const [errorEvaluacion, setErrorEvaluacion] = useState<string | null>(null);

  // Tacómetro SVG dinámico (Radio = 50 -> Circunferencia = 314.16)
  const CIRCUNFERENCIA = 314.16;
  const scoreActual = motor === "examen" 
    ? (resultado?.indice_revision ?? null)
    : (resultado?.resultados?.find(r => r.indice_prioridad !== null)?.indice_prioridad ?? null);

  const strokeDashoffset = scoreActual !== null 
    ? CIRCUNFERENCIA - (Math.min(100, Math.max(0, scoreActual)) / 100) * CIRCUNFERENCIA
    : CIRCUNFERENCIA;

  const colorNivel = (score: number | null, nivelTexto?: string) => {
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

  const strokeColor = scoreActual === null 
    ? "#475569" 
    : scoreActual >= 70 
    ? "#f43f5e" 
    : scoreActual >= 30 
    ? "#f59e0b" 
    : "#10b981";

  // Cargar ejemplo sintético para seguimiento
  const handleCargarEjemploSeguimiento = async () => {
    setCargando(true);
    setResultado(null);
    setErrorEvaluacion(null);
    try {
      const res = await fetch(`${servidor}/api/prediccion/estudiantes/ejemplos/${encodeURIComponent(ejemploSeguimiento)}`);
      const datos = await res.json();
      if (!res.ok) throw new Error(datos.detail || "Error al cargar el escenario sintético.");
      setPayload(JSON.stringify(datos, null, 2));
      setMensajeEstado(`Escenario sintético '${ejemploSeguimiento}' cargado con éxito.`);
    } catch (err: any) {
      setErrorEvaluacion(err.message);
    } finally {
      setCargando(false);
    }
  };

  // Ejecución de inferencia
  const handleEvaluar = async () => {
    if (cargando) return;
    setCargando(true);
    setErrorEvaluacion(null);
    setMensajeEstado("Evaluando señales y correlación de reglas...");
    try {
      const parsed = JSON.parse(payload);
      const esSeguimiento = motor === "seguimiento";
      const cuerpo = !esSeguimiento && ["imagen", "video"].includes(formato) 
        ? { [formato]: parsed } 
        : parsed;

      const endpoint = esSeguimiento 
        ? "/api/prediccion/estudiantes" 
        : (formato === "interno" ? "/api/prediccion" : "/api/prediccion/integrar");

      const res = await fetch(`${servidor}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo)
      });

      const salida = await res.json();
      if (!res.ok) throw new Error(typeof salida.detail === "string" ? salida.detail : JSON.stringify(salida.detail || salida));

      setResultado(salida);
      setMensajeEstado("Evaluación finalizada. Requiere auditoría humana.");
    } catch (err: any) {
      setErrorEvaluacion(err.message);
      setResultado(null);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080b11] text-slate-100 font-sans antialiased selection:bg-indigo-500 selection:text-white">
      {/* 1. Header / Navbar SaaS */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-3.5 bg-[#080b11]/80 backdrop-blur-xl border-b border-white/[0.07]">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-950 to-indigo-800 border border-indigo-500/40 shadow-lg shadow-indigo-500/20">
            <svg className="w-4 h-4 text-indigo-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight text-white">AulaPredict</span>
          <div className="hidden sm:flex items-center gap-1.5 ml-2">
            <span className="px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded">
              PREDICCIÓN / INTEGRACIÓN
            </span>
            <span className="px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-400 bg-white/[0.04] border border-white/[0.07] rounded">
              REGLAS EXPLICABLES
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 text-xs font-mono text-slate-300 bg-slate-900/80 border border-white/[0.08] rounded-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981] animate-pulse"></span>
            <span>API :8001 LIVE</span>
          </div>
          <a
            href="/docs"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            Swagger API
          </a>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Subheader & Ethical Banner */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Centro de Integración y Reglas Explicables
            </h1>
            <p className="text-xs text-slate-400">De las señales a la revisión humana colegiada</p>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 text-xs text-slate-300 bg-indigo-500/[0.06] border border-indigo-500/20 rounded-lg">
            <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11 15h2v2h-2zm0-8h2v6h-2zm1-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
            </svg>
            <span>
              <strong className="text-indigo-200">Aviso de Sistema:</strong> Módulo AUDIO pendiente de contrato externo. El sistema no emite sanciones ni diagnósticos automáticos; calcula un índice heurístico para revisión profesional.
            </span>
          </div>
        </div>

        {/* 2-Column Responsive SaaS Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          
          {/* PANEL IZQUIERDO: Ingesta y Configuración */}
          <section className="bg-[#0f1523] border border-white/[0.07] rounded-xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.07]">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <span className="flex items-center justify-center w-5 h-5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-[11px]">
                  1
                </span>
                Recibir resultados
              </div>
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                Ingesta Telemetría
              </span>
            </div>

            {/* Selector de Motor (Tabs SaaS) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Motor de Análisis</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMotor("examen")}
                  className={`flex flex-col text-left p-3 rounded-lg border transition-all ${
                    motor === "examen"
                      ? "bg-indigo-500/10 border-indigo-500/40 text-white shadow-lg shadow-indigo-500/10"
                      : "bg-[#161e31] border-white/[0.07] text-slate-400 hover:text-slate-200 hover:border-white/[0.15]"
                  }`}
                >
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    🛡️ Supervisión de exámenes
                  </span>
                  <span className="text-[10.5px] text-slate-400 mt-0.5">
                    Sesiones de evaluación en vivo
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setMotor("seguimiento")}
                  className={`flex flex-col text-left p-3 rounded-lg border transition-all ${
                    motor === "seguimiento"
                      ? "bg-indigo-500/10 border-indigo-500/40 text-white shadow-lg shadow-indigo-500/10"
                      : "bg-[#161e31] border-white/[0.07] text-slate-400 hover:text-slate-200 hover:border-white/[0.15]"
                  }`}
                >
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    📊 Seguimiento académico
                  </span>
                  <span className="text-[10.5px] text-slate-400 mt-0.5">
                    Evaluación longitudinal (Demo)
                  </span>
                </button>
              </div>
            </div>

            {/* Configuración de Servidor API */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Dirección del Servicio API</label>
              <input
                type="url"
                value={servidor}
                onChange={(e) => setServidor(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-[#090e18] border border-white/[0.09] rounded-md text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Controles para Supervisión de Examen */}
            {motor === "examen" && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Formato de Entrada</label>
                <select
                  value={formato}
                  onChange={(e) => setFormato(e.target.value as FormatoEntrada)}
                  className="w-full px-3 py-2 text-xs bg-[#090e18] border border-white/[0.09] rounded-md text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="integracion">Entrada conjunta (imagen / video)</option>
                  <option value="imagen">Exportación de IMAGEN</option>
                  <option value="video">Alerta o fotogramas de VIDEO</option>
                  <option value="interno">Eventos normalizados del motor</option>
                </select>
              </div>
            )}

            {/* Controles para Seguimiento de Estudiantes */}
            {motor === "seguimiento" && (
              <div className="p-3.5 bg-[#161e31]/60 border border-indigo-500/20 rounded-lg space-y-2">
                <label className="text-xs font-semibold text-slate-300">Escenario Sintético</label>
                <div className="flex gap-2">
                  <select
                    value={ejemploSeguimiento}
                    onChange={(e) => setEjemploSeguimiento(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-xs bg-[#090e18] border border-white/[0.09] rounded-md text-slate-200 focus:outline-none"
                  >
                    <option value="juan">Juan Pérez · Concurrencia de factores</option>
                    <option value="sin_alerta">Escenario de control · Sin alerta</option>
                    <option value="identidad_desconocida">Identidad desconocida</option>
                    <option value="insuficientes">Muestra insuficiente</option>
                    <option value="contradictorio">Observaciones contradictorias</option>
                    <option value="duplicados">Telemetría redundante</option>
                    <option value="aislado">Observación aislada</option>
                    <option value="cambio_patron">Desviación histórica</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleCargarEjemploSeguimiento}
                    className="px-3 py-1.5 text-xs font-medium text-indigo-300 bg-indigo-500/20 border border-indigo-500/30 rounded-md hover:bg-indigo-500/30 transition-colors"
                  >
                    Cargar
                  </button>
                </div>
              </div>
            )}

            {/* Editor Monaco / CodeMirror Style */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>payload.json</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        setPayload(JSON.stringify(JSON.parse(payload), null, 2));
                      } catch {}
                    }}
                    className="px-2 py-0.5 text-[11px] bg-white/[0.05] hover:bg-white/[0.1] rounded text-slate-300 transition-colors"
                  >
                    Formatear
                  </button>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(payload)}
                    className="px-2 py-0.5 text-[11px] bg-white/[0.05] hover:bg-white/[0.1] rounded text-slate-300 transition-colors"
                  >
                    Copiar
                  </button>
                </div>
              </div>
              <textarea
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                rows={12}
                spellCheck={false}
                className="w-full p-3 font-mono text-xs bg-[#070a12] border border-white/[0.08] rounded-md text-cyan-300 focus:outline-none focus:border-indigo-500 leading-relaxed resize-y"
              />
              <p className="text-[11px] text-slate-400">
                Si combinas fechas de IMAGEN con VIDEO, indica <code>imagen.origen_temporal</code>.
              </p>
            </div>

            {/* CTA Button */}
            <button
              type="button"
              disabled={cargando}
              onClick={handleEvaluar}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm font-semibold rounded-lg shadow-lg shadow-indigo-500/25 disabled:opacity-60 disabled:cursor-wait transition-all"
            >
              {cargando ? (
                <>
                  <svg className="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                  <span>Procesando señales y evaluando reglas...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  <span>Evaluar señales</span>
                </>
              )}
            </button>

            {mensajeEstado && (
              <p className="text-xs font-mono text-slate-400">{mensajeEstado}</p>
            )}
            {errorEvaluacion && (
              <p className="text-xs font-mono text-rose-400 bg-rose-500/10 p-2.5 rounded border border-rose-500/20">
                {errorEvaluacion}
              </p>
            )}
          </section>

          {/* PANEL DERECHO: Resultados e Inspección */}
          <section className="bg-[#0f1523] border border-white/[0.07] rounded-xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.07]">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <span className="flex items-center justify-center w-5 h-5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-[11px]">
                  2
                </span>
                Revisar evidencia
              </div>
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                Auditoría Explicable
              </span>
            </div>

            {/* Tacómetro / Card de Métrica */}
            <div className="flex items-center gap-5 p-4 bg-gradient-to-br from-[#161e31]/80 to-[#0f1523] border border-white/[0.08] rounded-xl">
              <div className="relative w-28 h-28 flex-shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="rgba(255,255,255,0.06)"
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
                    resultado?.nivel_revision
                  )}`}
                >
                  {resultado?.nivel_revision?.replaceAll("_", " ") || "Sin evaluar"}
                </span>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Índice heurístico de revisión. No constituye una probabilidad ni una sanción automática.
                </p>
              </div>
            </div>

            {/* Directriz de Recomendación */}
            <div className="p-3.5 bg-slate-900/80 border-l-4 border-indigo-500 rounded-r-lg border border-white/[0.06]">
              <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-400 mb-0.5">
                Directriz Asistida
              </span>
              <p className="text-xs text-slate-200">
                {resultado?.recomendacion || "Carga los resultados y evalúa las señales para ver su explicación."}
              </p>
            </div>

            {/* Desglose de Reglas / Explicabilidad */}
            <div className="space-y-3">
              {resultado?.resultados ? (
                // Seguimiento por Estudiante
                resultado.resultados.map((est, idx) => (
                  <div key={idx} className="p-4 bg-[#161e31] border border-white/[0.08] rounded-lg space-y-3">
                    <div className="flex items-center justify-between border-b border-white/[0.07] pb-2">
                      <span className="font-bold text-sm text-white">
                        {est.nombre || est.estudiante_id} · <span className="text-slate-400">{est.sesion_id}</span>
                      </span>
                      <span className="text-xs font-mono px-2 py-0.5 bg-white/[0.05] rounded text-indigo-300">
                        Prioridad {est.indice_prioridad ?? "s/d"}
                      </span>
                    </div>

                    {/* Reglas Activadas */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                        Reglas Activadas
                      </span>
                      {est.reglas_activadas.length > 0 ? (
                        est.reglas_activadas.map((reg, rIdx) => (
                          <div key={rIdx} className="p-2 text-xs bg-[#090e18] rounded border-l-2 border-cyan-400 text-slate-300 space-y-0.5">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-white">{reg.regla}</span>
                              <span className="text-emerald-400 font-mono">+{reg.puntos} pts</span>
                            </div>
                            <p className="text-[11.5px] text-slate-400">{reg.explicacion}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400 italic">No se activaron reglas de alerta.</p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                // Estado Vacío
                <div className="p-8 text-center bg-[#161e31]/30 border border-dashed border-white/[0.08] rounded-lg space-y-1.5">
                  <svg className="w-7 h-7 mx-auto text-slate-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                  </svg>
                  <p className="text-xs font-semibold text-slate-300">Listo para evaluar señales</p>
                  <p className="text-[11px] text-slate-500">
                    Selecciona un escenario o importa un JSON y presiona "Evaluar señales".
                  </p>
                </div>
              )}
            </div>

            {/* Consola Raw Colapsable */}
            <details className="border border-white/[0.08] rounded-lg bg-[#070a12] overflow-hidden">
              <summary className="flex items-center justify-between px-3.5 py-2.5 bg-[#0d121f] cursor-pointer text-xs font-mono text-slate-400 hover:text-slate-200">
                <span>Respuesta completa del servicio</span>
                <span className="text-[11px] text-indigo-400 underline">Copiar Raw</span>
              </summary>
              <pre className="p-3 text-[11px] font-mono text-cyan-300 overflow-auto max-h-56 leading-relaxed">
                {resultado ? JSON.stringify(resultado, null, 2) : "La respuesta del servicio aparecerá aquí."}
              </pre>
            </details>
          </section>

        </div>

        {/* Footer Legal */}
        <footer className="p-4 text-center text-xs text-slate-400 bg-white/[0.02] border border-white/[0.05] rounded-lg">
          <strong>AulaPredict Analytics:</strong> Siempre requiere revisión humana colegiada. No constituye un diagnóstico ni una sanción. Emociones e identidad de IMAGEN aún no están disponibles en el contrato actual.
        </footer>
      </main>
    </div>
  );
};

export default AulaPredictDashboard;
