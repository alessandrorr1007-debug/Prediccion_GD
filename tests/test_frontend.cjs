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
  elementos["modo-analisis-captura"].value = "aula";
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
    AbortController, AbortSignal, Blob, setTimeout, clearTimeout, ...globales,
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

test("panel de integración muestra estados y distingue un servidor no disponible", async () => {
  const e = montar();
  await e["actualizar-integracion"].listeners.click();
  const modulos = contenido(e["integracion-modulos"]);
  assert.match(modulos, /IMAGEN · adaptador disponible/);
  assert.match(modulos, /VIDEO · adaptador disponible/);
  assert.match(modulos, /AUDIO · productor y contrato pendientes/);
  const offline = montar({ fetch: async () => { throw new Error("sin conexión"); } });
  await offline["actualizar-integracion"].listeners.click();
  assert.match(contenido(offline["integracion-modulos"]), /No se pudo consultar/);
  assert.equal(offline["actualizar-integracion"].disabled, false);
});

test("seguimiento multimodal muestra procedencia, escena sin identidad y errores por fuente", async () => {
  const e = montar();
  e["ejemplo-seguimiento"].value = "multimodal";
  await e["abrir-seguimiento"].listeners.click();
  await e.ejecutar.listeners.click();
  assert.equal(e.indice.textContent, "30");
  const texto = contenido(e["resultados-estudiantes"]);
  assert.match(texto, /Fuentes recibidas en esta evaluación/);
  assert.match(texto, /fixture-imagen.*sintetica/);
  assert.match(texto, /registro-demo/);
  assert.match(texto, /revision-demo-1/);
  assert.match(texto, /conteo de escena sin identidad individual.*cap-demo-1/);
  const datos = JSON.parse(e.entrada.value);
  datos.fuentes[0].modulo = "audio";
  e.entrada.value = JSON.stringify(datos);
  await e.ejecutar.listeners.click();
  assert.match(e.estado.textContent, /Fuente 1 \(audio, contrato_pendiente\)/);
  assert.equal(e["resultados-estudiantes"].children.length, 0);
});

test("panel experimental muestra características declaradas y fusión pendiente", async () => {
  const e = montar();
  e["experimental-json"].value = JSON.stringify({
    schema_version: 1, audio: { duracion_segundos: 4, f0_hz: 150, naturaleza: "sintetica" }
  });
  await e["analisis-experimental"].listeners.submit({ preventDefault() {} });
  assert.match(e["experimental-estado"].textContent, /Evaluación experimental completada/);
  const salida = contenido(e["experimental-resultados"]);
  assert.match(salida, /caracteristicas declaradas/);
  assert.match(salida, /f0_hz: 150/);
  assert.match(salida, /clasificador acústico pendientes/);
  assert.match(salida, /Fusión estadística pendiente/);
});

test("panel experimental muestra notas faltantes y consulta modelos por separado", async () => {
  const e = montar();
  e["experimental-json"].value = '{"schema_version":1,"academico":{"G1":8}}';
  await e["analisis-experimental"].listeners.submit({ preventDefault() {} });
  assert.match(contenido(e["experimental-resultados"]), /Campos faltantes: G2, corte, escala/);
  await e["experimental-consultar-modelos"].listeners.click();
  assert.match(contenido(e["experimental-modelos"]), /facial historico.*rasgos sinteticos/);
});

test("panel experimental envía WAV y muestra su abstención calibrada", async () => {
  const e = montar({
    FileReader: class {
      readAsDataURL() { this.result = "data:audio/wav;base64,UklGRg=="; this.onload(); }
    },
    async fetch(url, opciones) {
      assert.match(url, /analisis-experimental$/);
      assert.deepEqual(JSON.parse(opciones.body).audio, { evento_id: "a1", wav_b64: "UklGRg==" });
      return { ok: true, async json() { return {
        fuentes: { audio: { estado: "abstencion", modelo: { algoritmo: "random_forest", version: "fase7-1.0",
          dataset: { dominio: "RAVDESS" } }, puntajes_calibrados: { neutral: 0.51 }, criterio_abstencion: {
            motivos: ["probabilidad_insuficiente"], maximo: .51, umbral: .55, margen_observado: .2, margen_minimo: .1
          } } },
        sincronizacion: { estado: "fuentes_insuficientes" }
      }; } };
    }
  });
  e["experimental-audio"].files = [{ size: 8 }];
  e["experimental-json"].value = '{"schema_version":1,"audio":{"evento_id":"a1"}}';
  await e["analisis-experimental"].listeners.submit({ preventDefault() {} });
  const salida = contenido(e["experimental-resultados"]);
  assert.match(salida, /abstencion/);
  assert.match(salida, /random_forest.*fase7-1\.0.*RAVDESS/);
  assert.match(salida, /neutral: 0\.510/);
  assert.match(salida, /Abstención por probabilidad insuficiente.*mínimo 0\.55/);
  assert.doesNotMatch(salida, /clasificador acústico pendientes/);
});

test("panel experimental selecciona el modelo facial y muestra conflictos declarados", async () => {
  const e = montar({ async fetch(_url, opciones) {
    const entrada = JSON.parse(opciones.body);
    assert.equal(entrada.imagen.modelo_facial, "real");
    return { ok: true, async json() { return {
      fuentes: { imagen: { estado: "abstencion", origen_entrenamiento: "datos_reales",
        modelo: { algoritmo: "hog_logistica", version: "fase8-1.0", dataset: { nombre: "CMU Face Images" } } } },
      sincronizacion: { estado: "referencias_incompatibles", conflictos_referencia: ["sesiones_distintas"] }
    }; } };
  } });
  e["experimental-modelo-facial"].value = "real";
  e["experimental-json"].value = '{"schema_version":1,"imagen":{"imagen_b64":"AA=="}}';
  await e["analisis-experimental"].listeners.submit({ preventDefault() {} });
  const salida = contenido(e["experimental-resultados"]);
  assert.match(salida, /CMU Face Images/);
  assert.match(salida, /Datos de entrenamiento: datos reales/);
  assert.match(salida, /sesiones distintas/);
});

test("demostración integral usa la API y muestra cuatro casos con procedencia", async () => {
  const e = montar();
  const real = process.env.AULAPREDICT_E2E_FASE10 === "1";
  e["demo-integral-fusion"].checked = real;
  await e["ejecutar-demo-integral"].listeners.click();
  assert.match(e["estado-demo-integral"].textContent, /Demostración sintética completada/);
  const salida = contenido(e["resultados-demo-integral"]);
  for (const caso of "ABCD") assert.match(salida, new RegExp(`Caso ${caso}`));
  assert.match(salida, /Campos faltantes.*G2/);
  assert.match(salida, /Registros académicos excluidos/);
  assert.match(salida, /sesion distinta/);
  if (real) {
    assert.match(salida, /compatible · ejecutada/);
    assert.match(salida, /Probabilidades.*RAVDESS|RAVDESS.*Probabilidades/);
  } else {
    assert.match(salida, /sin ejecutar/);
  }
});

test("panel comprueba el servidor, selecciona un caso y reinicia", async () => {
  const e = montar();
  await e["verificar-demo-integral"].listeners.click();
  assert.match(contenido(e["inventario-demo-integral"]), /Backend disponible/);
  e["demo-integral-caso"].value = "D";
  await e["ejecutar-demo-integral"].listeners.click();
  assert.match(contenido(e["resultados-demo-integral"]), /Caso D.*sesion distinta/);
  assert.doesNotMatch(contenido(e["resultados-demo-integral"]), /Caso A/);
  e["reiniciar-demo-integral"].listeners.click();
  assert.equal(e["demo-integral-caso"].value, "todos");
  assert.equal(contenido(e["resultados-demo-integral"]), "");
});

test("seguimiento muestra asistencia, participación y prioridad académica separadas", async () => {
  const e = montar();
  e["ejemplo-seguimiento"].value = "participacion";
  await e["abrir-seguimiento"].listeners.click();
  await e.ejecutar.listeners.click();
  const salida = contenido(e["resultados-estudiantes"]);
  assert.match(salida, /Prioridad académica: 15/);
  assert.match(salida, /Registros de asistencia: 5 · ausencias: 2/);
  assert.match(salida, /Participaciones declaradas: 2/);
  assert.match(salida, /Participaciones declaradas: 0/);
  assert.match(salida, /Registros académicos excluidos/);
});

function montarCamara({ usarNativo = true, alternativo, responder, abrirCamara, sinAPI = false } = {}) {
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
    navigator: sinAPI ? {} : { mediaDevices: { async getUserMedia(opciones) {
      assert.equal(opciones.audio, false);
      const stream = { getTracks: () => [track] };
      return abrirCamara ? abrirCamara(stream) : stream;
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

test("distingue permiso denegado, cámara ausente y navegador sin API", async () => {
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
  const camara = montarCamara({ abrirCamara: stream => new Promise(resolve => {
    permitir = () => resolve(stream);
  }) });
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

test("permite cambiar de captura manual a automática al volver al visor", async () => {
  const camara = montarCamara({ responder: () => Response.json({
    total_alumnos: 1, estudiantes: [{ id: 1, nombre: "Estudiante 1" }]
  }) });
  const { e, peticiones } = camara;
  e["auto-capture-enabled"].checked = false;
  await e["btn-start-camera"].listeners.click();
  await camara.revisar(500);
  assert.equal(peticiones.length, 0);
  await e["btn-capture-predict"].listeners.click();
  assert.equal(peticiones.length, 1);
  assert.match(camara.estado(), /1 persona · identidad desconocida/);
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

test("el lienzo deja pasar clics al encendido y el visor distingue un error de reproducción", async () => {
  const css = readFileSync(join(raiz, "frontend/style.css"), "utf8");
  assert.match(css, /#overlay-canvas\s*\{[^}]*pointer-events:\s*none/);
  assert.match(css, /#overlay-canvas\.interactivo\s*\{[^}]*pointer-events:\s*auto/);
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

test("el fotograma en modo facial se envía como imagen real sin contexto de aula", async () => {
  const { e, peticiones } = montarCamara({ responder: () => Response.json({
    fuentes: { imagen: { estado: "modelo_no_disponible" } }
  }) });
  e["modo-analisis-captura"].value = "facial";
  await e["btn-start-camera"].listeners.click();
  await e["btn-capture-predict"].listeners.click();
  assert.match(peticiones[0].url, /\/analisis-experimental$/);
  assert.deepEqual(JSON.parse(peticiones[0].opciones.body), {
    schema_version: 1, imagen: { imagen_b64: "data:image/jpeg;base64,DEMO", modelo_facial: "real" }
  });
  assert.match(e["capture-status-text"].textContent, /Modelo facial no disponible/);
});

test("el aviso del lienzo se limita al modo Aula y la interfaz distingue resultados faciales", async () => {
  let dibujar;
  const avisos = [];
  const respuestas = [
    { total_alumnos: 0, estudiantes: [] },
    { fuentes: { imagen: { estado: "abstencion", rostros_detectados: 1, puntajes_calibrados: { neutral: 0.42 } } } },
    { fuentes: { imagen: { estado: "evidencia_insuficiente", deteccion_facial: "sin_rostro", rostros_detectados: 0 } } },
    { fuentes: { imagen: { estado: "evidencia_insuficiente", deteccion_facial: "rostro_pequeno", rostros_detectados: 1 } } },
    { fuentes: { imagen: { estado: "error_inferencia" } } },
  ];
  const e = montar({
    window: { addEventListener() {} },
    setInterval() {},
    requestAnimationFrame(fn) { dibujar = fn; },
    FileReader: class {
      readAsDataURL() {
        this.result = "data:image/png;base64,FOTO";
        this.onload();
        this.onloadend();
      }
    },
    fetch: async url => Response.json(url.endsWith("/api/modulos") ? {} : respuestas.shift()),
  }, elementos => {
    elementos["overlay-canvas"].getContext = () => ({
      clearRect() {}, fillRect() {}, fillText(texto) { avisos.push(texto); },
    });
  });
  const entrada = e["input-upload-image"];
  const subir = async () => {
    entrada.files = [{ name: "foto.png" }];
    await entrada.listeners.change({ target: entrada });
    dibujar();
  };
  await subir();
  assert.match(e["capture-status-text"].textContent, /No se detectaron personas/);
  assert.match(avisos.pop(), /Sin personas detectadas/);
  e["modo-analisis-captura"].value = "facial";
  for (const mensaje of [/Rostro detectado.*Abstención/, /No se detectó ningún rostro/,
                         /Rostro detectado.*Demasiado pequeño/, /Error técnico/]) {
    await subir();
    assert.match(e["capture-status-text"].textContent, mensaje);
    assert.equal(e["students-count-badge"].textContent, "Modo Aula");
    assert.deepEqual(avisos, []);
  }
});

test("la foto facial anticipa la vista previa, limita archivos y permite reintentar tras timeout", async () => {
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
      assert.match(url, /\/analisis-experimental$/);
      assert.equal(e["captured-image-display"].style.display, "block");
      assert.match(e["capture-status-text"].textContent, /Fotografía seleccionada/);
      if (++peticiones === 1) return new Promise((_, reject) => signal.addEventListener("abort", reject));
      return Response.json({ fuentes: { imagen: { estado: "abstencion", puntajes_calibrados: { neutral: 0.42 } } } });
    }
  });
  e["modo-analisis-captura"].value = "facial";
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

test("captura facial con abstención actualiza el panel facial con 4 probabilidades reales y oculta categorías no evaluadas", async () => {
  const e = montar({
    FileReader: class {
      readAsDataURL() { this.result = "data:image/jpeg;base64,FOTO"; this.onload(); this.onloadend(); }
    },
    fetch: async () => Response.json({
      fuentes: {
        imagen: {
          estado: "abstencion",
          rostros_detectados: 1,
          puntajes_calibrados: { neutral: 0.313, alegria: 0.312, enojo: 0.236, tristeza: 0.139 },
          criterio_abstencion: { umbral: 0.55, margen_minimo: 0.10, motivos: ["probabilidad_insuficiente", "margen_insuficiente"] },
          modelo: { algoritmo: "hog_svm", version: "fase8-1.0", dataset: { nombre: "CMU Face Images" } }
        }
      }
    })
  });
  e["modo-analisis-captura"].value = "facial";
  const entrada = e["input-upload-image"];
  entrada.files = [{ name: "prueba.jpg" }];
  await entrada.listeners.change({ target: entrada });

  // 1. Panel facial muestra 4 expresiones y modelo real
  assert.match(e["facial-card-title"].textContent, /4 Expresiones Observables/);
  assert.match(e["facial-card-sublabel"].textContent, /CMU Face Images/);
  assert.equal(e["emo-item-miedo"].style.display, "none");
  assert.equal(e["emo-item-sorpresa"].style.display, "none");
  assert.equal(e["emo-item-disgusto"].style.display, "none");
  assert.equal(e["emo-pct-neutral"].textContent, "31.3%");
  assert.equal(e["emo-pct-felicidad"].textContent, "31.2%");
  assert.equal(e["emo-pct-enojo"].textContent, "23.6%");
  assert.equal(e["emo-pct-tristeza"].textContent, "13.9%");
  assert.match(e["dominant-emotion-text"].textContent, /Abstención preventiva/);
  assert.match(e["dominant-emotion-text"].textContent, /probabilidad insuficiente.*margen insuficiente/);

  // 2. Tarjeta académica no inventa notas
  assert.equal(e["riesgo-score-num"].textContent, "—");
  assert.match(e["riesgo-nivel-text"].textContent, /Predicción académica no disponible/);

  // 3. Sucesos indican no aplicable a captura facial individual
  assert.match(e["causes-list"].innerHTML, /No aplicable a captura facial individual/);

  // 4. Asistente predictivo resume la ejecución
  assert.match(e["assistant-narrative-text"].innerHTML, /1 rostro detectado/);
  assert.match(e["assistant-narrative-text"].innerHTML, /Abstención del modelo HOG\+SVM/);
  assert.match(e["assistant-narrative-text"].innerHTML, /No disponible \(faltan notas curriculares/);
});

test("captura facial con clasificación destaca la expresión observable sin atribuir diagnóstico interno", async () => {
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
          puntajes_calibrados: { neutral: 0.15, alegria: 0.72, enojo: 0.08, tristeza: 0.05 },
          modelo: { algoritmo: "hog_svm", version: "fase8-1.0", dataset: { nombre: "CMU Face Images" } }
        }
      }
    })
  });
  e["modo-analisis-captura"].value = "facial";
  const entrada = e["input-upload-image"];
  entrada.files = [{ name: "alegria.jpg" }];
  await entrada.listeners.change({ target: entrada });

  assert.match(e["dominant-emotion-text"].textContent, /Expresión observable: Alegria/);
  assert.equal(e["emo-pct-felicidad"].textContent, "72.0%");
  assert.equal(e["emo-pct-neutral"].textContent, "15.0%");
  assert.equal(e["riesgo-score-num"].textContent, "—");
  assert.match(e["riesgo-nivel-text"].textContent, /Predicción académica no disponible/);
});

test("panel experimental con calificaciones G1 y G2 actualiza la proyección académica independientemente", async () => {
  const e = montar({
    fetch: async () => Response.json({
      schema_version: 1,
      fuentes: { imagen: { estado: "sin_entrada" } },
      academico: {
        estado: "estimacion_experimental",
        desenlace_estimado: "no_aprueba",
        probabilidad_no_aprueba: 0.78,
        puntajes_calibrados: { aprueba: 0.22, no_aprueba: 0.78 },
        corte: "despues_g2",
        modelo: { algoritmo: "logistic_regression", version: "fase7-1.0", dataset: "UCI Student Performance" },
        limitacion: "Uso de investigación."
      },
      sincronizacion: { estado: "fuentes_insuficientes", fuentes_elegibles: [] }
    })
  });
  e["experimental-json"].value = JSON.stringify({
    schema_version: 1, academico: { G1: 6, G2: 7, corte: "despues_g2", escala: "0-20" }
  });
  await e["analisis-experimental"].listeners.submit({ preventDefault() {} });

  assert.equal(e["riesgo-score-num"].textContent, "78");
  assert.match(e["riesgo-nivel-text"].textContent, /Riesgo de desaprobación/);
  assert.match(e["exam-risk-desc"].textContent, /UCI Student Performance/);
});

test("cambio de modalidad entre facial y aula actualiza los avisos de captura y prepara la interfaz", async () => {
  const e = montar();
  e["modo-analisis-captura"].value = "aula";
  e["modo-analisis-captura"].listeners.change({ target: e["modo-analisis-captura"] });
  assert.match(e["capture-status-text"].textContent, /Modo captura de aula histórica/);

  e["modo-analisis-captura"].value = "facial";
  e["modo-analisis-captura"].listeners.change({ target: e["modo-analisis-captura"] });
  assert.match(e["capture-status-text"].textContent, /Modo facial experimental/);
});

test("recuperación tras error de inferencia no congela la interfaz y permite reintento", async () => {
  let intentos = 0;
  const e = montar({
    FileReader: class {
      readAsDataURL() { this.result = "data:image/jpeg;base64,FOTO"; this.onload(); this.onloadend(); }
    },
    fetch: async () => {
      intentos++;
      if (intentos === 1) return new Response(null, { status: 500 });
      return Response.json({
        fuentes: {
          imagen: {
            estado: "abstencion", rostros_detectados: 1,
            puntajes_calibrados: { neutral: 0.4, alegria: 0.3, enojo: 0.2, tristeza: 0.1 }
          }
        }
      });
    }
  });
  e["modo-analisis-captura"].value = "facial";
  const entrada = e["input-upload-image"];
  entrada.files = [{ name: "foto.jpg" }];
  await entrada.listeners.change({ target: entrada });

  assert.match(e["capture-status-text"].textContent, /El motor de predicción no pudo analizar la imagen/);
  assert.match(e["dominant-emotion-text"].textContent, /Error técnico/);
  assert.equal(entrada.disabled, false);

  // Segundo intento: se recupera exitosamente
  entrada.files = [{ name: "foto2.jpg" }];
  await entrada.listeners.change({ target: entrada });
  assert.match(e["capture-status-text"].textContent, /Abstención/);
  assert.equal(e["emo-pct-neutral"].textContent, "40.0%");
});
