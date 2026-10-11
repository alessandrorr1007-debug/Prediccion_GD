const payload = document.querySelector('#payload');
const run = document.querySelector('#run');
const status = document.querySelector('#status');
const result = document.querySelector('#result');
const localHost = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);
const API_BASE = window.location.port === '8001'
  ? ''
  : localHost
    ? 'http://127.0.0.1:8001'
    : 'https://prediccion-backend-dwq9.onrender.com';

const example = {
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

async function loadModules() {
  const response = await fetch(`${API_BASE}/api/modulos`);
  const data = await response.json();
  const target = document.querySelector('#modules');
  target.replaceChildren();
  for (const module of data.modulos) {
    const card = document.createElement('div');
    card.className = 'module';
    const title = document.createElement('strong');
    title.textContent = module.nombre;
    const state = document.createElement('small');
    state.textContent = module.estado.replaceAll('_', ' ');
    card.append(title, state);
    if (module.repositorio) {
      const repository = document.createElement('a');
      repository.href = module.repositorio;
      repository.textContent = 'Repositorio del equipo';
      repository.target = '_blank';
      repository.rel = 'noreferrer';
      card.append(repository);
    }
    target.append(card);
  }
}

run.onclick = async () => {
  run.disabled = true;
  result.textContent = '';
  status.textContent = 'Procesando señales…';
  try {
    const body = JSON.parse(payload.value);
    const response = await fetch(`${API_BASE}/api/prediccion/integrar`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'No se pudo integrar la entrada');
    status.textContent = `Nivel de revisión: ${data.nivel_revision.replaceAll('_', ' ')}`;
    result.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    status.textContent = error.message;
  } finally {
    run.disabled = false;
  }
};

payload.value = JSON.stringify(example, null, 2);
status.textContent = 'Ejemplo listo.';
loadModules().catch(error => { status.textContent = error.message; });
