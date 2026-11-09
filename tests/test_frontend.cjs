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
  constructor() {
    this.value = ""; this.textContent = ""; this.children = []; this.listeners = {};
    this.hidden = false; this.disabled = false; this.style = {};
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  addEventListener(nombre, fn) { this.listeners[nombre] = fn; }
  querySelectorAll() { return []; }
  append(...hijos) { this.children.push(...hijos); }
  replaceChildren(...hijos) { this.children = hijos; }
}
function montar(globales = {}, configurar = () => {}) {
  const html = readFileSync(join(raiz, "frontend/index.html"), "utf8");
  const elementos = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1], new Elemento()]));
  elementos.motor.value = "examen";
  elementos.formato.value = "integracion";
  elementos["ejemplo-seguimiento"].value = "juan";
  elementos["auto-capture-enabled"].checked = true;
  elementos["auto-capture-interval"].value = "5";
  const contexto = vm.createContext({
    document: {
      getElementById(id) { assert.ok(elementos[id], `Control inexistente: ${id}`); return elementos[id]; },
      createElement(tag) {
        return tag === "canvas"
          ? { getContext: () => ({ drawImage() {} }), toDataURL: () => "data:image/jpeg;base64,DEMO" }
          : new Elemento();
      }
    },
    location: { origin: base, protocol: "http:" }, URL, fetch,
    AbortController, setTimeout, clearTimeout, ...globales,
  });
  configurar(elementos);
  vm.runInContext(readFileSync(join(raiz, "frontend/app.js"), "utf8"), contexto);
  if (globales.crearDetectorAlternativo) {
    vm.runInContext("cargarMediaPipe = crearDetectorAlternativo;", contexto);
  }
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

test("el acceso del panel abre seguimiento y muestra la coincidencia con sus fuentes", async () => {
  const e = montar();
  e["ejemplo-seguimiento"].value = "coincidencia";
  await e["abrir-seguimiento"].listeners.click();
  assert.equal(e["technical-drawer"].open, true);
  assert.equal(e.motor.value, "seguimiento");
  await e.ejecutar.listeners.click();
  const texto = contenido(e["resultados-estudiantes"]);
  assert.match(texto, /ID demo-juan · sesión demo-01/);
  assert.match(texto, /Coincidencia contextual/);
  assert.match(texto, /tarea-demo-1/);
  assert.match(texto, /Evento familiar declarado \(simulado\)/);
  assert.match(texto, /Destinatarios sugeridos/);
});

function montarCamara({ usarNativo = true, alternativo, responder } = {}) {
  let reloj = 0;
  let siguienteId = 0;
  let detecciones = 0;
  let rostros = [];
  let detenidas = 0;
  const timers = new Map();
  const peticiones = [];
  const track = { stop() { detenidas++; }, addEventListener() {} };
  const vacia = () => Response.json({ total_alumnos: 0, estudiantes: [] });
  const e = montar({
    navigator: { mediaDevices: { async getUserMedia(opciones) {
      assert.equal(opciones.audio, false);
      return { getTracks: () => [track] };
    } } },
    FaceDetector: usarNativo ? class { async detect() { detecciones++; return rostros; } } : undefined,
    crearDetectorAlternativo: alternativo || (async () => { throw new Error("Detector no disponible"); }),
    performance: { now: () => reloj },
    setTimeout(fn, ms) { const id = ++siguienteId; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async (url, opciones) => {
      peticiones.push({ url, opciones });
      return responder ? responder(url, opciones) : vacia();
    }
  }, elementos => {
    Object.assign(elementos["webcam-feed"], {
      currentTime: 0, readyState: 2, videoWidth: 640, videoHeight: 480, paused: false, async play() {}
    });
  });
  return {
    e, peticiones, vacia, detecciones: () => detecciones, detenidas: () => detenidas,
    estado: () => e["capture-status-text"].textContent,
    async revisar(ms, detectado = true) {
      reloj += ms;
      e["webcam-feed"].currentTime += 1;
      rostros = detectado ? [{ boundingBox: { width: 50, height: 50 } }] : [];
      const siguiente = [...timers].find(([, timer]) => timer.ms === 500);
      if (!siguiente) return;
      timers.delete(siguiente[0]);
      await siguiente[1].fn();
    }
  };
}

test("detector nativo solo envía con rostro y respeta el intervalo por cámara", async () => {
  const camara = montarCamara();
  const { e, peticiones } = camara;
  await camara.revisar(500);
  assert.equal(peticiones.length, 0);
  await e["btn-start-camera"].listeners.click();
  await camara.revisar(500, false);
  assert.equal(camara.detecciones(), 1);
  assert.equal(peticiones.length, 0);
  await camara.revisar(500);
  assert.equal(peticiones.length, 1);
  assert.match(peticiones[0].url, /\/api\/prediccion\/analizar-captura$/);
  assert.equal(JSON.parse(peticiones[0].opciones.body).imagen_b64, "data:image/jpeg;base64,DEMO");
  assert.match(camara.estado(), /No se detectaron personas/);
  await camara.revisar(4999);
  assert.equal(peticiones.length, 1);
  await camara.revisar(1);
  assert.equal(peticiones.length, 2);
  e["auto-capture-interval"].value = "10";
  await camara.revisar(5000);
  assert.equal(peticiones.length, 2);
  await camara.revisar(5000);
  assert.equal(peticiones.length, 3);
});

test("usa detector alternativo cuando falta el nativo y lo libera al detener", async () => {
  let cerrado = 0;
  const camara = montarCamara({ usarNativo: false, alternativo: async () => ({
    detectForVideo: () => ({ detections: [{ boundingBox: { width: 20, height: 20 } }] }),
    close: () => { cerrado++; }
  }) });
  await camara.e["btn-start-camera"].listeners.click();
  await camara.revisar(500);
  camara.e["btn-stop-camera"].listeners.click();
  await camara.revisar(6000);
  assert.equal(camara.peticiones.length, 1);
  assert.equal(camara.detenidas(), 1);
  assert.equal(cerrado, 1);
});

test("si no hay detector, mantiene la captura manual", async () => {
  const camara = montarCamara({ usarNativo: false });
  const { e, peticiones } = camara;
  await e["btn-start-camera"].listeners.click();
  assert.match(e["auto-capture-status"].textContent, /Detector facial no disponible/);
  await camara.revisar(10000);
  assert.equal(peticiones.length, 0);
  await e["btn-capture-predict"].listeners.click();
  assert.equal(peticiones.length, 1);
  assert.equal(e["captured-image-display"].style.display, "block");
});

test("la foto subida usa el mismo endpoint sin abrir cámara", async () => {
  let solicitud;
  const e = montar({
    FileReader: class {
      readAsDataURL() {
        this.result = "data:image/jpeg;base64,FOTO";
        this.onload();
        this.onloadend();
      }
    },
    fetch: async (url, opciones) => {
      solicitud = { url, cuerpo: JSON.parse(opciones.body) };
      return Response.json({ total_alumnos: 0, estudiantes: [] });
    }
  });
  e.servidor.value = "http://servidor-externo.example";
  e["select-contexto-simulado"].value = "celular";
  const entrada = e["input-upload-image"];
  entrada.files = [{ name: "ejemplo.jpg" }];
  await entrada.listeners.change({ target: entrada });
  assert.equal(solicitud.url, `${base}/api/prediccion/analizar-captura`);
  assert.equal(solicitud.cuerpo.imagen_b64, "data:image/jpeg;base64,FOTO");
  assert.deepEqual(solicitud.cuerpo.contexto_externo.acciones_detectadas, ["uso_celular"]);
  assert.equal(e["captured-image-display"].src, solicitud.cuerpo.imagen_b64);
});

test("una solicitud en curso bloquea duplicados y se cancela al detener la cámara", async () => {
  let resolver;
  const camara = montarCamara({ responder: () => new Promise(resolve => { resolver = resolve; }) });
  const { e, peticiones } = camara;
  await e["btn-start-camera"].listeners.click();
  const enCurso = camara.revisar(500);
  await new Promise(setImmediate);
  await e["btn-capture-predict"].listeners.click();
  assert.equal(peticiones.length, 1);
  e["btn-stop-camera"].listeners.click();
  assert.equal(peticiones[0].opciones.signal.aborted, true);
  resolver(camara.vacia());
  await enCurso;
  await camara.revisar(6000);
  assert.equal(peticiones.length, 1);
  assert.equal(camara.estado(), "Cámara detenida");
});

test("maneja errores HTTP, de red y de formato; pausa el modo automático", async () => {
  const casos = [
    [() => new Response(null, { status: 400 }), /leer la solicitud/],
    [() => new Response(null, { status: 422 }), /rechazó el formato/],
    [() => new Response(null, { status: 500 }), /no pudo analizar/],
    [() => { throw new Error("offline"); }, /conectar/],
    [() => new Response("html"), /respuesta de captura inválida/],
    [() => Response.json({ total_alumnos: 1, estudiantes: [] }), /respuesta de captura inválida/]
  ];
  for (const [responder, mensaje] of casos) {
    const camara = montarCamara({ responder });
    await camara.e["btn-start-camera"].listeners.click();
    await camara.revisar(500);
    assert.match(camara.estado(), mensaje);
    assert.equal(camara.e["auto-capture-enabled"].checked, false);
    assert.equal(camara.e["btn-capture-predict"].disabled, false);
    await camara.revisar(6000);
    assert.equal(camara.peticiones.length, 1);
  }
});

test("si faltan modelos, explica el estado y no muestra valores de respaldo", async () => {
  const camara = montarCamara({ responder: () => Response.json({
    total_alumnos: 1, estudiantes: [{ id: 1, score: 15 }], modelos_predictivos_disponibles: false
  }) });
  await camara.e["btn-start-camera"].listeners.click();
  await camara.revisar(500);
  assert.match(camara.estado(), /Modelos predictivos no disponibles/);
  assert.equal(camara.e["riesgo-score-num"].textContent, "—");
});
