# AulaPredict · Integración de Predicción en Fase 10

## Auditoría de partida

La rama `main` partió de `2dbbb88`, 24 commits por delante de `origin/main`. Pasaron 127 pruebas Python y 22 Node. Se revisaron los contratos y documentos de las Fases 6–9, los adaptadores de objetos y eventos, y los pesos locales. Se encontraron corpus públicos autorizados para investigación y fixtures del repositorio. Las exportaciones autorizadas de los equipos siguen pendientes. [Contrato de módulos](CONTRATO_MODULOS.md), [motor experimental](MOTOR_PREDICCION_EXPERIMENTAL.md), [Fase 7](ENTRENAMIENTO_FASE7.md), [Fase 8](ENTRENAMIENTO_FASE8.md), [Fase 9](ENTRENAMIENTO_FASE9.md)

## Arquitectura y contratos

`POST /api/prediccion/orquestar` compone dos entradas opcionales bajo `schema_version: 1`. `analisis` usa el contrato experimental vigente para imagen, fotograma, WAV, descriptores y G1/G2. `seguimiento` usa el contrato sintético existente para objetos y eventos de IMAGEN/VIDEO, asociaciones referenciadas, asistencia y participación normalizadas. El orquestador devuelve `analisis`, `seguimiento` y `fusion` como bloques. Los pesos se cargan bajo demanda. Los contratos de captura, análisis experimental y seguimiento anteriores siguen disponibles.

- **Sesión y tiempo.** `sesion_id` es un alcance opcional para las señales. Si se aporta, una señal con sesión ausente o distinta queda excluida antes de la inferencia. El seguimiento aplica sus propias referencias de sesión por registro. El análisis existente comprueba fechas ISO con zona horaria, naturaleza y proximidad temporal. Cuando se repite el mismo fotograma con referencias completas compatibles, se reutiliza la inferencia. Las contradicciones se informan aunque un modelo se abstenga.
- **Identidad.** Los resultados faciales, acústicos y de fusión son observaciones sin atribución personal. En seguimiento, una asociación verificada es una declaración del integrador con referencia explícita, dentro de la sesión inscrita. El sistema admite varios estudiantes en la misma sesión y excluye asociaciones desconocidas o contradictorias. Un conteo de escena permanece sin atribuir.
- **Procedencia.** Las señales del cliente indican procedencia incompleta o declarada sin verificación. La marca de corpus público verificado solo aparece en la demostración cuando el servidor verifica la huella de su archivo. Los descriptores acústicos pueden validarse como datos declarados. El clasificador requiere WAV PCM16 mono o estéreo de 8–48 kHz, entre 0.5 y 8 s. El seguimiento distingue participación cero de falta de registro.

Ejemplo con una sola modalidad y notas incompletas. Las referencias son ficticias.

```json
{
  "schema_version": 1,
  "sesion_id": "demo-local",
  "analisis": {
    "schema_version": 1,
    "audio": {"sesion_id": "demo-local", "evento_id": "voz-fixture", "fecha_hora": "2026-11-09T10:00:00-05:00", "duracion_segundos": 2, "rms_normalizado": 0.2, "naturaleza": "sintetica", "origen": "fixture"},
    "academico": {"G1": 8}
  },
  "solicitar_fusion": false
}
```

## Modelos verificados

| Modelo | Evidencia histórica | Uso en la demostración |
|---|---|---|
| CMU Face Images, HOG + SVM | Exactitud 36.8 %, F1 macro 0.308, 0 de 38 clasificaciones emitidas | Foto pública y su copia como fotograma de prueba. Ambos resultados se abstienen. |
| RAVDESS, regresión logística | Exactitud 42.5 %, F1 macro 0.404, cobertura 4.6 %. CREMA-D registró 16.7 % de exactitud externa. | WAV público. El modelo se abstiene y devuelve probabilidades. |
| UCI Student Performance | Exactitud 88.8 %, F1 macro 0.873, ROC-AUC 0.971 y cobertura 92.5 % | Estima `G3 < 10/20` con G1 y G2, al corte posterior a G2. La respuesta de notas incompletas enumera los campos faltantes. |
| Fusión RAVDESS | Exactitud 67.5 %, F1 macro 0.659, 96/240 emitidas y 79/96 correctas, ECE 0.150 | Pareja pública optativa. Se ejecutó y se abstuvo con máximo 0.455. |

La exactitud y el F1 macro se calcularon antes de aplicar la abstención. La cobertura mide emitidas sobre el total y la exactitud selectiva mide aciertos sobre emitidas. El ECE agrega por tramos la diferencia absoluta entre confianza máxima media y frecuencia de aciertos. Estas cifras corresponden a los corpus y sus particiones. Los pesos se conservaron sin reentrenar. [Facial](fase9_facial.metricas.json), [vocal](fase9_audio.metricas.json), [CREMA-D](fase9_crema.metricas.json), [UCI](fase7_academico.metricas.json), [fusión](fase9_fusion.metricas.json)

CMU y UCI Student Performance se publican bajo CC BY 4.0. RAVDESS y su seguimiento facial se publican bajo CC BY-NC-SA 4.0. La foto pública de prueba proviene de NASA a través de scikit-image. CREMA-D usa ODbL para la base y DbCL para el contenido. [CMU](https://archive.ics.uci.edu/dataset/124/cmu+face+images), [UCI](https://archive.ics.uci.edu/dataset/320/student+performance), [RAVDESS](https://zenodo.org/records/1188976), [tracking](https://zenodo.org/records/3255102), [foto](https://scikit-image.org/docs/stable/api/skimage.data.html#skimage.data.astronaut), [CREMA-D](https://github.com/CheyneyComputerScience/CREMA-D)

## Fusión controlada

El bloque `fusion` informa `solicitada`, `disponible`, `compatible`, `ejecutada` y `motivo`. La disponibilidad inicial indica que el operador configuró un archivo de pesos presente. La compatibilidad se comprueba al solicitarla. Para entradas del orquestador, la fusión queda excluida por procedencia externa sin validar. El único caso habilitado es el endpoint de demostración y su pareja fija de corpus, con opt-in explícito. Un resultado fusionado se añade al bloque experimental y cada inferencia individual permanece disponible.

El servidor verifica ambos ZIP oficiales por MD5, selecciona el mismo ensayo `01-08-01-01-01-21` en audio y tracking, y verifica límites de tamaño, tiempos crecientes y frecuencia de tracking aproximada de 30 Hz. Reutiliza la preparación de Fase 9, con un máximo de 0.5 s de diferencia entre el fin del tracking y la duración del WAV. Usa 110 rasgos de audio y 51 resúmenes de 17 unidades de acción OpenFace. La ventana exige al menos 20 fotogramas y 70 % de confianza válida en el solapamiento, con confianza por fotograma ≥0.80. Se comprueban versión `fusion-fase9-1.0`, versión de scikit-learn, 161 rasgos y ocho etiquetas. La calibración corresponde a actores RAVDESS. Queda pendiente verificar si VIDEO puede proporcionar esas unidades, la alineación con AUDIO y la validez en la población objetivo.

## Demostración ejecutable

Abre **Demostración integral con cuatro estudiantes ficticios** en la interfaz local, o invoca `POST /api/prediccion/demostracion-integral`. El backend usa los siguientes casos reproducibles.

| Caso | Datos | Resultado esperado |
|---|---|---|
| A · `demo-02` | Cinco asistencias presentes, tres participaciones, G1=13 y G2=14 | Seguimiento por reglas y probabilidad del modelo UCI si están disponibles los pesos |
| B · `demo-01` | Dos ausencias entre cinco registros, cero participaciones, G1=8 y G2 ausente | Prioridad por inasistencias y campos de notas faltantes. El registro repetido se deduplica |
| C · `demo-03` | Fixtures de objetos IMAGEN y VIDEO con asociación sintética. Foto y WAV públicos independientes | Observaciones sintéticas atribuidas por referencia y resultados facial/vocal del corpus público sin atribución al estudiante. La copia de la foto comprueba la reutilización del fotograma |
| D · `demo-04` | Sin datos académicos suficientes. Audio declarado de otra sesión y un registro sin identidad en el lote | Exclusión de la fuente fuera de sesión y del registro sin identidad |

### Instalación local

Desde la raíz del repositorio en Windows con Python 3.11.15 y `uv`. La comprobación se realizó en CPU en un AMD Athlon 3000G con 5.93 GiB de RAM. Node es necesario para las pruebas del panel. El entorno base de ejecución no requiere PyTorch. Los ejemplos no contienen datos personales de estudiantes.

```powershell
uv venv --python 3.11.15 backend/.venv
uv pip install --python ./backend/.venv/Scripts/python.exe -r requirements.txt -r tests/requirements.txt
uv pip check --python ./backend/.venv/Scripts/python.exe
./backend/.venv/Scripts/python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8001
```

La demostración funciona con fixtures desde esa instalación. Para ejecutar los modelos, obtén los corpus de sus fuentes autorizadas y genera los pesos con los comandos de las Fases 7–9. La fotografía `astronaut.png` corresponde a scikit-image v0.25.2. Conserva los artefactos fuera de Git y configura estas rutas en la terminal que inicia Uvicorn. [Reproducción Fase 7](ENTRENAMIENTO_FASE7.md), [reproducción Fase 8](ENTRENAMIENTO_FASE8.md), [reproducción Fase 9](ENTRENAMIENTO_FASE9.md), [archivo de foto](https://raw.githubusercontent.com/scikit-image/scikit-image/v0.25.2/skimage/data/astronaut.png)

```powershell
New-Item -ItemType Directory -Force _archivo/fase7/datos | Out-Null
curl.exe -fL 'https://raw.githubusercontent.com/scikit-image/scikit-image/v0.25.2/skimage/data/astronaut.png' -o _archivo/fase7/datos/astronaut.png
$env:AULAPREDICT_MODELOS_FASE7 = (Resolve-Path _archivo/fase7/modelos).Path
$env:AULAPREDICT_MODELOS_FASE8 = (Resolve-Path _archivo/fase8/modelos).Path
$env:AULAPREDICT_DEMO_IMAGEN = (Resolve-Path _archivo/fase7/datos/astronaut.png).Path
$env:AULAPREDICT_DEMO_RAVDESS = (Resolve-Path _archivo/fase7/datos/ravdess-speech.zip).Path
$env:AULAPREDICT_DEMO_TRACKING = (Resolve-Path _archivo/fase9/ravdess-tracking.zip).Path
$env:AULAPREDICT_FUSION_FASE10 = (Resolve-Path _archivo/fase9/fusion.joblib).Path
./backend/.venv/Scripts/python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8001
```

Desde otra terminal local, la petición por defecto usa `{}`. Para probar la pareja de fusión, usa el siguiente comando.

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8001/api/prediccion/demostracion-integral' -Method Post -ContentType 'application/json' -Body '{"solicitar_fusion":true}'
```

## Seguridad, pruebas y despliegue

Las rutas nuevas son locales. Rechazan cliente remoto, cabeceras de reenvío, Host ajeno y Origin cruzado. Las respuestas usan `Cache-Control: no-store`. El cuerpo se limita a 2 MiB y los errores de validación omiten los valores del cuerpo. El cliente entrega base64, descriptores y referencias, y carece de campos para rutas o pesos. Los archivos de medios se leen desde rutas del operador verificadas por huella. Solo se deben configurar Joblib propios o de origen confiable, porque su formato puede ejecutar código al cargar. Las peticiones no escriben imágenes, WAV ni historiales en disco. Las rutas de los artefactos no forman parte de la respuesta.

El despliegue existente instala `requirements.txt` y ejecuta Uvicorn sobre `$PORT`. Se verificó ejecución HTTP local con esa aplicación. El acceso a demostración y seguimiento permanece local por diseño. No se realizó despliegue remoto ni se agregó infraestructura.

Se creó un entorno virtual nuevo con las dependencias base y de prueba. `uv pip check` confirmó que sus 33 paquetes eran compatibles. La prueba de inferencia con los pesos reales funcionó en ese entorno sin PyTorch. El entorno de trabajo anterior incluye una incompatibilidad preexistente entre `datasets` y `pyarrow`, paquetes ajenos al perfil base.

```powershell
./backend/.venv/Scripts/python.exe -B -m unittest discover -s tests
node --check frontend/app.js
node --test tests/test_frontend.cjs
```

Tras configurar los artefactos, fija `$env:AULAPREDICT_E2E_FASE10 = '1'` antes de ejecutar ambas baterías para incluir la prueba con modelos reales. La prueba Node acciona el controlador del panel contra Uvicorn local con un DOM mínimo. La verificación de rendimiento utiliza `psutil` en el entorno de medición.

En el entorno limpio, con los artefactos habilitados, pasaron 133 pruebas Python y 23 Node. Se aisló la prueba unitaria del respaldo facial de la configuración de pesos opcionales. La verificación de sintaxis de JavaScript también pasó.

### Rendimiento HTTP local

Se inició un proceso de Uvicorn por perfil, se verificó `/api/salud`, se consultó el inventario sin deserializar y se midió una ejecución en frío más 20 consecutivas. El RSS suma el proceso servidor y sus hijos. La carga previa del sistema fue 58.0 % con artefactos y 43.5 % sin ellos. Las cifras describen estas corridas y sus cargas de trabajo distintas.

| Perfil | Arranque | Inventario | Primera demo | p50 | p95 | RSS inicial / final |
|---|---:|---:|---:|---:|---:|---:|
| Con pesos, muestras públicas y fusión solicitada | 2 688.5 ms | 16.3 ms | 7 371.4 ms | 168.7 ms | 195.9 ms | 83.3 / 270.5 MiB |
| Sin pesos ni muestras opcionales | 2 100.4 ms | 7.0 ms | 10.5 ms | 6.2 ms | 32.8 ms | 82.7 / 84.8 MiB |

Los artefactos activos ocupan 392 636 bytes para facial, 11 097 para audio, 1 284 para UCI y 26 093 para fusión. La primera ejecución con fusión incluye lectura y verificación de los corpus. Las peticiones consecutivas reutilizan las muestras verificadas y los pesos cargados.

```powershell
./backend/.venv/Scripts/python.exe -B -m backend.entrenamiento_prediccion.medir_integracion_fase10 --fusion
./backend/.venv/Scripts/python.exe -B -m backend.entrenamiento_prediccion.medir_integracion_fase10 --sin-modelos
```

Los pendientes son las exportaciones autorizadas de los compañeros, la validación en población objetivo y los píxeles originales de FER2013. El flujo con fixtures permite comprobar contratos y comportamiento sin esas entradas.
