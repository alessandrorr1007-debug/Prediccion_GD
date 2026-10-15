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
function ocupar(valor) {
  enCurso = valor;
  for (const id of ["ejecutar", "motor", "cargar-ejemplo", "ejemplo-seguimiento", "archivo", "formato", "servidor"]) elemento(id).disabled = valor;
}
function limpiarResultado() {
  elemento("resultados-estudiantes").replaceChildren();
  elemento("nivel").textContent = "Sin evaluar";
  elemento("indice").textContent = "—";
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
  } finally { ocupar(false); }
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
  if (!textos.length) return;
  const encabezado = document.createElement("h4"); encabezado.textContent = titulo;
  const ul = document.createElement("ul");
  for (const texto of textos) { const li = document.createElement("li"); li.textContent = texto; ul.append(li); }
  contenedor.append(encabezado, ul);
}
function mostrarSeguimiento(salida) {
  const contenedor = elemento("resultados-estudiantes");
  const validos = salida.resultados.filter(r => r.indice_prioridad !== null);
  const maximo = validos.reduce((a, b) => !a || b.indice_prioridad > a.indice_prioridad ? b : a, null);
  elemento("indice").textContent = maximo ? maximo.indice_prioridad.toString() : "—";
  elemento("nivel").textContent = `DEMO SINTÉTICA · ${maximo ? maximo.nivel_revision : "datos insuficientes"}`;
  elemento("recomendacion").textContent = "Prioridades para revisión humana. Los avisos son sugerencias: no se envían mensajes ni se guardan historiales.";
  for (const r of salida.resultados) {
    const articulo = document.createElement("article"); articulo.className = "resultado-estudiante";
    const titulo = document.createElement("h3"); titulo.textContent = `${r.nombre || r.estudiante_id} · ${r.sesion_id}`;
    const nivel = document.createElement("p"); nivel.textContent = `${r.actividad} · ${r.nivel_revision.replaceAll("_", " ")} · prioridad ${r.indice_prioridad ?? "sin datos"}`;
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
  const archivo = evento.target.files[0];
  if (!archivo) return;
  try {
    if (archivo.size > 2 * 1024 * 1024) throw new Error("El JSON supera 2 MB.");
    const texto = await archivo.text();
    JSON.parse(texto);
    elemento("entrada").value = texto;
    elemento("estado").textContent = `Archivo cargado: ${archivo.name}. Selecciona su formato antes de evaluar.`;
  } catch (error) { elemento("estado").textContent = error.message; }
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
    elemento("estado").textContent = "Evaluando señales…";
    elemento("nivel").textContent = "Evaluando";
    elemento("indice").textContent = "—";
    elemento("recomendacion").textContent = "";
    elemento("salida").textContent = "";
    const respuesta = await fetch(`${base}${ruta}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo)
    });
    const salida = await respuesta.json();
    if (!respuesta.ok) throw new Error(typeof salida.detail === "string" ? salida.detail : JSON.stringify(salida.detail || salida));
    elemento("salida").textContent = JSON.stringify(salida, null, 2);
    if (seguimiento) mostrarSeguimiento(salida);
    else {
      elemento("nivel").textContent = (salida.nivel_revision || "datos_insuficientes").replaceAll("_", " ");
      elemento("indice").textContent = salida.indice_revision == null ? "—" : salida.indice_revision.toLocaleString("es-PE");
      elemento("recomendacion").textContent = salida.recomendacion;
    }
    elemento("estado").textContent = "Evaluación completada. Verifica la evidencia con una persona responsable.";
  } catch (error) {
    limpiarResultado();
    elemento("estado").textContent = `No se pudo evaluar: ${error.message}`;
    elemento("nivel").textContent = "Sin resultado válido";
    elemento("indice").textContent = "—";
    elemento("recomendacion").textContent = "Corrige la entrada y vuelve a evaluar.";
    elemento("salida").textContent = "";
  } finally { ocupar(false); }
});
