# AulaPredict · Fase 8 de Predicción

## Diagnóstico de partida

`main` en `98e3926`, 17 commits por delante de `origin/main`. Pasaron 115 pruebas Python y 21 Node. Windows, Python 3.11.15, AMD Athlon 3000G (2 núcleos y 4 hilos) y 5.93 GiB de RAM. Los experimentos se ejecutaron en CPU con scikit-learn 1.9.1, semilla 42 y PyTorch solo para evaluar la CNN. Se encontraron los dos artefactos históricos en Git, los dos modelos de investigación de Fase 7 en el almacenamiento local y las anotaciones FER+. Se conservaron las capturas existentes y el seguimiento académico por reglas.

Prioridades de la auditoría:

1. Faltaban píxeles faciales de entrenamiento real. El Random Forest histórico se ajustó sobre rasgos sintéticos y sus puntajes carecen de calibración sobre fotografías.
2. La prueba acústica publicada reservaba cuatro actores. El Random Forest confundía con frecuencia alegría y enojo con sorpresa, y tristeza con asco. Solo cubría 38 de 240 clips. Los rasgos Fase 7 usaban MFCC, primeras diferencias, RMS, centroide y actividad. Faltaba medir sensibilidad al actor y a los rasgos prosódicos y temporales.
3. La consulta del estado del panel deserializaba los modelos configurados, incluso si el usuario iba a usar una sola modalidad. El procesamiento WAV calculaba todo el vector aunque faltara el modelo.
4. UCI académico separaba entrenamiento, validación, calibración y prueba. G3 se usa exclusivamente como etiqueta y G1/G2 son las únicas variables, disponibles al corte posterior a G2. Las filas de matemáticas y portugués del repositorio de UCI pueden compartir estudiantes, por lo que se conserva solo matemáticas.

## Datos, acceso y licencias

- **CMU Face Images** (Tom Mitchell, DOI `10.24432/C5JC79`, CC BY 4.0). Descargado en esta fase desde UCI, SHA256 `01a8b6cc58ac2f825f72abd6cf2b393df067c6529d96f7a90b22dede71b142cc`. Son expresiones posadas y fotos controladas de 20 personas. Tiene cuatro clases compatibles con el contrato de Predicción. FER2013 tiene siete clases y el contexto de captura es diferente. [Ficha y licencia de UCI](https://archive.ics.uci.edu/dataset/124/cmu+face+images)
- **FER2013 y FER+.** La búsqueda en el proyecto y directorios configurados encontró `fer2013new.csv` con 35 887 anotaciones, sin el original `fer2013.csv`. No se encontraron credenciales Kaggle configuradas. El repositorio de Microsoft publica MIT. Las condiciones de los píxeles dependen de Kaggle y se deben revisar en el sitio de la competición. Los resultados faciales de esta fase son de CMU. [Kaggle](https://www.kaggle.com/competitions/challenges-in-representation-learning-facial-expression-recognition-challenge/data), [Microsoft FER+](https://github.com/microsoft/FERPlus)
- **RAVDESS** (Livingstone y Russo, DOI `10.5281/zenodo.1188976`, CC BY-NC-SA 4.0). Se reutilizó el ZIP de habla oficial de Fase 7, MD5 `bc696df654c87fed845eb13823edef8a`, verificado por el entrenador. Grabaciones actuadas en inglés norteamericano. [Ficha de Zenodo](https://zenodo.org/records/1188976)
- **UCI Student Performance** (Paulo Cortez, DOI `10.24432/C5TG7T`, CC BY 4.0). Se reutilizó el ZIP oficial con `student-mat.csv`. [Ficha y licencia de UCI](https://archive.ics.uci.edu/dataset/320/student+performance)
- **CREMA-D.** El productor publica ODbL para la base y DbCL para los contenidos. El repositorio solicita el registro del uso y los medios se distribuyen con Git LFS o el espejo indicado. Quedó pendiente la descarga y evaluación cruzada. Categorías compatibles `ANG/DIS/FEA/HAP/NEU/SAD`, sin equivalentes directos para calma y sorpresa de RAVDESS. [Repositorio y condiciones](https://github.com/CheyneyComputerScience/CREMA-D)

## Entrenamientos y resultados

### Facial con CMU

Se analizaron 320 imágenes de resolución original y ojos sin gafas oscuras. Se descartaron 7 PGM inválidos y 117 imágenes en las que Haar no localizó exactamente un rostro. Se validaron dimensiones de 128 × 120, se amplió la imagen para el detector y se normalizó el recorte gris a 48 × 48. Se comprobó la unicidad por SHA256 del recorte. Las 196 fotos útiles se dividieron en 92/32/34/38 imágenes de 10/3/3/4 personas disjuntas, para entrenamiento/validación/calibración/prueba. La prueba mide el clasificador cuando se logra el recorte. El descarte de imágenes, especialmente de perfil, limita la representatividad de la métrica.

Se compararon mayoría, HOG + regresión logística (`C=.2`), HOG + SVM RBF (`C=3`) y una CNN de dos capas de 16/32 canales con batch normalization, dropout 0.25, Adam, 18 épocas, lotes de 32 y volteo horizontal solo en entrenamiento. El presupuesto de épocas fue fijo. No se ajustaron hiperparámetros con la prueba. F1 macro en validación, 0.090 / 0.297 / 0.473 / 0.095, respectivamente. Se seleccionó HOG + SVM y se calibró con sigmoide en 34 imágenes de personas independientes.

Prueba calibrada (38 fotos, 4 personas): exactitud **36.8 %**, precisión macro 0.286, recall macro 0.347, F1 macro **0.308**, Brier multiclase 0.729 y ECE 0.022. El bootstrap exploratorio por persona arrojó IC 95 % de 32.1–41.2 % en exactitud y 0.236–0.331 en F1. Hay solo cuatro personas de prueba, por lo que los intervalos son exploratorios. Las clases se ordenan como alegría, enojo, neutral y tristeza. Matriz con filas reales y columnas predichas `[[5,1,3,2],[4,0,4,0],[1,0,6,3],[2,0,4,3]]`. El modelo falló en todos los casos de enojo. **Cobertura 0/38** a umbral 0.55 y margen 0.10. La API conserva las probabilidades y devuelve abstención. Los resultados de otros candidatos en prueba se registran para diagnóstico y la selección se conserva según validación. [Métricas faciales completas](fase8_facial.metricas.json)

### Acústico con RAVDESS

Se retuvieron 1 408 clips, descartando 31 por actividad insuficiente y uno por duplicado exacto. Duración p05/p50/p95 de 3.24/3.67/4.33 s. Al vector de 57 rasgos se añadieron 53 resúmenes de segundas diferencias MFCC, cruces por cero, rolloff espectral 85 %, F0 por autocorrelación, proporción de segmentos sonoros, cuantiles RMS y rasgos de tres tramos. La preparación y extracción se comparten con la API. Se mantuvo el remuestreo a 16 kHz.

Cuatro folds `GroupKFold` sobre los actores 1–16 (940 clips). Los actores 17–20 se reservaron para calibración sigmoide (228 clips). Los actores 21–24 son la referencia histórica de 240 clips ya vista en Fase 7 y quedaron fuera de selección, calibración y ajuste de abstención. Los modelos finalistas se entrenaron con exactamente los mismos actores de desarrollo. F1 macro medio de validación:

- RF de Fase 7 reentrenado, rasgos originales, 200 árboles, profundidad 14, hojas ≥3. **0.363**.
- Regresión logística escalada, `max_iter=500`, rasgos ampliados. **0.456**.
- RF optimizado, 250 árboles, hojas ≥2 y 50 % de rasgos. **0.397**.
- SVM RBF escalada, `C=5`, pesos balanceados. **0.455**.
- HistGradientBoosting, 65 iteraciones, máximo de 15 hojas. **0.416**.

Se eligió la logística por F1 de validación. En la referencia histórica obtuvo **42.5 %** de exactitud, F1 macro **0.404**, Brier 0.709 y ECE 0.058. Emitió 11 categorías de 240 (4.6 %) y acertó 9 de 11. La exactitud por actor fue de 23.3 % a 63.3 %, con sensibilidad 9.4 % para tristeza y 81.3 % para sorpresa. El RF reentrenado con los mismos grupos logró 43.3 % de exactitud, F1 0.407, Brier 0.674, ECE 0.096 y cobertura 11.3 %. El RF publicado en Fase 7, entrenado en actores 1–12, había logrado 37.9 %, F1 0.361 y cobertura 15.8 %. El nuevo modelo mejora validación y ECE, con menor cobertura y desempeño comparable o inferior al RF reentrenado en esta referencia. No se cambió el umbral tras ver estos resultados. [Métricas acústicas, matrices y resultados por actor](fase8_audio.metricas.json)

### Académico

Se reejecutó el entrenamiento de Fase 7 y el JSON de métricas reprodujo el SHA256 publicado `90bcb4b806ee4bdfdc663fceffb789d7d0239e8f0b0e8609b831ddad4d055ab1`. La regresión logística conserva 88.8 % de exactitud, F1 macro 0.873, ROC-AUC 0.971, ECE 0.045, Brier 0.142 y cobertura 92.5 %. ECE antes de calibrar 0.071. La matriz `[[49,5],[4,22]]` registra cuatro desaprobaciones clasificadas como aprobación antes de abstenerse. El desenlace es G3 < 10/20 después de G2. Si falta G1, G2, el corte o la escala, la API solicita los campos faltantes. Voz, asistencia y participación permanecen fuera del modelo supervisado. [Métricas académicas](fase7_academico.metricas.json)

## Reproducción local

Desde la raíz, con el entorno Python 3.11 de [Fase 7](ENTRENAMIENTO_FASE7.md). Para comparar la CNN, utilizar el perfil alternativo `backend/requirements-yolo.txt` en un entorno que ya cuente con PyTorch. Las rutas de pesos y datos locales quedan en `_archivo/`.

```powershell
New-Item -ItemType Directory -Force _archivo/fase8/datos | Out-Null
curl.exe -fL 'https://archive.ics.uci.edu/static/public/124/cmu%2Bface%2Bimages.zip' -o _archivo/fase8/datos/cmu-face-images.zip
./backend/.venv/Scripts/python.exe -B -m backend.entrenamiento_prediccion.entrenar_cmu_fase8 _archivo/fase8/datos/cmu-face-images.zip --salida _archivo/fase8/modelos
./backend/.venv/Scripts/python.exe -B -m backend.entrenamiento_prediccion.entrenar_audio_fase8 _archivo/fase7/datos/ravdess-speech.zip --salida _archivo/fase8/modelos
./backend/.venv/Scripts/python.exe -B -m backend.entrenamiento_prediccion.entrenar_fase7 academico _archivo/fase7/datos/uci-student.zip --salida _archivo/fase8/repeticion
```

Para FER2013, inicia sesión en la página de Kaggle, acepta las condiciones vigentes si se solicitan y descarga el archivo desde **Data**. Con el CLI oficial ya autenticado, el comando equivalente es `kaggle competitions download challenges-in-representation-learning-facial-expression-recognition-challenge -p _archivo/fase8/datos`. Extrae los archivos comprimidos y conserva el CSV original. La disponibilidad de esa competición histórica depende de Kaggle. El importador comprueba 28 709 / 3 589 / 3 589 filas por partición, etiquetas, tamaño y rango de píxeles. Para FER+ comprueba votos, cantidad y secuencia de particiones. Conserva el orden original dentro de cada partición porque ambos CSV carecen de una clave compartida que verifique el orden interno. [CLI oficial de Kaggle](https://github.com/Kaggle/kaggle-cli/blob/main/docs/competitions.md)

```powershell
./backend/.venv/Scripts/python.exe -B -m backend.entrenamiento_prediccion.entrenar_fase7 facial _archivo/fase8/datos/fer2013.csv --fer-plus _archivo/fase7/datos/fer2013new.csv --cnn --salida _archivo/fase7/modelos
```

## API, frontend y fuentes externas

```powershell
$env:AULAPREDICT_MODELOS_FASE7 = (Resolve-Path _archivo/fase7/modelos).Path
$env:AULAPREDICT_MODELOS_FASE8 = (Resolve-Path _archivo/fase8/modelos).Path
./backend/.venv/Scripts/python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8001
```

Abre el [panel local](http://localhost:8001) y expande **Análisis experimental facial, acústico y académico**. Consulta los modelos y elige **Automático**, **Real** o **Histórico**. En JSON el campo es `imagen.modelo_facial` o `video.modelo_facial`, con valores `automatico`, `real` o `historico`. `real` devuelve modelo ausente si no hay pesos reales compatibles. `historico` fuerza el Random Forest sintético. El perfil nuevo busca primero el modelo Fase 8 y recurre al de Fase 7 compatible si está configurado. Para probar FER en lugar de CMU, habilita solo `AULAPREDICT_MODELOS_FASE7` con el artefacto FER presente. Activa únicamente directorios de pesos Joblib generados localmente y de confianza.

`GET /api/prediccion/modelos-investigacion?cargar=false` inspecciona archivos y metadatos sin deserializar. Informa `archivo_presente`, cuya compatibilidad se confirma al inferir. La consulta anterior sin parámetro conserva su comportamiento. Para `POST /api/prediccion/analisis-experimental`, un envoltorio ilustrativo de productor para un fotograma usa:

```json
{
  "schema_version": 1,
  "video": {
    "imagen_b64": "<base64 del fotograma>",
    "modelo_facial": "real",
    "evento_id": "v42",
    "sesion_id": "sesion-01",
    "fecha_hora": "2026-11-09T10:00:00-05:00",
    "naturaleza": "real",
    "origen": "exportacion-video",
    "calidad": 0.8
  }
}
```

`imagen` acepta el mismo envoltorio para una imagen mejorada o un recorte que supere la validación facial. `audio` recibe `wav_b64` o los descriptores de [Fase 7](ENTRENAMIENTO_FASE7.md), con referencias opcionales equivalentes. El origen y la naturaleza son declaraciones del productor. El laboratorio informa conflictos de sesiones, tiempos o naturalezas aun cuando falle una modalidad. Reutiliza el cálculo de un evento visual idéntico cuando coinciden referencias, contenido y configuración. Cada salida visual o acústica permanece sin atribución de identidad. Los objetos, eventos, asociaciones verificadas, asistencia y participación mantienen sus [contratos existentes](CONTRATO_MODULOS.md) y el [seguimiento de demostración](SEGUIMIENTO_ESTUDIANTES.md). No se recibieron muestras de salida de productores para certificar interoperabilidad real.

## Fusión audiovisual

CREMA-D tiene grabaciones emparejadas, pero no se incorporaron medios. También se identificó [RAVDESS Facial Landmark Tracking](https://zenodo.org/records/3255102), cuyo ZIP de 417.2 MB contiene series de puntos y unidades de acción por ensayo. Los metadatos permiten emparejar las modalidades RAVDESS al quitar el prefijo de modalidad `01`/`03` y conservar los seis campos restantes. Se requiere verificar emparejamiento y alineación de tiempos con los archivos locales, reservar actores completos y comparar audiovisual contra sus dos ramas con la misma prueba, calibración separada y casos de modalidad ausente. La sincronización de la API permanece disponible y la respuesta mantiene `fusion_estadistica: pendiente`.

`sincronizacion.referencias_compatibles` informa `true` para metadatos completos compatibles, `false` cuando hay un conflicto declarado y `null` cuando faltan referencias. Este campo se calcula incluso si los modelos se abstienen.

## Latencia y memoria

Se midió el proceso de la API en Windows con `TestClient`, sin tráfico de red. Cada caso usó un proceso nuevo, una primera petición en frío y 30 peticiones adicionales. RSS es la memoria residente del proceso completo, medida después de la última petición. La comparación del audio usa el mismo WAV RAVDESS y la del estado compara la consulta que carga los modelos con la consulta de archivos del panel. Las cifras describen estas corridas. La carga del equipo no se aisló y los percentiles pueden variar. La fase nueva se habilita por configuración.

- **Consulta de estado.** La primera petición pasó de 3 769 ms a 12.7 ms y el RSS final de 195.2 a 68.2 MiB. La ruta del panel inspecciona metadatos y pospone la carga al primer uso.
- **Audio.** El p50 pasó de 44.0 a 39.5 ms, el p95 de 65.2 a 112.9 ms y el RSS final de 199.2 a 181.0 MiB. El artefacto pasó de 1 117 623 bytes a aproximadamente 11 KB. Los rasgos ampliados añaden trabajo y la medición no mostró una mejora del p95.
- **Facial.** Con la misma imagen de prueba, el p50 pasó de 127.7 a 118.8 ms, el p95 de 230.1 a 256.1 ms y el RSS final de 255.1 a 243.2 MiB. En frío, el modelo real tomó 6.16 s frente a 5.21 s del histórico. El artefacto CMU ocupa 392 636 bytes.
- **Académico.** Con el artefacto de Fase 7 se midieron p50 de 4.3 ms, p95 de 5.1 ms y RSS final de 173.9 MiB. La primera petición incluyó aproximadamente 3.3 s de inicialización.

El script de medición requiere `psutil` y las dependencias de prueba. Configura los directorios de pesos antes de medir. Ejecuta cada modalidad por separado y omite la variable `AULAPREDICT_MODELOS_FASE8` para obtener la referencia de Fase 7.

```powershell
$env:OPENBLAS_NUM_THREADS = '1'
$env:OMP_NUM_THREADS = '1'
$env:MKL_NUM_THREADS = '1'
./backend/.venv/Scripts/python.exe -B -m backend.entrenamiento_prediccion.medir_fase8 audio
./backend/.venv/Scripts/python.exe -B -m backend.entrenamiento_prediccion.medir_fase8 academico
./backend/.venv/Scripts/python.exe -B -m backend.entrenamiento_prediccion.medir_fase8 facial
./backend/.venv/Scripts/python.exe -B -m backend.entrenamiento_prediccion.medir_fase8 estado
./backend/.venv/Scripts/python.exe -B -m backend.entrenamiento_prediccion.medir_fase8 estado_archivos
```

## Pruebas

Pasaron 121 pruebas Python y 22 Node. La batería cubre selección facial explícita, ausencia de artefactos compatibles, correspondencia de particiones FER+, rasgos ampliados reproducibles, consulta sin deserializar, conflictos de sesión, referencias compatibles durante la abstención y reutilización de resultados visuales.

Se repitieron los entrenamientos acústico y facial con `--salida _archivo/fase8/repeticion` y se verificó con `Get-FileHash` que los informes JSON coincidieron byte por byte. El entrenamiento académico también reprodujo su informe publicado.

Una petición adicional con una foto CMU de prueba, un WAV RAVDESS del actor 21 y notas de ejemplo cargó los tres pesos locales. La foto produjo abstención con máximo 0.317, el WAV produjo abstención con máximo 0.384 y G1=7/G2=6 produjo 0.912 para `G3 < 10/20`. La API reutilizó el cálculo del fotograma repetido, conservó la identidad sin verificar y mantuvo pendiente la fusión. El proceso completó la petición sin importar PyTorch.

```powershell
./backend/.venv/Scripts/python.exe -B -m unittest discover -s tests
node --check frontend/app.js
node --test tests/test_frontend.cjs
```
