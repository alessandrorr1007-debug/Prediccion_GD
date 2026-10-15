# Orden y respaldo de PREDICCIÓN

Autorizado por el responsable; 15 de octubre de 2026 (America/Lima).
No se borran archivos ni se copian fuentes/modelos de equipos externos.

## Respaldo previo

`D:/Proyectos/PREDICCION_ARCHIVO/2026-10-15_09-52-25/`:

- `respaldo/`: 1140 archivos, 418373729 bytes, copiados antes de editar/mover.
- `manifiesto_respaldo.json`: ruta, tamaño y SHA256. Hashes comparados entre origen/copia.
- `archivado/`: material trasladado, con rutas relativas originales.
- `generado/`: cachés antiguas; `movimientos.json` registra los movimientos.
- Frontend y archivos modificados originales siguen en `respaldo/`.
- `.git` queda intacto en el proyecto; no se copió. Entornos y cachés se excluyeron
  del respaldo de fuentes/datos. El archivo externo no forma parte del repo.

## Inventario y clasificación

Cada grupo incluye todos los descendientes de las rutas indicadas:

- **Núcleo conservado:** `backend/app.py`, archivos `__init__.py`,
  `backend/modulos/prediccion/{api,engine,integracion}.py`, README/manifiesto;
  requisitos de raíz/backend/tests, `.python-version`, `.gitignore`, README,
  `render.yaml`, `iniciar-prediccion.ps1`, `ejemplos/` y pruebas de núcleo/adaptadores.
- **Adaptadores/contratos:** IMAGEN (`adapter.py`, README, manifiesto y paquete),
  VIDEO (adaptador, manifiesto y paquete), `modulos/README.md`.
  AUDIO queda con `modulo.json` y `.gitkeep`.
- **Archivado propio:** `data/` (418 archivos), `entrenamiento/` (648),
  `training/` (7), `models/` (6), `notebooks/` (3), `reports/` (9).
- **También archivado:** `imagen/inferencia.py`, `imagen/modelos/`,
  `video/inferencia.py`, `audio/analisis.py`, `audio/modelos/`,
  `prediccion/aula_inteligente.py`, `prediccion/medios.py`, `tests/test_medios.py`,
  `PRESENTACION_PREDICCION_PPT.md` (describía entrenamiento ajeno al alcance final).
- **Mixto, reemplazado tras respaldo:** los cuatro archivos de `frontend/`,
  `.env.example`, requisitos, arranque, manifiestos y documentación.
- **Generado/local:** `backend/.venv/` (47658 archivos en inventario) permanece
  local e ignorado; 27 archivos de caché se trasladaron con sus directorios.
  Las cachés futuras siguen ignoradas. `.vscode/` y `pyrightconfig.json`
  quedan como configuración local ignorada, fuera de la entrega.
- **Control de versiones:** `.git/` conservado intacto.

## Dependencias retiradas y pruebas

`app.py` deja de registrar `prediccion/medios.py`, que importaba las inferencias
de IMAGEN/VIDEO y el análisis AUDIO. Las inferencias llamaban a `aula_inteligente.py`.
Todo ese conjunto se archiva. El frontend sustituye cámara, micrófono y llamadas
a `/api/medios/{imagen,video,audio,rostro}` por importación/edición de JSON.

Se retiran de los requisitos numpy, Pillow, OpenCV, Ultralytics y python-multipart.
El entorno viejo conserva paquetes locales y no forma parte de la entrega.
Las ocho pruebas de medios se archivan junto a su funcionalidad; no se omiten
fallos. **Antes del orden: 31/31 pruebas pasan.** Se conservan las otras 23 y
se agregan pruebas IMAGEN, rutas retiradas y AUDIO pendiente.
**Después del orden: 37/37 pruebas pasan** (23 conservadas + 14 nuevas).
Comando: `./backend/.venv/Scripts/python.exe -B -m unittest discover -s tests -v`.
También pasan las 37 pruebas en un entorno nuevo externo,
`verificacion/.venv/`, instalado solo con `requirements.txt` y
`tests/requirements.txt`. No requiere numpy, Pillow, OpenCV ni Ultralytics.
Ese entorno nuevo emite un aviso de deprecación de Starlette/httpx, sin fallos.
La integridad tras mover también se verificó: los 1100 archivos de `archivado/`
coinciden con los SHA256 del respaldo previo. `node --check frontend/app.js` pasa.
No fue posible verificar visualmente la interfaz: no hay navegador conectado disponible.

## Estructura final

```text
backend/
  app.py
  requirements.txt
  modulos/
    imagen/       adaptador, manifiesto, documentación
    video/        adaptador, manifiesto
    audio/        modulo.json y .gitkeep
    prediccion/   api.py, engine.py, integracion.py, documentación
frontend/         recepción de JSON y revisión de evidencia
ejemplos/         entradas reproducibles
tests/            API, motor, adaptadores y alcance de entrega
docs/             contratos, inventario y respaldo
README.md
requirements.txt
render.yaml
iniciar-prediccion.ps1
```

## Restauración y Git

Restaurar solo las rutas deseadas desde `respaldo/` o `archivado/`, verificando
SHA256 contra el manifiesto. No copiar todo el respaldo sobre el proyecto.
No se hicieron commits ni push. Mover un archivo versionado fuera del repo
aparece como eliminación en Git, aunque el contenido esté preservado fuera.
`.gitignore` no retira por sí solo archivos ya versionados; revisar `git ls-files`
para confirmar que la entrega no incluya pesos ni datasets.
