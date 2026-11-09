# AulaPredict · Fase 7 de Predicción

## Auditoría y recursos

Punto de partida `60f26fa` en `main`, 14 commits por delante de la referencia local `origin/main`. La batería inicial pasó 110 pruebas Python y 19 Node. Se conservan los dos Random Forest históricos de `backend/entrenamiento_prediccion/` (`modelo_emociones_facial.pkl` y `modelo_sucesos_academicos.pkl`), entrenados con variables sintéticas. `backend/modulos/prediccion/seguimiento.py` conserva el índice de reglas, la asistencia y la participación. `analisis_experimental.py` mantiene separados los resultados por fuente. Los [contratos de productores](CONTRATO_MODULOS.md) siguen vigentes.

Equipo de ejecución Windows, Python 3.11.15, Node 24.14.1, AMD Athlon 3000G (2 núcleos, 4 hilos), aproximadamente 5.93 GiB de RAM y 621 GiB libres en `D:`. GPU integrada Radeon Vega 3. Los entrenamientos usan CPU. El perfil base ya incluye NumPy, pandas, SciPy, OpenCV y scikit-learn 1.9.1. El entorno verificado resolvió Joblib 1.6.0 y threadpoolctl 3.7.0 como dependencias transitivas. La CNN opcional usa PyTorch del perfil `backend/requirements-yolo.txt`. El resto funciona con `requirements.txt`. El plan prioriza el ZIP académico (40 KB) y el ZIP de voz (208 MB). El CSV de FER2013 descomprimido requiere del orden de 300 MB. CREMA-D completo es del orden de 7.5 GB.

## Fuentes y condiciones

- **UCI Student Performance.** Paulo Cortez (2008), DOI `10.24432/C5TG7T`. CC BY 4.0. Se usa únicamente `student-mat.csv`, del ZIP oficial. [Ficha, atribución y licencia](https://archive.ics.uci.edu/dataset/320/student+performance).
- **RAVDESS.** Steven R. Livingstone y Frank A. Russo (2018), versión 1.0.0, DOI `10.5281/zenodo.1188976`. CC BY-NC-SA 4.0. Se usa el archivo oficial de habla con 24 actores. Mantener atribución y revisar las condiciones no comerciales y de compartir igual al redistribuir material cubierto. [Archivo y licencia en Zenodo](https://zenodo.org/records/1188976).
- **FER2013 y FER+.** El CSV original de Kaggle no se obtuvo mediante la consulta realizada y el entorno carecía de credenciales configuradas. Obtenerlo mediante la cuenta del titular, revisar y aceptar las condiciones vigentes si se solicitan y colocar el CSV original en `_archivo/fase7/datos/`. Se descargaron las 35 887 filas de anotaciones FER+, sin píxeles, con SHA256 `9206e20d62f56475939f516847d61753e4860caeac9718b560129541b776fc2c`. Las anotaciones corresponden a las imágenes originales por orden y partición. El repositorio de Microsoft publica su licencia MIT. Los píxeles tienen sus propias condiciones. [FER2013 en Kaggle](https://www.kaggle.com/c/challenges-in-representation-learning-facial-expression-recognition-challenge/data), [FER+ y licencia](https://github.com/microsoft/FERPlus).
- **CREMA-D.** El productor indica ODbL para la base y DbCL para los contenidos. La distribución usa Git LFS y el repositorio solicita registrar el uso mediante un formulario. No se descargó y no se entrenó ni evaluó fusión. [Repositorio y condiciones de CREMA-D](https://github.com/CheyneyComputerScience/CREMA-D).

## Reproducción en Windows

Desde la raíz y con Python 3.11 instalado:

```powershell
py -3.11 -m venv backend/.venv
./backend/.venv/Scripts/python.exe -m pip install -r requirements.txt
New-Item -ItemType Directory -Force _archivo/fase7/datos | Out-Null
curl.exe -fL 'https://archive.ics.uci.edu/static/public/320/student+performance.zip' -o _archivo/fase7/datos/uci-student.zip
curl.exe -fL 'https://zenodo.org/api/records/1188976/files/Audio_Speech_Actors_01-24.zip/content' -o _archivo/fase7/datos/ravdess-speech.zip
Get-FileHash _archivo/fase7/datos/ravdess-speech.zip -Algorithm MD5
./backend/.venv/Scripts/python.exe -B -m backend.entrenamiento_prediccion.entrenar_fase7 academico _archivo/fase7/datos/uci-student.zip --salida _archivo/fase7/modelos
./backend/.venv/Scripts/python.exe -B -m backend.entrenamiento_prediccion.entrenar_fase7 audio _archivo/fase7/datos/ravdess-speech.zip --salida _archivo/fase7/modelos
```

MD5 RAVDESS esperado `bc696df654c87fed845eb13823edef8a`. El entrenador rechaza archivos diferentes. Los datasets, pesos y métricas generadas localmente quedan en `_archivo/`, fuera de Git. Solo se versionan métricas agregadas de los experimentos ejecutados. Joblib puede ejecutar código al deserializar. Configura un directorio local de confianza que contenga únicamente artefactos propios.

Para el facial, si ya tienes el CSV autorizado:

```powershell
./backend/.venv/Scripts/python.exe -B -m backend.entrenamiento_prediccion.entrenar_fase7 facial _archivo/fase7/datos/fer2013.csv --salida _archivo/fase7/modelos
```

Descarga opcional de anotaciones `curl.exe -fL 'https://raw.githubusercontent.com/microsoft/FERPlus/master/fer2013new.csv' -o _archivo/fase7/datos/fer2013new.csv`. Agrega `--fer-plus _archivo/fase7/datos/fer2013new.csv` y, para comparar con aprendizaje profundo, `--cnn`. Instala el perfil PyTorch opcional en un entorno separado para `--cnn`. El importador valida número y orden de particiones y estructura de votos. Conserva el orden original de las filas dentro de cada partición, ya que FER2013 no da un ID compartido para verificar reordenamientos internos. FER+ retiene solo etiquetas con mayoría estricta en las siete categorías del contrato. Se valida el rango de los píxeles, se eliminan duplicados exactos entre particiones y se descartan conflictos de etiqueta. PublicTest se usa para seleccionar y PrivateTest para evaluar. La calibración toma una reserva estratificada del 15 % de Training. El CSV carece de IDs de sujeto. Candidatos mayoría, HOG con regresión logística y CNN opcional de dos capas convolucionales (16 y 32 canales, Adam, 8 épocas, volteo horizontal solo durante entrenamiento). Se publica el artefacto después de completar evaluación y calibración.

## Evaluación y límites

Semilla 42. Se ajustan candidatos en entrenamiento y se elige por F1 macro de validación. Se calibra con sigmoide en una partición independiente. Las matrices de confusión se reportan con filas reales y columnas predichas. El JSON separa las métricas de prueba de los candidatos sin calibración y las del modelo calibrado. Registra precisión, recall y F1 por clase, exactitud, Brier multiclase (suma por clase), log loss, ECE de 10 tramos, ROC-AUC binaria y abstención. La decisión exige probabilidad ≥ 0.55 y margen ≥ 0.10 frente a la segunda clase. Los umbrales se fijaron previamente. Los conjuntos de prueba son internos a cada dataset. Los dos entrenamientos se ejecutaron dos veces con Random Forest en un hilo y se verificó que el JSON de cada experimento coincidía byte por byte entre ejecuciones.

**Académico.** Solo `G1` y `G2` (0–20), con corte después de G2. La etiqueta es `G3 < 10/20`. Se excluyen notas inválidas o faltantes y filas completas duplicadas. Resultado 395 filas, 197/59/59/80. Se compararon mayoría, regresión logística con escalado y Random Forest (200 árboles). Ganó regresión logística por F1 macro de validación (0.924). En prueba calibrada obtuvo exactitud 0.888, F1 macro 0.873, ROC-AUC 0.971, Brier 0.142 y ECE 0.045. Cobertura 92.5 % y exactitud selectiva 93.2 %. En el orden `aprueba`, `no_aprueba`, la matriz fue `[[49,5],[4,22]]`. Hubo cuatro desaprobaciones clasificadas como aprobación antes de aplicar abstención. La calibración bajó ECE de 0.071 a 0.045 con exactitud de 0.888 en ambos casos. El dominio es matemáticas en secundaria portuguesa, sin validación en UPAO ni con datos de asistencia o voz. [Métricas académicas completas](fase7_academico.metricas.json).

**Acústico.** Remuestreo a 16 kHz, MFCC y deltas, RMS, centroide espectral y fracción de ventanas activas. Separación por actor 1–12 / 13–16 / 17–20 / 21–24 en entrenamiento, validación, calibración y prueba. Se usaron 1 408 clips (701/239/228/240), tras descartar 31 por actividad insuficiente y un duplicado exacto. Se compararon mayoría, regresión logística y Random Forest (200 árboles), que ganó por F1 macro de validación de 0.359. En prueba calibrada obtuvo exactitud 0.379, F1 macro 0.361, Brier 0.705 y ECE 0.105. Cobertura 15.8 % (38 de 240) y exactitud selectiva 81.6 % (31 de 38). La sensibilidad fue 12.5 % para tristeza y 18.8 % para miedo, frente a 75 % para sorpresa. Se leen WAV PCM16 mono o estéreo entre 8 y 48 kHz, de 0.5 a 8 s. RAVDESS mide expresiones actuadas en inglés norteamericano, sin validación de transferencia a conversaciones de estudiantes hispanohablantes. [Métricas acústicas completas y matriz de confusión](fase7_audio.metricas.json).

**Facial.** No se obtuvieron resultados de prueba reales de FER2013/FER+. Sin artefacto FER, se conserva el baseline sintético histórico con sus puntajes sin calibración en rostros. Se requiere un solo rostro frontal que el detector Haar pueda localizar. El resultado representa una categoría de expresión observable.

## Inferencia y productores

```powershell
$env:AULAPREDICT_MODELOS_FASE7 = (Resolve-Path _archivo/fase7/modelos).Path
./backend/.venv/Scripts/python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8001
```

`GET /api/prediccion/modelos-investigacion` publica disponibilidad, versión, algoritmo y procedencia. `POST /api/prediccion/analisis-experimental` conserva JSON v1 de hasta 8 MiB. Ejemplo con descriptores externos y notas experimentales:

```json
{
  "schema_version": 1,
  "audio": {"evento_id": "a17", "sesion_id": "s1", "fecha_hora": "2026-11-09T10:00:00-05:00", "naturaleza": "sintetica", "duracion_segundos": 3, "rms_normalizado": 0.1},
  "academico": {"G1": 8, "G2": 9, "escala": "0-20", "corte": "despues_g2"}
}
```

Para evaluar un fragmento procesado, reemplaza los descriptores por `audio.wav_b64` con el WAV en base64. El clasificador acústico requiere la señal y deja intacta la ruta de descriptores. `imagen.imagen_b64` y `video.imagen_b64` reciben una imagen mejorada y un fotograma exportado, respectivamente. Agrega `evento_id`, `sesion_id`, `fecha_hora` y `naturaleza` según el productor. El laboratorio verifica compatibilidad declarada de referencias (sesión, tiempo, naturaleza), deduplica un evento visual compartido en la sincronización y mantiene `identidad_verificada: false`. Las asociaciones verificadas, los eventos visuales estructurados y los registros de asistencia y participación siguen en el [contrato de seguimiento](SEGUIMIENTO_ESTUDIANTES.md). No se crean probabilidades fusionadas, alertas de deserción ni asociaciones de identidad a partir de un WAV o una foto.

Ejemplo abreviado de respuesta con notas incompletas:

```json
{
  "schema_version": 1,
  "fuentes": {"imagen": {"estado": "sin_entrada"}, "video": {"estado": "sin_entrada"}, "audio": {"estado": "sin_entrada"}},
  "academico": {"estado": "evidencia_insuficiente", "campos_faltantes": ["G2", "corte", "escala"]},
  "sincronizacion": {"estado": "fuentes_insuficientes", "fuentes_elegibles": [], "evento_visual_compartido": false, "fusion_estadistica": "pendiente"}
}
```

Abre [el panel local](http://localhost:8001), expande **Análisis experimental facial, acústico y académico**, consulta los modelos y adjunta el WAV o la imagen en su campo. La vista presenta las fuentes y notas por separado, con calidad, probabilidades, procedencia, versión y abstención. El visor automático, la captura manual y la carga histórica permanecen en sus controles originales.

### Comprobaciones de inferencia

- **Facial histórico.** La API recibió una fotografía pública de prueba de NASA y su recorte. Detectó un rostro en ambos casos y devolvió `abstencion`, con máximo sin calibrar de 0.483. La verificación ejercita el flujo histórico, sin evaluar exactitud facial. [Procedencia de la fotografía de prueba](https://scikit-image.org/docs/stable/api/skimage.data.html#skimage.data.astronaut).
- **Acústico.** En `03-01-08-01-01-01-21.wav` del actor reservado 21, la etiqueta de referencia es sorpresa y la API predijo alegría con 0.579. En `03-01-01-01-01-01-21.wav`, neutral, se abstuvo (máximo 0.276). Los ejemplos prueban la integración y exponen un error fuera de la muestra de entrenamiento.
- **Académico.** Con notas de ejemplo G1=8 y G2=9, devolvió `probabilidad_no_aprueba: 0.514` y `abstencion`. Con G2, corte y escala ausentes, devolvió `evidencia_insuficiente` y enumeró los tres campos.

### Pruebas automatizadas

```powershell
./backend/.venv/Scripts/python.exe -B -m unittest discover -s tests
node --check frontend/app.js
node --test tests/test_frontend.cjs
```

Resultado de la fase, 115 pruebas Python y 21 Node. Las pruebas automatizadas usan fixtures para las entradas nuevas y conservan las pruebas de atribución de identidad, asistencia, participación y compatibilidad de captura de las fases previas. Una prueba técnica adicional ejecutó una época de la CNN, la calibración y la recarga Joblib sobre un fixture generado. No produce métricas faciales reales.
