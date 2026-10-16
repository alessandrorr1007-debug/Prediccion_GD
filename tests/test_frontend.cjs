// Pruebas funcionales del controlador con DOM mínimo y API real local.
// No sustituyen una revisión visual en navegador. Sin paquetes npm adicionales.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve, join } = require("node:path");
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const vm = require("node:vm");

const raiz = resolve(__dirname, "..");
let proceso, base, errorServidor = "";
before(async () => {
  const socket = createServer();
  await new Promise(ok => socket.listen(0, "127.0.0.1", ok));
  const puerto = socket.address().port;
  await new Promise(ok => socket.close(ok));
  base = `http://127.0.0.1:${puerto}`;
  const python = process.env.PYTHON_FOR_TESTS || join(raiz, "backend", ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  proceso = spawn(python, ["-B", "-m", "uvicorn", "backend.app:app", "--host", "127.0.0.1", "--port", String(puerto), "--no-access-log"],
    { cwd: raiz, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  proceso.stderr.on("data", datos => { errorServidor += datos.toString(); });
  let fallo;
  proceso.on("error", error => { fallo = error; });
  for (let i = 0; i < 200; i++) {
    if (fallo) throw fallo;
    if (proceso.exitCode !== null) throw new Error(errorServidor);
    try { if ((await fetch(`${base}/api/salud`)).ok) return; } catch {}
    await new Promise(ok => setTimeout(ok, 50));
  }
  throw new Error(`El servidor de prueba no inició: ${errorServidor}`);
});
after(() => { if (proceso && proceso.exitCode === null) proceso.kill(); });

class Elemento {
  constructor() { this.value = ""; this.textContent = ""; this.children = []; this.listeners = {}; this.hidden = false; this.disabled = false; }
  addEventListener(nombre, fn) { this.listeners[nombre] = fn; }
  append(...hijos) { this.children.push(...hijos); }
  replaceChildren(...hijos) { this.children = hijos; }
}
function montar() {
  const html = readFileSync(join(raiz, "frontend/index.html"), "utf8");
  const elementos = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1], new Elemento()]));
  elementos.motor.value = "examen";
  elementos.formato.value = "integracion";
  elementos["ejemplo-seguimiento"].value = "juan";
  const contexto = vm.createContext({
    document: { getElementById(id) { assert.ok(elementos[id], `Control inexistente: ${id}`); return elementos[id]; }, createElement() { return new Elemento(); } },
    location: { origin: base, protocol: "http:" }, URL, fetch,
  });
  vm.runInContext(readFileSync(join(raiz, "frontend/app.js"), "utf8"), contexto);
  return elementos;
}
function contenido(e) { return e.textContent + e.children.map(contenido).join(" "); }

test("supervisión conserva el flujo de integración anterior", async () => {
  const e = montar();
  await e.ejecutar.listeners.click();
  const salida = JSON.parse(e.salida.textContent);
  assert.ok("indice_revision" in salida);
  assert.ok(!("resultados" in salida));
  assert.equal(e.motor.disabled, false);
});
test("seleccionar seguimiento carga ejemplo y muestra identidad, reglas y evidencia", async () => {
  const e = montar();
  e.motor.value = "seguimiento";
  await e.motor.listeners.change();
  assert.equal(e["controles-examen"].hidden, true);
  assert.equal(JSON.parse(e.entrada.value).simulado, true);
  await e.ejecutar.listeners.click();
  assert.equal(e.indice.textContent, "90");
  const texto = contenido(e["resultados-estudiantes"]);
  assert.match(texto, /Juan Pérez/);
  assert.match(texto, /presencia_recurrente_celular/);
  assert.match(texto, /Evidencia · contexto/);
  assert.match(texto, /Datos faltantes/);
  assert.match(texto, /Recomendaciones/);
});
test("identidad desconocida muestra insuficiencia y observaciones sin atribuir", async () => {
  const e = montar(); e.motor.value = "seguimiento";
  await e.motor.listeners.change();
  e["ejemplo-seguimiento"].value = "identidad_desconocida";
  await e["cargar-ejemplo"].listeners.click();
  await e.ejecutar.listeners.click();
  assert.equal(e.indice.textContent, "—");
  assert.match(contenido(e["resultados-estudiantes"]), /Observaciones sin atribuir/);
});
test("alternar motores conserva entradas separadas y un error limpia resultados anteriores", async () => {
  const e = montar(); const examen = e.entrada.value;
  e.motor.value = "seguimiento"; await e.motor.listeners.change();
  const seguimiento = e.entrada.value;
  await e.ejecutar.listeners.click();
  e.entrada.value = "{incorrecto";
  await e.ejecutar.listeners.click();
  assert.equal(e.salida.textContent, "");
  assert.equal(e["resultados-estudiantes"].children.length, 0);
  assert.equal(e.ejecutar.disabled, false);
  e.entrada.value = seguimiento;
  e.motor.value = "examen"; await e.motor.listeners.change();
  assert.equal(e.entrada.value, examen);
  e.motor.value = "seguimiento"; await e.motor.listeners.change();
  assert.equal(e.entrada.value, seguimiento);
});
