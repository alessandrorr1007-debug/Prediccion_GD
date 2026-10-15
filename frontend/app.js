"use strict";

const elemento = (id) => document.getElementById(id);

const ejemplo = {
  _nota: "SINTÉTICO: ejemplo de integración, pendiente de validar con salidas reales",
  segundo_actual: 12,
  objetos_permitidos: ["libro"],
  video: { frames: [{ frame_id: 80, timestamp: 10, detecciones: [{ clase: "telefono", confianza: 0.82 }] }] },
  imagen: { frames: [{ frame_id: 80, timestamp: 10, objetos: [{ id: "objeto-1", clase: "telefono", confianza_procesada: 0.88, estado: "confirmada" }] }] }
};

elemento("entrada").value = JSON.stringify(ejemplo, null, 2);
elemento("servidor").value = location.protocol === "file:" ? "http://localhost:8001" : location.origin;

let enCurso = false;
let motorActual = "examen";
const entradas = { examen: elemento("entrada").value, seguimiento: null };

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
  if (t.includes("alta") || t.includes("critica") || t.includes("crítica")) {
    el.className = "alerta-alta";
  } else if (t.includes("media") || t.includes("moderada")) {
    el.className = "alerta-media";
  } else if (t.includes("baja") || t.includes("sin alerta") || t.includes("sin_alerta") || t.includes("sin evaluar")) {
    el.className = "alerta-baja";
  } else {
    el.className = "";
  }
}

function sincronizarTabsMotor(valor) {
  const tabExamen = elemento("tab-motor-examen");
  const tabSeguimiento = elemento("tab-motor-seguimiento");
  if (tabExamen && tabExamen.classList) {
    if (valor === "examen") {
      tabExamen.classList.add("active");
      tabExamen.setAttribute("aria-selected", "true");
      if (tabSeguimiento) {
        tabSeguimiento.classList.remove("active");
        tabSeguimiento.setAttribute("aria-selected", "false");
      }
    } else {
      tabExamen.classList.remove("active");
      tabExamen.setAttribute("aria-selected", "false");
      if (tabSeguimiento) {
        tabSeguimiento.classList.add("active");
        tabSeguimiento.setAttribute("aria-selected", "true");
      }
    }
  }
}

function ocupar(valor) {
  enCurso = valor;
  const ids = [
    "ejecutar", "motor", "cargar-ejemplo", "ejemplo-seguimiento",
    "archivo", "formato", "servidor", "tab-motor-examen", "tab-motor-seguimiento"
  ];
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
    elemento("estado").textContent = "Ejemplo SINTÉTICO cargado. Puedes editarlo y evaluar.";
  } catch (error) {
    elemento("entrada").value = "";
    elemento("estado").textContent = `No se pudo cargar: ${error.message}. También puedes importar un JSON sintético de ejemplos/.`;
  } finally {
    ocupar(false);
  }
}

elemento("motor").addEventListener("change", async () => {
  entradas[motorActual] = elemento("entrada").value;
  motorActual = elemento("motor").value;
  sincronizarTabsMotor(motorActual);
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
    elemento("estado").textContent = "Evaluando señales y reglas heurísticas…";
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
    elemento("estado").textContent = "Evaluación completada. Verifica la evidencia con una persona responsable.";
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

// Segmented Control Tabs (Supervisión vs Seguimiento)
const tabExamen = elemento("tab-motor-examen");
if (tabExamen) {
  tabExamen.addEventListener("click", () => {
    if (elemento("motor").value !== "examen") {
      elemento("motor").value = "examen";
      elemento("motor").dispatchEvent(new Event("change"));
    }
  });
}

const tabSeguimiento = elemento("tab-motor-seguimiento");
if (tabSeguimiento) {
  tabSeguimiento.addEventListener("click", () => {
    if (elemento("motor").value !== "seguimiento") {
      elemento("motor").value = "seguimiento";
      elemento("motor").dispatchEvent(new Event("change"));
    }
  });
}

// Botones de utilidad para el editor y visor
const btnFormatear = elemento("btn-formatear");
if (btnFormatear) {
  btnFormatear.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(elemento("entrada").value);
      elemento("entrada").value = JSON.stringify(parsed, null, 2);
      elemento("estado").textContent = "JSON formateado correctamente.";
    } catch {
      elemento("estado").textContent = "JSON inválido: verifica la sintaxis antes de formatear.";
    }
  });
}

const btnCopiarEntrada = elemento("btn-copiar-entrada");
if (btnCopiarEntrada) {
  btnCopiarEntrada.addEventListener("click", async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(elemento("entrada").value);
        elemento("estado").textContent = "Payload copiado al portapapeles.";
      }
    } catch {}
  });
}

const btnCopiarSalida = elemento("btn-copiar-salida");
if (btnCopiarSalida) {
  btnCopiarSalida.addEventListener("click", async (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(elemento("salida").textContent);
        elemento("estado").textContent = "Respuesta JSON copiada al portapapeles.";
      }
    } catch {}
  });
}
