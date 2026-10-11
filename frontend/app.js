const localHost = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);
const API_BASE = window.location.port === '8001'
  ? ''
  : localHost
    ? 'http://127.0.0.1:8001'
    : 'https://prediccion-backend-dwq9.onrender.com';

const elements = {
  modules: document.querySelector('#modules'),
  connectionDot: document.querySelector('#connection-dot'),
  connectionText: document.querySelector('#connection-text'),
  videoFile: document.querySelector('#video-file'),
  imageFile: document.querySelector('#image-file'),
  videoSource: document.querySelector('#video-source'),
  imageSource: document.querySelector('#image-source'),
  videoStatus: document.querySelector('#video-status'),
  imageStatus: document.querySelector('#image-status'),
  allowed: document.querySelector('#allowed'),
  analyze: document.querySelector('#analyze'),
  demo: document.querySelector('#demo'),
  reset: document.querySelector('#reset'),
  feedback: document.querySelector('#feedback'),
  payload: document.querySelector('#payload'),
  emptyResult: document.querySelector('#empty-result'),
  predictionResult: document.querySelector('#prediction-result'),
  docsLink: document.querySelector('#docs-link'),
};

elements.docsLink.href = `${API_BASE}/docs`;

const state = {video: null, imagen: null};

const demoPayload = {
  segundo_actual: 12,
  objetos_permitidos: ['libro'],
  video: {
    modelo: 'SistemaSupervisionExamenes/best.pt',
    frames: [{
      frame_id: 80,
      timestamp: 10,
      calidad: 0.9,
      detecciones: [
        {clase: 'persona', confianza: 0.91},
        {clase: 'telefono', confianza: 0.82},
      ],
    }],
  },
  imagen: {
    modelo: 'SistemaSupervisionExamenes-Imagen',
    frames: [{
      frame_id: 80,
      timestamp: 10,
      calidad_normalizada: 0.85,
      objetos: [{
        id: 'objeto-1',
        clase: 'telefono',
        confianza_video: 0.82,
        confianza_procesada: 0.88,
        estado: 'confirmada',
      }],
    }],
  },
};

function currentPayload() {
  const payload = {};
  const allowed = elements.allowed.value.split(',').map(item => item.trim()).filter(Boolean);
  if (allowed.length) payload.objetos_permitidos = allowed;
  if (state.video) payload.video = state.video;
  if (state.imagen) payload.imagen = state.imagen;
  return payload;
}

function syncPayload() {
  elements.payload.value = JSON.stringify(currentPayload(), null, 2);
}

function setConnection(online) {
  elements.connectionDot.className = online ? 'online' : 'offline';
  elements.connectionText.textContent = online ? 'Sistema disponible' : 'Sin conexión';
}

function moduleLabel(name) {
  return {imagen: 'Imagen', video: 'Video', audio: 'Audio', prediccion: 'Predicción'}[name] || name;
}

async function loadModules() {
  try {
    const response = await fetch(`${API_BASE}/api/modulos`);
    if (!response.ok) throw new Error('No se pudo consultar el sistema');
    const data = await response.json();
    elements.modules.replaceChildren();
    for (const module of data.modulos) {
      const card = document.createElement(module.repositorio ? 'a' : 'div');
      card.className = `module module-${module.nombre}`;
      if (module.repositorio) {
        card.href = module.repositorio;
        card.target = '_blank';
        card.rel = 'noreferrer';
      }
      const icon = document.createElement('span');
      icon.className = 'module-icon';
      icon.textContent = {imagen: '◇', video: '▶', audio: '◖', prediccion: '⌁'}[module.nombre] || '•';
      const copy = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = moduleLabel(module.nombre);
      const detail = document.createElement('small');
      const ready = !module.estado.startsWith('pendiente');
      detail.className = ready ? 'ready' : 'pending';
      detail.textContent = ready ? 'Conectado' : 'Pendiente';
      copy.append(title, detail);
      const arrow = document.createElement('span');
      arrow.className = 'module-arrow';
      arrow.textContent = module.repositorio ? '↗' : '—';
      card.append(icon, copy, arrow);
      elements.modules.append(card);
    }
    setConnection(true);
  } catch (error) {
    setConnection(false);
    elements.feedback.textContent = error.message;
  }
}

function normalizeSource(data, type) {
  const source = data[type] || data;
  if (source && Array.isArray(source.frames)) return source;
  throw new Error(`El archivo no contiene resultados válidos de ${type.toUpperCase()}.`);
}

async function loadFile(file, type) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    state[type] = normalizeSource(data, type);
    const frameCount = state[type].frames.length;
    const status = type === 'video' ? elements.videoStatus : elements.imageStatus;
    const source = type === 'video' ? elements.videoSource : elements.imageSource;
    status.textContent = `${file.name} · ${frameCount} ${frameCount === 1 ? 'fotograma' : 'fotogramas'}`;
    source.classList.add('loaded');
    elements.feedback.textContent = 'Archivo cargado correctamente.';
    syncPayload();
  } catch (error) {
    elements.feedback.textContent = error.message;
  }
}

function setDemo() {
  state.video = structuredClone(demoPayload.video);
  state.imagen = structuredClone(demoPayload.imagen);
  elements.allowed.value = 'libro';
  elements.videoStatus.textContent = 'Demostración · 1 fotograma';
  elements.imageStatus.textContent = 'Demostración · 1 fotograma';
  elements.videoSource.classList.add('loaded');
  elements.imageSource.classList.add('loaded');
  elements.feedback.textContent = 'Caso de demostración listo para analizar.';
  syncPayload();
}

function clearAll() {
  state.video = null;
  state.imagen = null;
  elements.videoFile.value = '';
  elements.imageFile.value = '';
  elements.allowed.value = '';
  elements.videoStatus.textContent = 'Seleccionar archivo JSON';
  elements.imageStatus.textContent = 'Seleccionar archivo JSON';
  elements.videoSource.classList.remove('loaded');
  elements.imageSource.classList.remove('loaded');
  elements.feedback.textContent = 'Carga al menos un resultado para comenzar.';
  elements.payload.value = '{}';
  elements.emptyResult.hidden = false;
  elements.predictionResult.hidden = true;
}

function riskText(level) {
  return {
    alto: 'Las señales requieren atención prioritaria y revisión de la evidencia.',
    moderado: 'Se encontraron señales que conviene revisar antes de tomar una decisión.',
    bajo: 'Las señales detectadas presentan un nivel bajo de revisión.',
    datos_insuficientes: 'No hay información válida suficiente para generar una evaluación.',
  }[level] || 'Resultado disponible para revisión.';
}

function renderModalities(data) {
  const target = document.querySelector('#modalities');
  target.replaceChildren();
  for (const name of ['imagen', 'video', 'audio']) {
    const chip = document.createElement('span');
    const available = data.modalidades_disponibles.includes(name);
    chip.className = available ? 'chip available' : 'chip missing';
    chip.textContent = `${available ? '✓' : '○'} ${moduleLabel(name)}`;
    target.append(chip);
  }
}

function renderEvidence(items) {
  const target = document.querySelector('#evidence');
  target.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'no-evidence';
    empty.textContent = 'No se encontraron señales que requieran revisión.';
    target.append(empty);
    return;
  }
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'evidence-item';
    const icon = document.createElement('span');
    icon.className = 'evidence-icon';
    icon.textContent = '!';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = item.senal.replaceAll('_', ' ');
    const detail = document.createElement('small');
    detail.textContent = `${item.modalidades.map(moduleLabel).join(' + ')} · ${item.explicacion}`;
    copy.append(title, detail);
    const score = document.createElement('strong');
    score.className = 'evidence-score';
    score.textContent = item.indice.toFixed(1);
    row.append(icon, copy, score);
    target.append(row);
  }
}

function renderResult(data) {
  const value = data.indice_revision ?? 0;
  const level = data.nivel_revision;
  const ring = document.querySelector('#score-ring');
  ring.style.setProperty('--score', `${value}%`);
  ring.dataset.level = level;
  document.querySelector('#score').textContent = value.toFixed(1);
  const badge = document.querySelector('#risk-badge');
  badge.className = `risk-badge ${level}`;
  badge.textContent = level.replaceAll('_', ' ');
  document.querySelector('#risk-title').textContent = level === 'datos_insuficientes' ? 'Información insuficiente' : `Revisión ${level}`;
  document.querySelector('#risk-description').textContent = riskText(level);
  document.querySelector('#source-count').textContent = data.integracion.fuentes_recibidas.length;
  document.querySelector('#event-count').textContent = data.integracion.eventos_generados;
  document.querySelector('#evidence-count').textContent = data.evidencia.length;
  document.querySelector('#recommendation').textContent = data.recomendacion;
  document.querySelector('#result-time').textContent = `Actualizado ${new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`;
  document.querySelector('#raw-result').textContent = JSON.stringify(data, null, 2);
  renderModalities(data);
  renderEvidence(data.evidencia);
  elements.emptyResult.hidden = true;
  elements.predictionResult.hidden = false;
}

async function analyze() {
  let body;
  try {
    body = JSON.parse(elements.payload.value);
    if (!body.video && !body.imagen) throw new Error('Carga un resultado de VIDEO o IMAGEN antes de continuar.');
  } catch (error) {
    elements.feedback.textContent = error.message;
    return;
  }
  elements.analyze.disabled = true;
  elements.analyze.textContent = 'Analizando…';
  elements.feedback.textContent = 'Integrando señales y evaluando evidencia…';
  try {
    const response = await fetch(`${API_BASE}/api/prediccion/integrar`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'No se pudo generar la predicción.');
    renderResult(data);
    elements.feedback.textContent = 'Predicción generada correctamente.';
  } catch (error) {
    elements.feedback.textContent = error.message;
  } finally {
    elements.analyze.disabled = false;
    elements.analyze.innerHTML = 'Generar predicción <span>→</span>';
  }
}

elements.videoFile.addEventListener('change', () => loadFile(elements.videoFile.files[0], 'video'));
elements.imageFile.addEventListener('change', () => loadFile(elements.imageFile.files[0], 'imagen'));
elements.allowed.addEventListener('input', syncPayload);
elements.demo.addEventListener('click', setDemo);
elements.reset.addEventListener('click', clearAll);
elements.analyze.addEventListener('click', analyze);

clearAll();
loadModules();
