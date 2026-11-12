// Pruebas funcionales del controlador automático de PREDICCIÓN y contratos backend preservados.
// Sin paquetes npm adicionales. No sustituyen la verificación visual en Chrome.
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
  const limiteInicio = Date.now() + 45000;
  while (Date.now() < limiteInicio) {
    if (fallo) throw fallo;
    if (proceso.exitCode !== null) throw new Error(errorServidor);
    try {
      if ((await fetch(`${base}/api/salud`, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {}
    await new Promise(ok => setTimeout(ok, 50));
  }
  throw new Error(`El servidor de prueba no inició: ${errorServidor}`);
});

after(() => {
  if (proceso && proceso.exitCode === null) proceso.kill();
});

class Elemento {
  constructor() {
    this.value = "";
    this.textContent = "";
    this.innerHTML = "";
    this.className = "";
    this.children = [];
    this.listeners = {};
    this.hidden = false;
    this.disabled = false;
    this.style = {};
    this.attributes = {};
    this._classes = new Set();
    this.classList = {
      add: (...c) => c.forEach(x => this._classes.add(x)),
      remove: (...c) => c.forEach(x => this._classes.delete(x)),
      toggle: (c, f) => (f === undefined ? !this._classes.has(c) : f) ? this._classes.add(c) : this._classes.delete(c),
      contains: c => this._classes.has(c)
    };
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  addEventListener(nombre, fn) { this.listeners[nombre] = fn; }
  querySelectorAll() { return []; }
  append(...hijos) { this.children.push(...hijos); }
  replaceChildren(...hijos) { this.children = hijos; }
}

function crearWindowMock() {
  const listeners = new Map();
  return {
    addEventListener(tipo, fn) {
      if (!listeners.has(tipo)) listeners.set(tipo, []);
      listeners.get(tipo).push(fn);
    },
    dispatchEvent(ev) {
      for (const fn of listeners.get(ev.type) || []) fn(ev);
    }
  };
}

function montar(globales = {}, configurar = () => {}) {
  const html = readFileSync(join(raiz, "frontend/index.html"), "utf8");
  const elementos = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1], new Elemento()]));
  const windowMock = globales.window || crearWindowMock();
  const contexto = vm.createContext({
    document: {
      getElementById(id) { return elementos[id] || null; },
      createElement() { return new Elemento(); }
    },
    window: windowMock,
    location: { origin: base, protocol: "http:" },
    URL,
    fetch,
    AbortController,
    AbortSignal,
    Blob,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    ...globales,
  });
  configurar(elementos);
  vm.runInContext(readFileSync(join(raiz, "frontend/app.js"), "utf8"), contexto);
  return { e: elementos, api: contexto.AulaPredict, win: windowMock };
}

function crearWavBase64(duracionSeg = 1.5, frecuencia = 260) {
  const tasa = 16000;
  const muestras = Math.floor(tasa * duracionSeg);
  const bytesPcm = muestras * 2;
  const buf = Buffer.alloc(44 + bytesPcm);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + bytesPcm, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(tasa, 24);
  buf.writeUInt32LE(tasa * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(bytesPcm, 40);
  for (let i = 0; i < muestras; i++) {
    const val = Math.round(Math.sin((2 * Math.PI * frecuencia * i) / tasa) * 14000);
    buf.writeInt16LE(val, 44 + i * 2);
  }
  return buf.toString("base64");
}

test("Entrega 3B retira controles experimentales, demo ficticia y captura redundante del DOM", () => {
  const html = readFileSync(join(raiz, "frontend/index.html"), "utf8");
  const idsEliminados = [
    "experimental-panel",
    "demostracion-integral",
    "advanced-tools-drawer",
    "technical-drawer",
    "integracion-fuentes-avanzado",
    "abrir-seguimiento",
    "select-contexto-simulado",
    "btn-group-classroom",
    "webcam-feed",
    "btn-start-camera",
    "btn-stop-camera",
    "btn-capture-predict",
    "btn-new-capture",
    "input-upload-image",
    "modo-analisis-captura",
    "auto-capture-enabled",
    "auto-capture-interval",
    "experimental-audio",
    "experimental-acad-g1",
    "experimental-acad-g2",
    "experimental-json",
    "experimental-modelo-facial",
    "analisis-experimental",
    "ejecutar-demo-integral",
    "motor",
    "entrada",
    "ejecutar",
    "actualizar-integracion"
  ];
  for (const id of idsEliminados) {
    assert.doesNotMatch(html, new RegExp(`id="${id}"`), `No debe quedar el control obsoleto #${id}`);
  }
  assert.doesNotMatch(html, /Demostración integral con cuatro estudiantes ficticios/i);
  assert.doesNotMatch(html, /Análisis experimental facial, acústico y académico/i);
  assert.doesNotMatch(html, /<input\b|<textarea\b|<select\b/i);

  assert.match(html, /<aside[^>]*class="app-sidebar"/);
  assert.match(html, /<header[^>]*class="app-header"/);
  assert.match(html, /<main[^>]*class="dashboard-content"/);
  assert.match(html, /<ul[^>]*id="module-reception-list"/);
  assert.match(html, /<h1\b/);
  assert.match(html, /<h2\b/);
  assert.match(html, /<h3\b/);
  assert.match(html, /<h4\b/);
});

test("estado inicial automático muestra espera por IMAGEN, VIDEO y AUDIO sin inventar historial ni datos", async () => {
  const { e, api } = montar();
  assert.match(e["general-analysis-headline"].textContent, /Esperando datos de los módulos IMAGEN, VIDEO y AUDIO/);
  assert.equal(e["capture-status-text"].textContent, "En espera");
  for (const mod of ["imagen", "video", "audio", "academico"]) {
    assert.equal(e[`mod-status-${mod}`].textContent, "Sin datos recibidos");
  }
  assert.equal(e["students-count-badge"].textContent, "Sin datos");
  assert.equal(e["btn-toggle-students-panel"].hidden, true);
  assert.equal(e["riesgo-score-num"].textContent, "—");
  assert.match(e["riesgo-nivel-text"].textContent, /Sin datos curriculares suficientes/);
  assert.match(e["assistant-narrative-text"].textContent, /perfiles ficticios ni historial inventado/i);

  await api.verificarSaludBackend();
  assert.match(e["backend-health-text"].textContent, /Servicio local de inferencia disponible/);

  const offline = montar({ fetch: async () => { throw new Error("sin conexión"); } });
  await offline.api.verificarSaludBackend();
  assert.match(offline.e["backend-health-text"].textContent, /no disponible/i);
});

test("recepción automática vía evento diferencia abstención con hipótesis vs clasificación facial concluyente", () => {
  const { e, win, api } = montar();

  // 1) Abstención con hipótesis explícita vía CustomEvent
  win.dispatchEvent({
    type: "aulapredict:resultados",
    detail: {
      fuentes: {
        imagen: {
          estado: "abstencion",
          rostros_detectados: 1,
          hipotesis: { categoria: "neutral", probabilidad: 0.284, concluyente: false },
          calidad_entrada: { recorte_px: [96, 96] },
          puntajes_calibrados: { neutral: 0.284, alegria: 0.26, enojo: 0.24, tristeza: 0.216 },
          criterio_abstencion: { umbral: 0.55, margen_minimo: 0.10, motivos: ["probabilidad_insuficiente", "margen_insuficiente"] },
          modelo: { algoritmo: "hog_svm", version: "fase8-1.0", dataset: { nombre: "CMU Face Images" } }
        }
      }
    }
  });

  assert.equal(e["mod-status-imagen"].textContent, "Abstención");
  assert.equal(e["mod-status-video"].textContent, "Sin datos recibidos");
  assert.equal(e["students-count-badge"].textContent, "1 rostro detectado");
  assert.equal(e["btn-toggle-students-panel"].hidden, false);
  assert.equal(e["btn-toggle-students-panel"].getAttribute("aria-expanded"), "false");
  assert.equal(e["emo-pct-neutral"].textContent, "28.4%");
  assert.equal(e["emo-item-miedo"].style.display, "none");
  assert.equal(e["emo-item-sorpresa"].style.display, "none");
  assert.equal(e["emo-item-disgusto"].style.display, "none");
  assert.match(e["dominant-emotion-text"].textContent, /Hipótesis no concluyente: Neutral \(28\.4%\)/);
  assert.match(e["dominant-emotion-text"].textContent, /Abstención preventiva/);
  assert.match(e["causes-list"].innerHTML, /Hipótesis no concluyente.*Neutral/i);
  assert.match(e["consequences-list"].innerHTML, /Sin sucesos artificiales/);
  assert.equal(e["riesgo-score-num"].textContent, "—");

  // 2) Expandir y contraer detalles visuales
  e["btn-toggle-students-panel"].listeners.click();
  assert.equal(e["btn-toggle-students-panel"].getAttribute("aria-expanded"), "true");
  assert.equal(e["students-toggle-label"].textContent, "Contraer");
  assert.match(e["students-grid"].innerHTML, /OpenCV Haar Cascade/);
  assert.match(e["students-grid"].innerHTML, /96 × 96 px/);
  assert.match(e["students-grid"].innerHTML, /No atribuida/);

  e["btn-toggle-students-panel"].listeners.click();
  assert.equal(e["btn-toggle-students-panel"].getAttribute("aria-expanded"), "false");
  assert.doesNotMatch(e["students-grid"].innerHTML, /96 × 96 px/);

  // 3) Clasificación facial concluyente
  api.aplicarResultados({
    fuentes: {
      imagen: {
        estado: "estimacion_experimental",
        rostros_detectados: 1,
        expresion: "alegria",
        hipotesis: { categoria: "alegria", probabilidad: 0.72, concluyente: true },
        puntajes_calibrados: { alegria: 0.72, neutral: 0.14, enojo: 0.08, tristeza: 0.06 },
        modelo: { algoritmo: "hog_svm", version: "fase8-1.0", dataset: { nombre: "CMU Face Images" } }
      }
    }
  });
  assert.equal(e["mod-status-imagen"].textContent, "Concluyente");
  assert.equal(e["emo-pct-felicidad"].textContent, "72.0%");
  assert.match(e["dominant-emotion-text"].textContent, /Expresión observable: Alegria \(72\.0%\).*Clasificación concluyente/);
  assert.match(e["causes-list"].innerHTML, /Clasificación facial concluyente.*Alegría/);

  // 4) Reinicio al estado de espera
  api.reiniciarResultados();
  assert.equal(e["capture-status-text"].textContent, "En espera");
  assert.equal(e["mod-status-imagen"].textContent, "Sin datos recibidos");
  assert.equal(e["btn-toggle-students-panel"].hidden, true);
  assert.equal(e["emo-pct-neutral"].textContent, "0%");
});

test("maneja VIDEO independiente, 0 rostros y múltiples rostros sin inventar resultados", () => {
  const { e, api } = montar();

  api.aplicarResultados({
    fuentes: {
      video: {
        estado: "evidencia_insuficiente",
        deteccion_facial: "sin_rostro",
        rostros_detectados: 0
      }
    }
  });
  assert.equal(e["mod-status-video"].textContent, "Evidencia insuficiente");
  assert.equal(e["mod-status-imagen"].textContent, "Sin datos recibidos");
  assert.equal(e["students-count-badge"].textContent, "No se detectaron rostros");
  assert.equal(e["btn-toggle-students-panel"].hidden, true);
  assert.match(e["consequences-list"].innerHTML, /Evidencia visual insuficiente \(VIDEO\)/);

  api.aplicarResultados({
    fuentes: {
      imagen: {
        estado: "evidencia_insuficiente",
        deteccion_facial: "multiples_rostros",
        rostros_detectados: 3
      }
    }
  });
  assert.equal(e["students-count-badge"].textContent, "3 rostros detectados");
  assert.match(e["dominant-emotion-text"].textContent, /múltiples rostros/i);
  assert.match(e["causes-list"].innerHTML, /rostros: 3/);
});

test("AUDIO y ACADÉMICO funcionan independientemente, aíslan fallos parciales y soportan orquestar", () => {
  const { e, api } = montar();

  // Audio independiente con abstención RAVDESS (no facial)
  api.aplicarResultados({
    fuentes: {
      imagen: { estado: "sin_entrada" },
      audio: {
        estado: "abstencion",
        hipotesis: { categoria: "calma", probabilidad: 0.43, concluyente: false },
        puntajes_calibrados: { calma: 0.43, enojo: 0.29, sorpresa: 0.16, neutral: 0.12 },
        criterio_abstencion: { motivos: ["probabilidad_insuficiente"], umbral: 0.55, margen_minimo: 0.10 }
      }
    },
    academico: { estado: "sin_entrada" }
  });
  assert.equal(e["mod-status-audio"].textContent, "Abstención");
  assert.match(e["causes-list"].innerHTML, /Hipótesis vocal no concluyente.*Calma/);
  assert.match(e["causes-list"].innerHTML, /RAVDESS.*no facial/);
  assert.equal(e["riesgo-score-num"].textContent, "—");

  // Audio solo con descriptores
  api.aplicarResultados({
    fuentes: { audio: { estado: "caracteristicas_declaradas", duracion_segundos: 3.5 } }
  });
  assert.equal(e["mod-status-audio"].textContent, "Descriptores recibidos");
  assert.match(e["causes-list"].innerHTML, /3\.5s/);

  // Formato anidado de /api/prediccion/orquestar con fallo parcial de audio + académico completo
  api.aplicarResultados({
    analisis: {
      fuentes: {
        imagen: { estado: "evidencia_insuficiente", deteccion_facial: "sin_rostro", rostros_detectados: 0 },
        audio: { estado: "error_inferencia", motivo: "Audio silencioso" }
      },
      academico: {
        estado: "estimacion_experimental",
        desenlace_estimado: "no_aprueba",
        desenlace: "G3 < 10/20",
        probabilidad_no_aprueba: 0.78,
        corte: "despues_g2",
        limitacion: "Uso educativo."
      }
    }
  });
  assert.equal(e["mod-status-audio"].textContent, "error inferencia");
  assert.equal(e["mod-status-academico"].textContent, "Concluyente");
  assert.equal(e["riesgo-score-num"].textContent, "78");
  assert.match(e["riesgo-nivel-text"].textContent, /Riesgo de desaprobación/);

  // Datos académicos incompletos no imputan notas
  api.aplicarResultados({
    academico: { estado: "evidencia_insuficiente", campos_faltantes: ["G2"] }
  });
  assert.equal(e["mod-status-academico"].textContent, "Evidencia insuficiente");
  assert.equal(e["riesgo-score-num"].textContent, "—");
  assert.match(e["riesgo-nivel-text"].textContent, /Datos insuficientes.*G2/);
});

test("app.js tolera DOM parcial sin lanzar excepciones cuando faltan nodos", () => {
  const { api } = montar({
    document: {
      getElementById: () => null,
      createElement: () => new Elemento()
    }
  });
  assert.doesNotThrow(() => {
    api.reiniciarResultados();
    api.aplicarResultados({ academico: { estado: "evidencia_insuficiente", campos_faltantes: ["G1"] } });
  });
});

test("CSS conserva arquitectura de dos columnas, filas compactas y breakpoints responsive", () => {
  const css = readFileSync(join(raiz, "frontend/style.css"), "utf8");
  assert.match(css, /\.top-row-grid\s*\{[^}]*align-items:\s*start/);
  assert.match(css, /\.right-analysis-column\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /\.bottom-row-grid\s*\{[^}]*repeat\(2,/);
  assert.match(css, /\.status-reception-card/);
  assert.match(css, /\.module-reception-row/);
  assert.match(css, /\.students-selection-card\.compact-mode/);
  assert.match(css, /\.btn-panel-toggle\[hidden\]\s*\{[^}]*display:\s*none/);
  assert.match(css, /@media\s*\(max-width:\s*1200px\)/);
  assert.match(css, /@media\s*\(max-width:\s*768px\)/);
});

test("backend preserva todos los endpoints, adaptadores e inferencias independientes sin depender de formularios UI", async () => {
  // 1. Salud y adaptadores de módulos
  const rSalud = await fetch(`${base}/api/salud`);
  assert.equal(rSalud.status, 200);
  const rModulos = await fetch(`${base}/api/modulos`);
  assert.equal(rModulos.status, 200);
  const modulos = (await rModulos.json()).modulos;
  const imgMod = modulos.find(m => m.modulo === "imagen" || m.carpeta === "backend/modulos/imagen");
  const vidMod = modulos.find(m => m.modulo === "video" || m.carpeta === "backend/modulos/video");
  assert.ok(imgMod && imgMod.estado);
  assert.ok(vidMod && vidMod.estado);

  // 2. Modelos de investigación y demostración integral sintética siguen intactos
  const rModelos = await fetch(`${base}/api/prediccion/modelos-investigacion`);
  assert.equal(rModelos.status, 200);
  const rDemo = await fetch(`${base}/api/prediccion/demostracion-integral`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ solicitar_fusion: false })
  });
  assert.equal(rDemo.status, 200);
  const demo = await rDemo.json();
  assert.equal(demo.casos.length, 4);

  // 3. Seguimiento e integración JSON internos intactos
  const rEj = await fetch(`${base}/api/prediccion/estudiantes/ejemplos/juan`);
  assert.equal(rEj.status, 200);
  const rEst = await fetch(`${base}/api/prediccion/estudiantes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(await rEj.json())
  });
  assert.equal(rEst.status, 200);

  // 4. Análisis independiente de Audio WAV + Académico conectado en vivo a AulaPredict.aplicarResultados
  const wavB64 = crearWavBase64();
  const rExp = await fetch(`${base}/api/prediccion/analisis-experimental`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      schema_version: 1,
      audio: { wav_b64: wavB64 },
      academico: { G1: 15, G2: 16, corte: "despues_g2", escala: "0-20" }
    })
  });
  assert.equal(rExp.status, 200);
  const expPayload = await rExp.json();
  assert.ok(["estimacion_experimental", "abstencion"].includes(expPayload.fuentes.audio.estado));
  assert.equal(expPayload.academico.estado, "estimacion_experimental");

  const { e, api } = montar();
  api.aplicarResultados(expPayload);
  assert.equal(e["mod-status-academico"].textContent, "Concluyente");
  assert.notEqual(e["riesgo-score-num"].textContent, "—");
  assert.notEqual(e["mod-status-audio"].textContent, "Sin datos recibidos");
});
