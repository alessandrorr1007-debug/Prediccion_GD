# AulaPredict · Predicción

Prototipo académico de Percepción Computacional. Predicción consume resultados de los otros grupos mediante adaptadores, cruza observaciones atribuidas con registros sintéticos y produce evidencia para revisión humana. Los modelos de los grupos externos se mantienen en sus propios proyectos.

Consulta la [guía de demostración de Predicción](docs/GUIA_DEMOSTRACION_PREDICCION.md) para repetir la sustentación con casos sintéticos.

Para conectar IMAGEN, VIDEO, AUDIO y registros curriculares, usa la [guía de integración HTTP](docs/GUIA_INTEGRACION_PREDICCION.md). El [inventario de modelos](docs/MODELOS_INFERENCIA.md) incluye las huellas de los pesos auditados, sus fuentes y los comandos para entrenar los clasificadores de investigación desde los datos oficiales.

El [motor experimental](docs/MOTOR_PREDICCION_EXPERIMENTAL.md) evalúa expresiones y descriptores acústicos declarados por separado, y documenta los indicadores de asistencia, participación y prioridad académica.

## Arquitectura

- **Revisión de exámenes.** `backend/modulos/prediccion/engine.py` calcula un índice heurístico a partir de eventos normalizados. El adaptador conjunto usa exportaciones JSON de imagen y video.
- **Seguimiento académico.** `backend/modulos/prediccion/seguimiento.py` usa identidad explícita, sesión, observaciones e historial aportado. La coincidencia con emociones se documenta como evidencia. La emoción y el evento familiar no suman puntos.
- **Predicción experimental por captura.** `backend/entrenamiento_prediccion/predictor.py` detecta candidatos con YOLO opcional o Haar, obtiene rasgos visuales y ejecuta dos Random Forest entrenados con datos sintéticos. Las referencias del encuadre no identifican institucionalmente a una persona.
- **Visión heurística.** `backend/modulos/vision_service.py` mejora imágenes, analiza rasgos y calcula una proyección experimental cuando hay rostro. Su salida se mantiene separada del seguimiento académico.
- **Web.** FastAPI sirve `frontend/index.html`, `app.js` y `style.css`. Node se usa para pruebas. El archivo TSX es una referencia aparte.
- **Recepción automática.** El canal local procesa lotes multimodales, deduplica eventos y mantiene el último resultado publicado en RAM para el panel. Cada modalidad conserva su estado y procedencia.

## Instalación y arranque

**Python 3.11.15.** La instalación base usa una sola variante de OpenCV, `opencv-python-headless`. Se fijan las dependencias directas y SciPy en `backend/requirements-core.txt`, con scikit-learn 1.9.1 para los pickle versionados. Los pesos YOLO y PyTorch son opcionales.

### Windows

Desde la raíz del clon, con [uv](https://docs.astral.sh/uv/) instalado:

```powershell
uv venv --python 3.11.15 backend/.venv
uv pip install --python ./backend/.venv/Scripts/python.exe -r requirements.txt
./iniciar-prediccion.ps1
```

Con Python 3.11.15 disponible en el lanzador, también puedes crear el entorno con `py -3.11 -m venv backend/.venv` e instalar con `./backend/.venv/Scripts/python.exe -m pip install -r requirements.txt`.

### Linux

```bash
uv venv --python 3.11.15 backend/.venv
uv pip install --python backend/.venv/bin/python -r requirements.txt
backend/.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8001
```

Abre [el panel](http://localhost:8001) o verifica [el endpoint de salud](http://localhost:8001/api/salud). En [Render](https://render.com/docs/python-version), `render.yaml` fija Python 3.11.15, instala `requirements.txt` y escucha en `$PORT`. El seguimiento académico sigue siendo una demo local y rechaza accesos remotos.

Si 8001 está ocupado, ejecuta Uvicorn con `--host 127.0.0.1 --port 18001 --no-proxy-headers` y abre `http://127.0.0.1:18001/`. Para verificar la entrega, instala también `tests/requirements.txt` y sigue los [comandos de prueba](docs/GUIA_INTEGRACION_PREDICCION.md#82-levantar-servidor-y-ejecutar-pruebas).

### Cámara y seguimiento en la web

Pulsa **Iniciar visor de cámara** para conceder acceso. La captura automática busca un rostro localmente con `FaceDetector` o con MediaPipe y envía solo el fotograma elegido a AulaPredict. El intervalo inicial es de 5 segundos por cámara. El respaldo de MediaPipe necesita acceso a los recursos indicados en la [guía del frontend](frontend/README.md). Puedes capturar manualmente, subir una foto o detener el visor. En **Seguimiento académico** puedes evaluar los JSON sintéticos y revisar fuentes, coincidencias y destinatarios sugeridos.

### Modelos opcionales y diagnóstico

- El perfil base ejecuta los motores de reglas y, con los dos `.pkl` versionados, el predictor visual con respaldo Haar. Sin rostro, visión devuelve `emociones: null` y `prediccion: null`. Si faltan los clasificadores de captura, el endpoint indica la cantidad de personas detectadas por separado y entrega cero estimaciones.
- Para usar YOLO en otro entorno nuevo, instala `backend/requirements-yolo.txt` **en lugar de** `requirements.txt`. Ese perfil incluye Ultralytics, PyTorch, torchvision y únicamente `opencv-python`. Usa pesos de procedencia conocida, `best.pt` y/o `yolo11n-pose.pt`, en `backend/modelo_ia/` o exporta `AULAPREDICT_YOLO_DIR` con su directorio. Reinicia el proceso después de cambiar pesos o dependencias. Los `.pt` están ignorados en Git.
- `GET /api/vision/estado` distingue presencia de pesos y carga. Las respuestas visuales indican `estado_modelos` y si la inferencia se ejecutó. `modo_respaldo` identifica resultados con capacidades reducidas. Un fallo de inferencia principal devuelve HTTP 500 con `estado: error_inferencia`.

## API

- `GET /api/salud` y `GET /api/modulos` — salud del motor de reglas y manifiestos de integración.
- `POST /api/prediccion` y `POST /api/prediccion/integrar` — eventos normalizados y formatos de imagen/video.
- `POST /api/prediccion/estudiantes` y `GET /api/prediccion/estudiantes/ejemplos/{caso}` — seguimiento y doce ejemplos sintéticos, solo en local.
- `POST /api/prediccion/analisis-experimental` — análisis independiente de imagen, fotograma o descriptores acústicos.
- `POST /api/prediccion/recepcion`, `GET /api/prediccion/recepcion/ultima`, `POST /api/prediccion/recepcion/reiniciar` y `GET /api/prediccion/diagnostico` — canal automático de loopback.
- `POST /api/prediccion/orquestar`, `POST /api/prediccion/demostracion-integral` y `GET /api/prediccion/modelos-investigacion` — orquestación, demostración y estado de artefactos de investigación.
- `POST /api/prediccion/analizar-captura` y `POST /api/vision/analizar` — JSON con `imagen_b64` y opciones de cada ruta. Véase el [contrato de captura](docs/CONTRATO_MODULOS.md#captura-visual-de-predicción).
- `GET /api/vision/estado`, `GET /api/prediccion/ejemplo-aula` y `GET /api/prediccion/modelo/metricas` — diagnóstico, cinco perfiles ficticios y métricas.
- `GET /docs` — documentación interactiva.

## Entrenamiento sintético

Con el entorno instalado, ejecuta desde la raíz:

```powershell
./backend/.venv/Scripts/python.exe -m backend.entrenamiento_prediccion.entrenar_prediccion --salida _archivo/entrenamiento_demo
```

En Linux usa `backend/.venv/bin/python`. El [notebook reproducible](docs/entrenamiento_sintetico.ipynb) ejecuta el mismo pipeline. La carpeta de salida es local y no reemplaza los pesos versionados. Los porcentajes y métricas corresponden a distribuciones y etiquetas generadas en código. Sirven para reproducir el experimento, con validez desconocida en estudiantes reales. El índice de examen, la prioridad académica y las estimaciones por captura tienen significados distintos.

## Equipos conectados

- **Imagen:** [SistemaSupervisionExamenes-Imagen](https://github.com/Zudo45/SistemaSupervisionExamenes-Imagen).
- **Video:** [SistemaSupervisionExamenes](https://github.com/cesarcabanillas1921-bit/SistemaSupervisionExamenes).
- **Audio:** la API admite señales vocales y conserva por separado las observaciones de asistencia o transcripción. Queda por validar el contrato con el productor externo. Los manifiestos están en `backend/modulos/` y los ejemplos sintéticos en `ejemplos/`.

## Seguimiento por estudiante

En la interfaz, **Integración de fuentes** consulta `GET /api/modulos`. Muestra disponibilidad declarada del adaptador y validación pendiente del productor. En **Seguimiento académico** carga un ejemplo y evalúa.
La demo de Juan Pérez (personaje ficticio) combina tres observaciones de teléfono
no permitido, dos tareas pendientes, una reunión incumplida y evaluación próxima:
prioridad **90/100**, con evidencia, reglas activadas y revisión sugerida por docente/tutor.
No afirma uso del celular, distracción, problemas emocionales ni desaprobación.

```powershell
$json = Get-Content ejemplos/seguimiento_juan_sintetico.json -Raw -Encoding UTF8
Invoke-RestMethod -Uri http://localhost:8001/api/prediccion/estudiantes -Method Post -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($json))
```

También existen ejemplos sin alerta, identidad desconocida, datos insuficientes,
contradicciones, duplicados, observación aislada y cambio de patrón observado.
Todos se identifican como sintéticos en nombre y contenido. El historial se aporta
en cada petición: no se almacena ni se consulta una base institucional.

El [caso multimodal](ejemplos/seguimiento_multimodal_sintetico.json) combina JSON de imagen y video, un conteo de captura sin identidad y tareas pendientes. Devuelve prioridad **30/100** por tareas y evaluación próxima. Ambas fuentes visuales describen una sola ocurrencia de teléfono. Su coincidencia queda documentada sin sumar puntos. El [contrato de seguimiento](docs/SEGUIMIENTO_ESTUDIANTES.md#reutilización-de-resultados-actuales) detalla procedencia, atribución, deduplicación y errores por fuente.

La API B **rechaza conexiones remotas y proxies**, exige `simulado:true` y no guarda
datos. No tiene autenticación: usar exclusivamente datos ficticios y conexión local
directa. No publicar el flujo mediante túneles. AUDIO permanece pendiente; emociones
no puntúan y no se afirma que los productores actuales las entreguen.

## Contratos recibidos

Consulta [CONTRATO_MODULOS.md](docs/CONTRATO_MODULOS.md) para campos, estados,
tiempos y diferencias entre las versiones publicadas de los equipos.

### IMAGEN

Se acepta `frames[].objetos` y el JSON de un frame individual del vigilante.
Objetos `confirmada` y `recuperada` generan eventos; `no_confirmada` y
`no_detectada` se descartan. Formatos desconocidos se rechazan explícitamente.
Las confianzas se priorizan: procesada, capturada, VIDEO y genérica.

`calidad` es un diccionario de métricas antes/después, no una confianza 0–1.
Se usa `calidad_normalizada` si se proporciona; si falta, se mantiene **1
provisional**, sin convertir métricas ni afirmar calidad medida.

Se aceptan segundos de 0 a 86400 o fechas ISO consistentes. Para combinar fechas
de IMAGEN con VIDEO se exige `imagen.origen_temporal` (fecha del segundo cero de
VIDEO, con la misma convención de zona). Sin VIDEO se mantiene la conversión
anterior relativa al mínimo del lote. Los índices de carpetas no equivalen a
segundos: necesitan un mapeo temporal externo para cruzarlos con VIDEO.

`sesion_id` opcional, origen y tiempo delimitan los IDs; reenvíos conservan IDs.
Entre sesiones distintas hay que indicar `sesion_id`. Se preservan los IDs del
formato anterior sin origen/sesión. No hay emociones ni identidad en la exportación
inspeccionada; `persona_asociada` solo es un índice geométrico del frame.

`ejemplos/imagen_exportacion_sintetica.json` es **sintético**, fiel al esquema
del commit `eddc6234` del 8 de octubre de 2026. **Falta validar con una salida real
de IMAGEN**, que puede estar usando una versión distinta al repositorio publicado.
Puede reemplazarse por una exportación real acumulada sin cambiar las pruebas del ejemplo.

```powershell
$imagen = Get-Content ejemplos/imagen_exportacion_sintetica.json -Raw | ConvertFrom-Json
$entrada = @{imagen = $imagen} | ConvertTo-Json -Depth 30
Invoke-RestMethod -Uri http://localhost:8001/api/prediccion/integrar -Method Post -ContentType 'application/json' -Body $entrada
```

### AUDIO

Pendiente de repositorio y contrato. Su carpeta contiene únicamente `modulo.json`
y `.gitkeep`; no se incluye modelo ni análisis acústico. La integración AUDIO
devuelve error explícito. Los eventos internos sintéticos de audio en
`ejemplos/prediccion.json` no representan una integración real.

### Contrato de VIDEO

El adaptador acepta el formato anterior `{"frames": [...]}` y el JSON por alerta
de VIDEO (`schema_version: 1`, `modulo: "VIDEO"`, UUID hexadecimal `evento_id`,
`frame_id`, `timestamp` y `detecciones`). Rechaza formatos no reconocidos y
versiones distintas de 1 con `ValueError`; `frames: []` sigue siendo válido.

El tiempo usado es `timestamp`, en segundos de la foto seleccionada, dentro de
0–86400; valores fuera del límite generan un error explícito. No se sustituye
por la fecha del reloj ni por `evento.confirmacion_video_seg`.
La confirmación temporal (o un eventual `evento.confirmado`) es solo metadato:
no prueba uso del celular ni equivale a persistencia en el motor.

Cada detección genera `video:alerta:<evento_id>:deteccion:<índice>`; los IDs de
seguimiento `telefono_id` y `persona_id` no identifican eventos de predicción.
La señal derivada de varias personas también queda delimitada por el UUID.
Reenviar la misma alerta conserva sus IDs para la deduplicación del motor.
Las personas se cuentan desde `detecciones`, sin duplicarlas con `personas_seguidas`.

`modelo` contiene los nombres ordenados de `modelos`, hasta 200 caracteres;
los SHA256 completos no se incorporan al contrato normalizado. Cajas, asociaciones
y demás metadatos permanecen en el JSON de origen. VIDEO no exporta calidad:
se usa **1 por defecto**, una limitación que no implica calidad medida.
ALIAS se mantiene únicamente en `video/adapter.py` y lo importa el motor.
No se agregaron clases ni pesos: VIDEO emite `telefono` (peso .85) y `persona`
(contextual); se conserva la regla existente de `multiples_personas`.

`ejemplos/video_alerta_v1_sintetica.json` es **sintético**, con un campo `_nota`
que lo identifica, cajas originales y el esquema del productor versión 1.
No incluye JPG ni pesos. **Falta validar con una salida real del equipo de VIDEO.**
Puede sustituirse el contenido del archivo por un JSON real v1, sin cambiar las
pruebas: estas comparan el resultado con los campos del propio ejemplo.

Para reproducir la integración desde PowerShell con el servidor iniciado:

```powershell
$alerta = Get-Content ejemplos/video_alerta_v1_sintetica.json -Raw | ConvertFrom-Json
$entrada = @{video = $alerta} | ConvertTo-Json -Depth 30
Invoke-RestMethod -Uri http://localhost:8001/api/prediccion/integrar -Method Post -ContentType 'application/json' -Body $entrada
```

## Verificación

```powershell
uv pip install --python ./backend/.venv/Scripts/python.exe -r tests/requirements.txt
./backend/.venv/Scripts/python.exe -B -m unittest discover -s tests -v
node --test tests/test_frontend.cjs
```

En Linux usa `backend/.venv/bin/python`. Si el entorno está en otra ruta, fija `PYTHON_FOR_TESTS` al ejecutable antes de correr Node.
