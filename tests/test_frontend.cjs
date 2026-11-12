// Suite de pruebas funcionales y de regresión del módulo PREDICCIÓN.
// Cubre cámara local, subida de fotos, inferencia facial, recepción automática,
// limpieza de paneles obsoletos y contratos backend preservados. Sin paquetes npm externos.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
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
    this.checked = false;
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
  removeAttribute(k) { delete this.attributes[k]; }
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
  elementos["auto-capture-enabled"].checked = true;
  elementos["auto-capture-interval"].value = "5";
  const windowMock = globales.window || crearWindowMock();
  const contexto = vm.createContext({
    document: {
      hidden: false,
      getElementById(id) { return elementos[id] || null; },
      createElement(tag) {
        return tag === "canvas"
          ? { getContext: () => ({ drawImage() {} }), toDataURL: () => "data:image/jpeg;base64,DEMO" }
          : new Elemento();
      }
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
  if (globales.crearDetectorAlternativo) {
    vm.runInContext("cargarMediaPipe = crearDetectorAlternativo;", contexto);
  }
  return Object.assign(elementos, { _api: contexto.AulaPredict, _win: windowMock });
}

function montarCamara({ usarNativo = true, alternativo, responder, abrirCamara, sinAPI = false } = {}) {
  let reloj = 0;
  let siguienteId = 0;
  let detecciones = 0;
  let rostros = [];
  let detenidas = 0;
  const timers = new Map();
  const peticiones = [];
  const trackListeners = {};
  const track = {
    stop() { detenidas++; },
    addEventListener(tipo, fn) { trackListeners[tipo] = fn; }
  };
  const vaciaFacial = () => Response.json({
    schema_version: 1,
    fuentes: { imagen: { estado: "evidencia_insuficiente", deteccion_facial: "sin_rostro", rostros_detectados: 0 } }
  });
  const e = montar({
    navigator: sinAPI ? {} : {
      mediaDevices: {
        async getUserMedia(opciones) {
          assert.equal(opciones.audio, false);
          const stream = { getTracks: () => [track] };
          return abrirCamara ? abrirCamara(stream) : stream;
        }
      }
    },
    FaceDetector: usarNativo ? class { async detect() { detecciones++; return rostros; } } : undefined,
    crearDetectorAlternativo: alternativo || (async () => { throw new Error("Detector no disponible"); }),
    performance: { now: () => reloj },
    setTimeout(fn, ms) { const id = ++siguienteId; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async (url, opciones) => {
      peticiones.push({ url, opciones });
      return responder ? responder(url, opciones) : vaciaFacial();
    }
  }, elementos => {
    Object.assign(elementos["webcam-feed"], {
      currentTime: 0, readyState: 2, videoWidth: 640, videoHeight: 480, paused: false, async play() {}
    });
  });
  return {
    e, peticiones, vaciaFacial, trackListeners,
    detecciones: () => detecciones,
    detenidas: () => detenidas,
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

function contenido(e) {
  return (e.textContent || "") + (e.children || []).map(contenido).join(" ");
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
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * frecuencia * i) / tasa) * 14000), 44 + i * 2);
  }
  return buf.toString("base64");
}

// ============================================================================
// 1. AUDITORÍA DE INTERFAZ Y REORGANIZACIÓN DE COLUMNAS (ENTREGAS 1, 2 Y 3B CORREGIDA)
// ============================================================================

test("restaura Captura de Imagen en columna izquierda, retira Estado General y conserva simplificaciones", () => {
  const html = readFileSync(join(raiz, "frontend/index.html"), "utf8");

  // Cámara restaurada en columna izquierda antes de la columna derecha
  const inicioTop = html.indexOf('class="top-row-grid"');
  const inicioCamera = html.indexOf('id="camera-capture-card"');
  const inicioRight = html.indexOf('class="right-analysis-column"');
  const inicioStudents = html.indexOf('id="students-selection-card"');
  const inicioEmotions = html.indexOf('id="emotions-results-card"');
  const inicioBottom = html.indexOf('class="bottom-row-grid"');

  assert.ok(inicioTop !== -1 && inicioCamera > inicioTop);
  assert.ok(inicioRight > inicioCamera && inicioStudents > inicioRight && inicioEmotions > inicioStudents);
  assert.ok(inicioBottom > inicioEmotions);

  for (const idRequerido of [
    "webcam-feed", "captured-image-display", "overlay-canvas", "camera-placeholder",
    "btn-start-camera", "btn-stop-camera", "btn-capture-predict", "btn-new-capture",
    "input-upload-image", "auto-capture-enabled", "auto-capture-interval", "resultado-facial-captura"
  ]) {
    assert.match(html, new RegExp(`id="${idRequerido}"`), `Debe restaurar #${idRequerido}`);
  }

  // Retirado "Estado general y recepción" y paneles experimentales/demo/avanzados
  for (const idEliminado of [
    "analysis-status-card", "module-reception-list", "mod-status-imagen", "backend-health-text",
    "experimental-panel", "demostracion-integral", "advanced-tools-drawer", "technical-drawer",
    "integracion-fuentes-avanzado", "select-contexto-simulado", "btn-group-classroom",
    "experimental-acad-g1", "experimental-acad-g2", "experimental-json", "experimental-modelo-facial",
    "analisis-experimental", "ejecutar-demo-integral", "motor", "entrada", "ejecutar",
    "actualizar-integracion", "abrir-seguimiento"
  ]) {
    assert.doesNotMatch(html, new RegExp(`id="${idEliminado}"`), `No debe permanecer #${idEliminado}`);
  }
  assert.doesNotMatch(html, /Estado General y Recepción/i);
  assert.doesNotMatch(html, /Demostración integral con cuatro estudiantes ficticios/i);
  assert.doesNotMatch(html, /Análisis experimental facial/i);
});

test("estado inicial discreto muestra cámara detenida sin inventar resultados ni historial", () => {
  const e = montar();
  assert.equal(e["capture-status-text"].textContent, "Cámara detenida");
  assert.equal(e["btn-capture-predict"].disabled, true);
  assert.equal(e["btn-stop-camera"].hidden, true);
  assert.equal(e["btn-toggle-students-panel"].hidden, true);
  assert.equal(e["riesgo-score-num"].textContent, "—");
  assert.match(e["students-grid"].innerHTML, /Sin resultados de análisis todavía/);
  assert.match(e["causes-list"].innerHTML, /No existen resultados todavía/);
  assert.match(e["assistant-narrative-text"].textContent, /Sin resultados todavía/);
});

// ============================================================================
// 2. CÁMARA EN VIVO, PERMISOS, DETECCIÓN Y LIBERACIÓN DE RECURSOS
// ============================================================================

test("distingue permiso denegado, cámara ausente, cámara ocupada y navegador sin API", async () => {
  for (const [opciones, mensaje] of [
    [{ abrirCamara: () => { throw new DOMException("denegado", "NotAllowedError"); } }, /Permiso de cámara denegado/],
    [{ abrirCamara: () => { throw new DOMException("ausente", "NotFoundError"); } }, /No se encontró una cámara/],
    [{ sinAPI: true }, /localhost o HTTPS/],
    [{ abrirCamara: () => { throw new DOMException("ocupada", "NotReadableError"); } }, /otra aplicación/]
  ]) {
    const camara = montarCamara(opciones);
    const { e, peticiones } = camara;
    await e["btn-start-camera"].listeners.click();
    assert.match(camara.estado(), mensaje);
    assert.equal(e["btn-start-camera"].disabled, false);
    assert.equal(e["btn-stop-camera"].hidden, true);
    assert.equal(e["input-upload-image"].disabled, false);
    await camara.revisar(10000);
    assert.equal(peticiones.length, 0);
  }
});

test("detener durante el permiso libera un stream concedido tarde", async () => {
  let permitir;
  const camara = montarCamara({
    abrirCamara: stream => new Promise(resolve => { permitir = () => resolve(stream); })
  });
  const { e } = camara;
  const apertura = e["btn-start-camera"].listeners.click();
  e["btn-stop-camera"].listeners.click();
  permitir();
  await apertura;
  await camara.revisar(10000);
  assert.equal(camara.detenidas(), 1);
  assert.equal(e["webcam-feed"].srcObject, null);
  assert.equal(camara.peticiones.length, 0);
});

test("desconexión física de pista de cámara y pagehide liberan la sesión limpiamente", async () => {
  const camara = montarCamara();
  await camara.e["btn-start-camera"].listeners.click();
  camara.trackListeners.ended();
  assert.equal(camara.detenidas(), 1);
  assert.match(camara.estado(), /cámara se desconectó/i);

  const camara2 = montarCamara();
  await camara2.e["btn-start-camera"].listeners.click();
  camara2.e._win.dispatchEvent({ type: "pagehide" });
  assert.equal(camara2.detenidas(), 1);
});

test("el lienzo deja pasar clics al encendido y el visor distingue un error de reproducción", async () => {
  const css = readFileSync(join(raiz, "frontend/style.css"), "utf8");
  assert.match(css, /#overlay-canvas\s*\{[^}]*pointer-events:\s*none/);
  const camara = montarCamara();
  const { e } = camara;
  e["webcam-feed"].play = async () => { throw new DOMException("reproducción", "NotAllowedError"); };
  await e["btn-start-camera"].listeners.click();
  assert.match(camara.estado(), /visor no pudo reproducir/);
  assert.equal(camara.detenidas(), 1);

  e["webcam-feed"].play = async () => {};
  await e["btn-start-camera"].listeners.click();
  assert.equal(camara.estado(), "Cámara lista");
  await camara.revisar(1000);
  assert.equal(camara.detecciones(), 0);
  assert.equal(camara.peticiones.length, 0);

  e["btn-stop-camera"].listeners.click();
  assert.equal(camara.detenidas(), 2);
});

test("permite cambiar de captura manual a automática al volver con Nueva Captura", async () => {
  const camara = montarCamara({
    responder: () => Response.json({
      fuentes: {
        imagen: {
          estado: "estimacion_experimental",
          rostros_detectados: 1,
          expresion: "alegria",
          puntajes_calibrados: { alegria: 0.72, neutral: 0.15, enojo: 0.08, tristeza: 0.05 }
        }
      }
    })
  });
  const { e, peticiones } = camara;
  e["auto-capture-enabled"].checked = false;
  await e["btn-start-camera"].listeners.click();
  await camara.revisar(500);
  assert.equal(peticiones.length, 0);

  await e["btn-capture-predict"].listeners.click();
  assert.equal(peticiones.length, 1);
  assert.match(camara.estado(), /Clasificación observable disponible/);

  e["auto-capture-enabled"].checked = true;
  e["auto-capture-enabled"].listeners.change();
  await camara.revisar(5000);
  assert.equal(peticiones.length, 1);

  e["btn-new-capture"].listeners.click();
  await camara.revisar(500);
  assert.equal(peticiones.length, 2);
});

test("detector nativo solo envía con rostro y respeta el intervalo por cámara", async () => {
  const camara = montarCamara();
  const { e, peticiones } = camara;
  await camara.revisar(500);
  assert.equal(peticiones.length, 0);

  await e["btn-start-camera"].listeners.click();
  await camara.revisar(500, false);
  assert.equal(camara.detecciones(), 1);
  assert.equal(peticiones.length, 0);

  await camara.revisar(500, true);
  assert.equal(peticiones.length, 1);
  assert.match(peticiones[0].url, /\/api\/prediccion\/analisis-experimental$/);
  assert.deepEqual(JSON.parse(peticiones[0].opciones.body), {
    schema_version: 1,
    imagen: { imagen_b64: "data:image/jpeg;base64,DEMO", modelo_facial: "real" }
  });
  assert.match(camara.estado(), /No se detectó ningún rostro/);

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

test("usa detector alternativo MediaPipe cuando falta el nativo y lo libera al detener", async () => {
  let cerrado = 0;
  const camara = montarCamara({
    usarNativo: false,
    alternativo: async () => ({
      detectForVideo: () => ({ detections: [{ boundingBox: { width: 20, height: 20 } }] }),
      close: () => { cerrado++; }
    })
  });
  await camara.e["btn-start-camera"].listeners.click();
  await camara.revisar(500);
  camara.e["btn-stop-camera"].listeners.click();
  await camara.revisar(6000);
  assert.equal(camara.peticiones.length, 1);
  assert.equal(camara.detenidas(), 1);
  assert.equal(cerrado, 1);
});

test("si no hay detector disponible, mantiene funcional la captura manual", async () => {
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

test("una solicitud de cámara en curso bloquea duplicados y se cancela al detener", async () => {
  let resolver;
  const camara = montarCamara({
    responder: () => new Promise(resolve => { resolver = resolve; })
  });
  const { e, peticiones } = camara;
  await e["btn-start-camera"].listeners.click();
  const enCurso = camara.revisar(500);
  await new Promise(setImmediate);
  await e["btn-capture-predict"].listeners.click();
  assert.equal(peticiones.length, 1);

  e["btn-stop-camera"].listeners.click();
  assert.equal(peticiones[0].opciones.signal.aborted, true);
  resolver(camara.vaciaFacial());
  await enCurso;
  await camara.revisar(6000);
  assert.equal(peticiones.length, 1);
  assert.equal(camara.estado(), "Cámara detenida");
});

test("maneja errores HTTP, de red y respuesta inválida pausando el modo automático", async () => {
  const casos = [
    [() => new Response(null, { status: 400 }), /leer la solicitud/],
    [() => new Response(null, { status: 422 }), /rechazó el formato/],
    [() => new Response(null, { status: 500 }), /no pudo analizar/],
    [() => { throw new Error("offline"); }, /conectar/],
    [() => new Response("html"), /respuesta facial inválida/],
    [() => Response.json({ fuentes: {} }), /respuesta facial inválida/]
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

// ============================================================================
// 3. SUBIDA DE FOTOGRAFÍA, PREVIEW, TIMEOUT, DETECCIÓN Y RESULTADOS FACIALES
// ============================================================================

test("subir foto envía imagen real al endpoint sin abrir cámara y actualiza preview", async () => {
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
      return Response.json({
        fuentes: { imagen: { estado: "evidencia_insuficiente", deteccion_facial: "sin_rostro", rostros_detectados: 0 } }
      });
    }
  });
  const entrada = e["input-upload-image"];
  entrada.files = [{ name: "ejemplo.jpg" }];
  await entrada.listeners.change({ target: entrada });
  assert.equal(solicitud.url, `${base}/api/prediccion/analisis-experimental`);
  assert.deepEqual(solicitud.cuerpo, {
    schema_version: 1,
    imagen: { imagen_b64: "data:image/jpeg;base64,FOTO", modelo_facial: "real" }
  });
  assert.equal(e["captured-image-display"].src, "data:image/jpeg;base64,FOTO");
  assert.equal(e["captured-image-display"].style.display, "block");
  assert.match(e["capture-status-text"].textContent, /No se detectó ningún rostro/);
});

test("la foto subida valida tipo/tamaño, anticipa vista previa y permite reintentar tras timeout", async () => {
  let limite;
  let peticiones = 0;
  const e = montar({
    setTimeout(fn, ms) { assert.equal(ms, 30000); limite = fn; },
    clearTimeout() {},
    FileReader: class {
      readAsDataURL() {
        this.result = "data:image/png;base64,FOTO";
        this.onload();
        this.onloadend();
      }
    },
    async fetch(url, { signal }) {
      assert.match(url, /analisis-experimental$/);
      assert.equal(e["captured-image-display"].style.display, "block");
      assert.match(e["capture-status-text"].textContent, /Fotografía seleccionada/);
      if (++peticiones === 1) return new Promise((_, reject) => signal.addEventListener("abort", reject));
      return Response.json({ fuentes: { imagen: { estado: "abstencion", puntajes_calibrados: { neutral: 0.42 } } } });
    }
  });
  const entrada = e["input-upload-image"];
  const subir = (type, size) => {
    entrada.files = [{ name: "foto.png", type, size }];
    return entrada.listeners.change({ target: entrada });
  };
  await subir("image/gif", 1024);
  await subir("image/png", 5 * 1024 ** 2 + 1);
  assert.equal(peticiones, 0);

  const primera = subir("image/png", 1024);
  await new Promise(setImmediate);
  limite();
  await primera;
  assert.match(e["capture-status-text"].textContent, /tardó demasiado/);
  assert.equal(entrada.disabled, false);

  await subir("image/png", 1024);
  assert.match(e["capture-status-text"].textContent, /Abstención/);
  assert.match(contenido(e["resultado-facial-captura"]), /neutral 0.420/);
});

test("captura facial con abstención muestra 4 probabilidades reales, hipótesis y explicación", async () => {
  const e = montar({
    FileReader: class {
      readAsDataURL() { this.result = "data:image/jpeg;base64,FOTO"; this.onload(); this.onloadend(); }
    },
    fetch: async () => Response.json({
      fuentes: {
        imagen: {
          estado: "abstencion",
          rostros_detectados: 1,
          hipotesis: { categoria: "neutral", probabilidad: 0.313, concluyente: false },
          puntajes_calibrados: { neutral: 0.313, alegria: 0.312, enojo: 0.236, tristeza: 0.139 },
          criterio_abstencion: { umbral: 0.55, margen_minimo: 0.10, motivos: ["probabilidad_insuficiente", "margen_insuficiente"] },
          modelo: { algoritmo: "hog_svm", version: "fase8-1.0", dataset: { nombre: "CMU Face Images" } }
        }
      }
    })
  });
  e["input-upload-image"].files = [{ name: "prueba.jpg" }];
  await e["input-upload-image"].listeners.change({ target: e["input-upload-image"] });

  assert.match(e["facial-card-title"].textContent, /4 Expresiones Observables/);
  assert.match(e["facial-card-sublabel"].textContent, /CMU Face Images/);
  assert.equal(e["emo-item-miedo"].style.display, "none");
  assert.equal(e["emo-item-sorpresa"].style.display, "none");
  assert.equal(e["emo-item-disgusto"].style.display, "none");
  assert.equal(e["emo-pct-neutral"].textContent, "31.3%");
  assert.equal(e["emo-pct-felicidad"].textContent, "31.2%");
  assert.equal(e["emo-pct-enojo"].textContent, "23.6%");
  assert.equal(e["emo-pct-tristeza"].textContent, "13.9%");
  assert.match(e["dominant-emotion-text"].textContent, /Hipótesis no concluyente: Neutral \(31\.3%\)/);
  assert.match(e["dominant-emotion-text"].textContent, /probabilidad insuficiente.*margen insuficiente/);
  assert.equal(e["riesgo-score-num"].textContent, "—");
  assert.match(e["causes-list"].innerHTML, /Hipótesis no concluyente.*Neutral/i);
  assert.match(e["consequences-list"].innerHTML, /Motivo de abstención/);
  assert.match(e["consequences-list"].innerHTML, /Sin sucesos artificiales/i);
});

test("captura facial concluyente destaca expresión observable sin diagnóstico interno", async () => {
  const e = montar({
    FileReader: class {
      readAsDataURL() { this.result = "data:image/jpeg;base64,FOTO"; this.onload(); this.onloadend(); }
    },
    fetch: async () => Response.json({
      fuentes: {
        imagen: {
          estado: "estimacion_experimental",
          rostros_detectados: 1,
          expresion: "alegria",
          hipotesis: { categoria: "alegria", probabilidad: 0.72, concluyente: true },
          puntajes_calibrados: { neutral: 0.15, alegria: 0.72, enojo: 0.08, tristeza: 0.05 },
          modelo: { algoritmo: "hog_svm", version: "fase8-1.0", dataset: { nombre: "CMU Face Images" } }
        }
      }
    })
  });
  e["input-upload-image"].files = [{ name: "alegria.jpg" }];
  await e["input-upload-image"].listeners.change({ target: e["input-upload-image"] });

  assert.match(e["dominant-emotion-text"].textContent, /Expresión observable: Alegria \(72\.0%\).*Clasificación concluyente/);
  assert.equal(e["emo-pct-felicidad"].textContent, "72.0%");
  assert.equal(e["riesgo-score-num"].textContent, "—");
  assert.match(e["causes-list"].innerHTML, /Clasificación facial concluyente.*Alegría/);
});

test("maneja modelo facial no disponible y recuperación tras error 500 sin congelar UI", async () => {
  let intentos = 0;
  const e = montar({
    FileReader: class {
      readAsDataURL() { this.result = "data:image/jpeg;base64,FOTO"; this.onload(); this.onloadend(); }
    },
    fetch: async () => {
      intentos++;
      if (intentos === 1) return Response.json({ fuentes: { imagen: { estado: "modelo_no_disponible", rostros_detectados: 1 } } });
      if (intentos === 2) return new Response(null, { status: 500 });
      return Response.json({
        fuentes: { imagen: { estado: "abstencion", rostros_detectados: 1, puntajes_calibrados: { neutral: 0.4, alegria: 0.3, enojo: 0.2, tristeza: 0.1 } } }
      });
    }
  });
  const entrada = e["input-upload-image"];

  entrada.files = [{ name: "1.jpg" }];
  await entrada.listeners.change({ target: entrada });
  assert.match(e["capture-status-text"].textContent, /Modelo facial no disponible/);
  assert.equal(e["riesgo-score-num"].textContent, "—");

  entrada.files = [{ name: "2.jpg" }];
  await entrada.listeners.change({ target: entrada });
  assert.match(e["capture-status-text"].textContent, /no pudo analizar/);
  assert.match(e["dominant-emotion-text"].textContent, /Error técnico/);
  assert.equal(entrada.disabled, false);

  entrada.files = [{ name: "3.jpg" }];
  await entrada.listeners.change({ target: entrada });
  assert.match(e["capture-status-text"].textContent, /Abstención/);
  assert.equal(e["emo-pct-neutral"].textContent, "40.0%");
});

test("panel compacto de detección facial soporta 1 rostro (expandir/contraer), 0 rostros, N rostros y Nueva Captura", async () => {
  let respuestaActual;
  const e = montar({
    FileReader: class {
      readAsDataURL() { this.result = "data:image/jpeg;base64,FOTO"; this.onload(); this.onloadend(); }
    },
    fetch: async () => Response.json(respuestaActual)
  });
  const entrada = e["input-upload-image"];

  // 1 rostro contraído -> expandir -> contraer
  respuestaActual = {
    fuentes: {
      imagen: {
        estado: "estimacion_experimental", rostros_detectados: 1, expresion: "alegria",
        calidad_entrada: { recorte_px: [120, 120] },
        puntajes_calibrados: { neutral: 0.1, alegria: 0.75, enojo: 0.1, tristeza: 0.05 }
      }
    }
  };
  entrada.files = [{ name: "feliz.jpg" }];
  await entrada.listeners.change({ target: entrada });

  assert.ok(e["students-selection-card"].classList.contains("compact-mode"));
  assert.equal(e["students-count-badge"].textContent, "1 rostro detectado");
  assert.equal(e["btn-toggle-students-panel"].hidden, false);
  assert.equal(e["btn-toggle-students-panel"].getAttribute("aria-expanded"), "false");
  assert.doesNotMatch(e["students-grid"].innerHTML, /120 × 120 px/);

  e["btn-toggle-students-panel"].listeners.click();
  assert.equal(e["btn-toggle-students-panel"].getAttribute("aria-expanded"), "true");
  assert.equal(e["students-toggle-label"].textContent, "Contraer");
  assert.match(e["students-grid"].innerHTML, /OpenCV Haar Cascade/);
  assert.match(e["students-grid"].innerHTML, /120 × 120 px/);
  assert.match(e["students-grid"].innerHTML, /No atribuida/);

  e["btn-toggle-students-panel"].listeners.click();
  assert.equal(e["btn-toggle-students-panel"].getAttribute("aria-expanded"), "false");
  assert.doesNotMatch(e["students-grid"].innerHTML, /120 × 120 px/);

  // 0 rostros
  respuestaActual = { fuentes: { imagen: { estado: "evidencia_insuficiente", deteccion_facial: "sin_rostro", rostros_detectados: 0 } } };
  entrada.files = [{ name: "vacio.jpg" }];
  await entrada.listeners.change({ target: entrada });
  assert.equal(e["students-count-badge"].textContent, "No se detectaron rostros");
  assert.equal(e["btn-toggle-students-panel"].hidden, true);

  // Múltiples rostros
  respuestaActual = { fuentes: { imagen: { estado: "evidencia_insuficiente", deteccion_facial: "multiples_rostros", rostros_detectados: 2 } } };
  entrada.files = [{ name: "dos.jpg" }];
  await entrada.listeners.change({ target: entrada });
  assert.equal(e["students-count-badge"].textContent, "2 rostros detectados");
  assert.match(e["dominant-emotion-text"].textContent, /varios rostros/i);

  // Nueva Captura limpia preview y resultados
  e["btn-new-capture"].listeners.click();
  assert.equal(e["captured-image-display"].style.display, "none");
  assert.equal(e["students-count-badge"].textContent, "Esperando captura");
  assert.equal(e["btn-toggle-students-panel"].hidden, true);
  assert.equal(e["emo-pct-neutral"].textContent, "0%");
});

// ============================================================================
// 4. RECEPCIÓN AUTOMÁTICA POR MODALIDAD (IMAGEN, VIDEO, AUDIO, ACADÉMICO)
// ============================================================================

test("recepción automática renderiza AUDIO y ACADÉMICO independientes, aísla fallos y evita imputación", () => {
  const e = montar();

  // Audio RAVDESS independiente (no facial) sin foto
  e._win.dispatchEvent({
    type: "aulapredict:resultados",
    detail: {
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
    }
  });
  assert.match(e["causes-list"].innerHTML, /Hipótesis vocal no concluyente.*Calma/);
  assert.match(e["causes-list"].innerHTML, /RAVDESS.*no facial/);
  assert.equal(e["riesgo-score-num"].textContent, "—");

  // Audio con solo descriptores
  e._api.aplicarResultados({
    fuentes: { audio: { estado: "caracteristicas_declaradas", duracion_segundos: 3.5 } }
  });
  assert.match(e["causes-list"].innerHTML, /3\.5s/);

  // Payload de orquestar con fallo parcial de audio/imagen + proyección académica válida
  e._api.aplicarResultados({
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
        limitacion: "UCI Student Performance."
      }
    }
  });
  assert.equal(e["riesgo-score-num"].textContent, "78");
  assert.match(e["riesgo-nivel-text"].textContent, /Riesgo de desaprobación/);

  // Datos académicos incompletos no inventan G2
  e._api.aplicarResultados({
    academico: { estado: "evidencia_insuficiente", campos_faltantes: ["G2"] }
  });
  assert.equal(e["riesgo-score-num"].textContent, "—");
  assert.match(e["riesgo-nivel-text"].textContent, /Datos insuficientes.*G2/);

  e._api.reiniciarResultados();
  assert.equal(e["riesgo-score-num"].textContent, "—");
});

test("app.js tolera DOM parcial sin lanzar excepciones cuando faltan nodos", () => {
  const e = montar({
    document: {
      hidden: false,
      getElementById: () => null,
      createElement: () => new Elemento()
    }
  });
  assert.doesNotThrow(() => {
    e._api.reiniciarResultados();
    e._api.aplicarResultados({ academico: { estado: "evidencia_insuficiente", campos_faltantes: ["G1"] } });
  });
});

test("CSS mantiene arquitectura responsive de dos columnas, panel compacto y botón [hidden]", () => {
  const css = readFileSync(join(raiz, "frontend/style.css"), "utf8");
  assert.match(css, /\.top-row-grid\s*\{[^}]*align-items:\s*start/);
  assert.match(css, /\.right-analysis-column\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /\.bottom-row-grid\s*\{[^}]*repeat\(2,/);
  assert.match(css, /\.students-selection-card\.compact-mode/);
  assert.match(css, /\.btn-panel-toggle\[hidden\]\s*\{[^}]*display:\s*none/);
  assert.match(css, /@media\s*\(max-width:\s*1200px\)/);
  assert.match(css, /@media\s*\(max-width:\s*768px\)/);
});

// ============================================================================
// 5. INTEGRACIÓN REAL CON BACKEND Y CONTRATOS INTERNOS PRESERVADOS
// ============================================================================

test("backend preserva endpoints internos de modulos, seguimiento, demo sintetica y flujo real de foto/audio/academico", async () => {
  const rSalud = await fetch(`${base}/api/salud`);
  assert.equal(rSalud.status, 200);

  const rModulos = await fetch(`${base}/api/modulos`);
  assert.equal(rModulos.status, 200);
  const modulos = (await rModulos.json()).modulos;
  assert.ok(modulos.find(m => m.carpeta === "backend/modulos/imagen")?.estado);
  assert.ok(modulos.find(m => m.carpeta === "backend/modulos/video")?.estado);

  const rModelos = await fetch(`${base}/api/prediccion/modelos-investigacion?cargar=false`);
  assert.equal(rModelos.status, 200);
  const modelos = await rModelos.json();

  const rDemo = await fetch(`${base}/api/prediccion/demostracion-integral`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ solicitar_fusion: false })
  });
  assert.equal(rDemo.status, 200);
  assert.equal((await rDemo.json()).casos.length, 4);

  const rEj = await fetch(`${base}/api/prediccion/estudiantes/ejemplos/juan`);
  assert.equal(rEj.status, 200);
  const rEst = await fetch(`${base}/api/prediccion/estudiantes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(await rEj.json())
  });
  assert.equal(rEst.status, 200);

  const rutaAstro = join(raiz, "_archivo/fase7/datos/astronaut.png");
  const hayFoto = existsSync(rutaAstro);
  // PNG sintético de 160 × 160 sin rostro para el clon base.
  const pngSinRostro = "iVBORw0KGgoAAAANSUhEUgAAAKAAAACgCAAAAACupDjxAAAAL0lEQVR42u3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPBqZKAAAbE2mIIAAAAASUVORK5CYII=";
  const fotoB64 = hayFoto ? readFileSync(rutaAstro).toString("base64") : pngSinRostro;
  const e = montar({
    FileReader: class {
      readAsDataURL() { this.result = `data:image/png;base64,${fotoB64}`; this.onload(); this.onloadend(); }
    }
  });
  e["input-upload-image"].files = [{ name: "captura.png", type: "image/png", size: Buffer.from(fotoB64, "base64").length }];
  await e["input-upload-image"].listeners.change({ target: e["input-upload-image"] });
  assert.equal(e["students-count-badge"].textContent, hayFoto ? "1 rostro detectado" : "No se detectaron rostros");
  assert.match(e["facial-card-title"].textContent, /4 Expresiones Observables/);
  assert.equal(e["riesgo-score-num"].textContent, "—");

  // Audio WAV + notas G1/G2 reales hacia backend y recepcion automatica
  const rExp = await fetch(`${base}/api/prediccion/analisis-experimental`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      schema_version: 1,
      audio: { wav_b64: crearWavBase64() },
      academico: { G1: 15, G2: 16, corte: "despues_g2", escala: "0-20" }
    })
  });
  assert.equal(rExp.status, 200);
  const payload = await rExp.json();
  e._api.aplicarResultados(payload);
  if (modelos.academico.estado === "archivo_presente") {
    assert.notEqual(e["riesgo-score-num"].textContent, "—");
    assert.match(e["causes-list"].innerHTML, /Aprobación proyectada/);
  } else {
    assert.equal(payload.academico.estado, "modelo_no_disponible");
    assert.equal(e["riesgo-score-num"].textContent, "—");
  }
});

// ============================================================================
// 6. ENTREGA FINAL UNIFICADA: INTERPRETACIÓN VISUAL, OBJETOS Y POLLING HTTP
// ============================================================================

test("una sola fotografia muestra interpretacion visual rica, objetos separados y fallback sin bloquear expresion", async () => {
  let respuestaServidor;
  const e = montar({
    FileReader: class {
      readAsDataURL() { this.result = "data:image/jpeg;base64,FOTO"; this.onload(); this.onloadend(); }
    },
    fetch: async () => Response.json(respuestaServidor)
  });
  const entrada = e["input-upload-image"];

  respuestaServidor = {
    fuentes: {
      imagen: {
        estado: "abstencion",
        deteccion_facial: "rostro_detectado",
        rostros_detectados: 1,
        identidad_verificada: false,
        hipotesis: { categoria: "neutral", probabilidad: 0.41, concluyente: false },
        puntajes_calibrados: { neutral: 0.41, alegria: 0.30, enojo: 0.19, tristeza: 0.10 },
        criterio_abstencion: { umbral: 0.55, margen_minimo: 0.10, motivos: ["probabilidad_insuficiente"] },
        deteccion_objetos: {
          estado: "detectado",
          objetos: [
            { clase: "persona", etiqueta: "Persona", confianza: 0.92, origen: "yolo" },
            { clase: "telefono", etiqueta: "Teléfono móvil", confianza: 0.87, origen: "yolo" }
          ],
          objetos_no_persona: [
            { clase: "telefono", etiqueta: "Teléfono móvil", confianza: 0.87, origen: "yolo" }
          ],
          senales_encuadre: [{ codigo: "telefono_en_cuadro", descripcion: "Se detecta un teléfono móvil visible en escena.", origen: "yolo" }]
        }
      }
    }
  };
  entrada.files = [{ name: "alumno.jpg" }];
  await entrada.listeners.change({ target: entrada });

  assert.equal(e["riesgo-score-num"].textContent, "—");
  assert.match(e["students-grid"].innerHTML, /Teléfono móvil/);
  assert.match(e["causes-list"].innerHTML, /Observación visual/);
  assert.match(e["causes-list"].innerHTML, /Teléfono móvil/);
  assert.match(e["causes-list"].innerHTML, /Sin probabilidad asignada/);
  assert.match(e["consequences-list"].innerHTML, /Evidencia adicional requerida/);

  // Fallback cuando detector de objetos no está disponible pero la expresión sigue funcionando
  respuestaServidor = {
    fuentes: {
      imagen: {
        estado: "estimacion_experimental",
        deteccion_facial: "rostro_detectado",
        rostros_detectados: 1,
        expresion: "alegria",
        hipotesis: { categoria: "alegria", probabilidad: 0.78, concluyente: true },
        puntajes_calibrados: { alegria: 0.78, neutral: 0.12, enojo: 0.06, tristeza: 0.04 },
        deteccion_objetos: { estado: "modelo_no_disponible", objetos: [], objetos_no_persona: [], senales_encuadre: [] }
      }
    }
  };
  entrada.files = [{ name: "alegria_sin_yolo.jpg" }];
  await entrada.listeners.change({ target: entrada });
  assert.match(e["dominant-emotion-text"].textContent, /Expresión observable: Alegria \(78\.0%\)/);
  assert.match(e["causes-list"].innerHTML, /Clasificación facial concluyente/);
  assert.match(e["consequences-list"].innerHTML, /detector local de objetos no estuvo disponible/i);
  e["btn-toggle-students-panel"].listeners.click();
  assert.match(e["students-grid"].innerHTML, /Detector objetos:.*modelo no disponible/i);
});

test("polling automatico consulta /recepcion/ultima?desde=N, aplica resultados y respeta Nueva Captura", async () => {
  const urlsConsultadas = [];
  let respuestaCanal = { actualizacion_id: 0, disponible: false };
  const e = montar({
    fetch: async (url) => {
      urlsConsultadas.push(url);
      const parsed = new URL(url);
      const desde = Number(parsed.searchParams.get("desde") || "0");
      if (desde && respuestaCanal.actualizacion_id <= desde) {
        return Response.json({ actualizacion_id: respuestaCanal.actualizacion_id, disponible: respuestaCanal.disponible, sin_cambios: true });
      }
      return Response.json(respuestaCanal);
    }
  });

  // Sin novedades
  await e._api.verificarRecepcionAutomatica();
  assert.match(urlsConsultadas.at(-1), /\/api\/prediccion\/recepcion\/ultima\?desde=0$/);
  assert.equal(e["riesgo-score-num"].textContent, "—");

  // Llega actualización multimodal secuencia 3
  respuestaCanal = {
    actualizacion_id: 3,
    disponible: true,
    resultado: {
      actualizacion_id: 3,
      fusion: {
        ejecutada: false,
        metodo: "sin_modelo_conjunto_validado",
        explicacion: "Sin modelo conjunto calibrado; reporte separado."
      },
      analisis: {
        fuentes: {
          imagen: {
            estado: "evidencia_insuficiente",
            deteccion_facial: "sin_rostro",
            rostros_detectados: 0,
            deteccion_objetos: {
              estado: "solo_externas",
              objetos: [{ clase: "reloj", etiqueta: "Reloj", confianza: 0.85, origen: "modulo_imagen" }],
              objetos_no_persona: [{ clase: "reloj", etiqueta: "Reloj", confianza: 0.85, origen: "modulo_imagen" }],
              senales_encuadre: []
            }
          },
          audio: {
            estado: "tipo_incompatible_no_vocal",
            tipo_observacion: "asistencia",
            motivo: "El evento «asistencia» no es señal vocal; excluido del modelo RAVDESS."
          }
        },
        academico: {
          estado: "estimacion_experimental",
          desenlace_estimado: "no_aprueba",
          desenlace: "G3 < 10/20",
          probabilidad_no_aprueba: 0.67,
          corte: "despues_g2"
        },
        sincronizacion: { estado: "referencias_incompatibles", conflictos_referencia: ["identidades_contradictorias"] }
      }
    }
  };

  await e._api.verificarRecepcionAutomatica();
  assert.equal(e["riesgo-score-num"].textContent, "67");
  assert.match(e["causes-list"].innerHTML, /Reloj/);
  assert.match(e["causes-list"].innerHTML, /asistencia.*no es señal vocal/);
  assert.match(e["consequences-list"].innerHTML, /identidades_contradictorias/);

  // Al pulsar Nueva Captura y volver a consultar, usa ?desde=3 y no restaura la vista borrada
  e["btn-new-capture"].listeners.click();
  assert.equal(e["riesgo-score-num"].textContent, "—");
  await e._api.verificarRecepcionAutomatica();
  assert.match(urlsConsultadas.at(-1), /\/api\/prediccion\/recepcion\/ultima\?desde=3$/);
  assert.equal(e["riesgo-score-num"].textContent, "—");
});
