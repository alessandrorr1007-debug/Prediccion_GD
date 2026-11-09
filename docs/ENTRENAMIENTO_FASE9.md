# AulaPredict · Fase 9 de Predicción

## Estado inicial y objetivo

`main` en `15a3eb6`, 21 commits por delante de `origin/main`. Pasaron 121 pruebas Python y 22 Node. Windows, AMD Athlon 3000G de 2 núcleos y 4 hilos y 5.93 GiB de RAM. El entrenamiento y la inferencia se ejecutaron en CPU. Se encontraron los pesos de Fases 7 y 8 y sus datos en `_archivo/`. La Fase 8 reportaba 36.8 % de exactitud y 0/38 clasificaciones emitidas para CMU, 42.5 % y 11/240 para RAVDESS, y 88.8 % en UCI académico. Su consulta liviana de estado había medido 12.7 ms en frío y 68.2 MiB de RSS. [Guía y línea base de Fase 8](ENTRENAMIENTO_FASE8.md)

El objetivo fue aumentar la proporción de clasificaciones emitidas cuando el error selectivo, el soporte por grupo y el F1 macro sostuvieran el cambio. Se auditó la transferencia vocal fuera de RAVDESS y se comparó una fusión experimental con las dos ramas unimodales.

## Datos y licencias

- **CMU Face Images.** 196 fotos posadas utilizables de 20 personas, cuatro categorías. Las 38 fotos históricas son de cuatro personas. UCI publica CC BY 4.0. La selección previa por Haar descarta 117 de 320 imágenes analizadas, lo que limita el alcance a recortes compatibles. [UCI CMU](https://archive.ics.uci.edu/dataset/124/cmu+face+images)
- **FER2013 y FER+.** En el proyecto se encontraron 35 887 anotaciones FER+. Falta `fer2013.csv` y no aparecieron credenciales Kaggle configuradas. Microsoft documenta la correspondencia por orden y publica su repositorio bajo MIT. Los píxeles se obtienen desde Kaggle bajo sus condiciones. El CSV descomprimido requiere aproximadamente 300 MB y el flujo HOG funciona en CPU. La CNN agrega tiempo de entrenamiento y requiere el perfil con PyTorch. KDEF cubre más expresiones con captura controlada y ofrece acceso mediante registro para investigación no comercial. Quedó sin descargar. [Kaggle](https://www.kaggle.com/competitions/challenges-in-representation-learning-facial-expression-recognition-challenge/data), [FER+](https://github.com/microsoft/FERPlus), [KDEF](https://kdef.se/)
- **RAVDESS.** 1 408 clips utilizables de 24 actores, voz actuada en inglés norteamericano. Se reutilizó el ZIP de habla oficial y se descargó el ZIP de tracking publicado por Swanson, Livingstone y Russo, de 417 163 019 bytes. Ambos MD5 se verificaron. Las grabaciones y el tracking se publican para uso bajo CC BY-NC-SA 4.0. [Audio](https://zenodo.org/records/1188976), [Tracking](https://zenodo.org/records/3255102)
- **CREMA-D.** Se descargaron seis shards de prueba del reempaquetado público en Zenodo, 28.9 MB en total, y se verificaron sus MD5 publicados. Se conservaron las condiciones originales ODbL para la base y DbCL para contenidos. Los archivos se usaron localmente para evaluación externa. [Cao et al. y licencia original](https://github.com/CheyneyComputerScience/CREMA-D), [reempaquetado](https://zenodo.org/records/14646870)
- **UCI Student Performance.** Matemáticas en secundaria portuguesa, CC BY 4.0. G3 aporta la etiqueta y G1/G2 las variables conocidas al corte. [UCI](https://archive.ics.uci.edu/dataset/320/student+performance)

## Selección y curvas de riesgo-cobertura

Se congeló el criterio antes de ejecutar los candidatos. `GroupKFold` separó cuatro folds de desarrollo. En cada iteración, dos folds ajustaron el estimador, uno calibró con sigmoide y el otro generó probabilidades fuera de muestra. Cada persona o actor apareció en un solo fold y cada fila recibió una predicción externa a su ajuste y calibración. Se excluyeron los cuatro sujetos históricos de CMU y los actores RAVDESS 21–24. La selección solo recibe métricas de desarrollo. Las referencias históricas ya eran conocidas desde Fase 8 y se consultaron después de decidir.

Se evaluaron umbrales de 0.25 a 0.90 en pasos de 0.05 y márgenes de 0.05, 0.10, 0.15, 0.20 y 0.25. Para promover se exigieron al menos 15 casos faciales o 30 vocales, cuatro grupos cubiertos, cobertura ≥10 % y superior a la política vigente, precisión selectiva ≥80 %, límite inferior de Wilson ≥0.65 y precisión ≥72 % al omitir cualquiera de los grupos cubiertos. Si la referencia tenía soporte suficiente, se admitía una caída máxima de tres puntos de precisión respecto a ella. El F1 macro debía quedar a no más de 0.02 de la referencia. El límite de Wilson sirve como filtro descriptivo. Los clips de un actor están correlacionados y el análisis de omisión por grupo añade una comprobación de estabilidad.

El riesgo es la proporción de errores entre las categorías emitidas. Cuando la cobertura es cero, el riesgo y la precisión selectiva quedan indefinidos. La figura muestra el corte con margen 0.10. Los JSON contienen todos los puntos y matrices de confusión. [Curvas de riesgo-cobertura](fase9_riesgo_cobertura.svg)

Se repitieron los dos experimentos con `--salida _archivo/fase9/repeticion`. Los JSON facial y vocal coincidieron byte por byte con la primera ejecución. Esta comprobación mide reproducibilidad local del procedimiento. Los resultados de desarrollo usados para elegir la política siguen requiriendo validación en sujetos nuevos.

### Facial

Desarrollo de 158 fotos. F1 macro fuera de muestra de 0.189 para mayoría, 0.378 para HOG con logística, 0.347 para HOG con SVM, 0.224 para CNN y 0.335 para HOG más LBP con logística. HOG con logística obtuvo 40.5 % de exactitud y ECE 0.058 en desarrollo. Su punto de mayor precisión entre los que emitían al menos 15 casos y cubrían 10 % acertó 24 de 45, con 28.5 % de cobertura y 53.3 % de precisión. No alcanzó el criterio de promoción.

En la referencia histórica, la probabilidad máxima del SVM publicado tuvo mediana 0.333 y máximo 0.474. El margen mediano fue 0.059. El máximo quedó por debajo del umbral 0.55 incluso en los casos con margen amplio. El modelo activo sigue siendo HOG con SVM, con 36.8 % de exactitud, F1 macro 0.308, ECE 0.022 y abstención en 38/38. La calibración aparente no compensa la falta de discriminación en esta muestra pequeña. [Informe facial estructurado](fase9_facial.metricas.json)

### Acústico

Desarrollo de 1 168 clips. Se compararon RF con rasgos originales, logística ampliada, RF optimizado, SVM RBF, HistGradientBoosting y Extra Trees. F1 macro fuera de muestra de 0.355, 0.438, 0.393, 0.438, 0.423 y 0.393, respectivamente. La logística con la política vigente emitió 66 casos y acertó 58, con 5.7 % de cobertura y 87.9 % de precisión. Su mejor punto con cobertura ≥10 % y soporte suficiente acertó 97 de 123, con 10.5 % de cobertura y 78.9 % de precisión. No se promovieron cambios. En la referencia histórica la mediana de probabilidad máxima fue 0.368 y el percentil 90 fue 0.498. Se conservó el modelo de Fase 8, con 42.5 % de exactitud, F1 macro 0.404, ECE 0.058 y 9 aciertos de 11 emitidos. [Informe acústico estructurado](fase9_audio.metricas.json)

### Generalización externa

Se evaluó la logística RAVDESS congelada en 336 clips CREMA-D de 87 actores, sin ajustar sobre ellos. La referencia RAVDESS se restringió a las seis etiquetas verdaderas comunes y se mantuvo la salida de ocho clases. Las predicciones de calma y sorpresa cuentan como errores cuando la etiqueta pertenece a las seis compatibles. RAVDESS histórico común obtuvo 36.9 % de exactitud, F1 macro de seis clases 0.357 y ECE 0.031. CREMA-D obtuvo 16.7 %, F1 0.179 y ECE 0.307. Emitió 66 casos y acertó 15, con precisión selectiva 22.7 %. Hubo 208 predicciones top-1 fuera de las seis clases compatibles. La cobertura externa de 19.6 % vino acompañada de más errores. Ambos corpus contienen voz actuada en inglés. Los resultados no validan transferencia a conversaciones naturales en español. [Matrices y métricas por actor](fase9_crema.metricas.json)

### Fusión experimental RAVDESS

Se emparejó el ID del WAV con el de tracking tras retirar el prefijo de modalidad. Se exigió marca temporal monótona, diferencia máxima de 0.5 s entre duración WAV y fin de tracking y solapamiento temporal. El archivo publica `confidence` y carece de columna `success`. Se exigieron 20 fotogramas como mínimo y confianza de tracking ≥0.80 en al menos 70 % de los fotogramas solapados. Se calcularon media, desviación y percentil 90 de 17 unidades de acción. El ajuste usó 940 pares de actores 1–16, la calibración 228 pares de actores 17–20 y la referencia 240 pares de actores 21–24. Se descartaron 31 WAV con señal insuficiente y un duplicado exacto.

Con regresión logística escalada y calibración sigmoide, audio obtuvo **42.5 % de exactitud, F1 0.404, ECE 0.058 y cobertura 4.6 %**. Tracking visual obtuvo **52.9 %, F1 0.499, ECE 0.093 y cobertura 22.9 %**. La fusión de rasgos obtuvo **67.5 %, F1 0.659, ECE 0.150 y cobertura 40.0 %**. Acertó 79 de las 96 clasificaciones emitidas. Las ramas unimodales se probaron en los mismos casos como simulación de modalidad ausente. El código experimental selecciona una rama si falta la otra y se abstiene si faltan ambas. El artefacto local requiere rasgos de tracking compatibles. El endpoint público del proyecto conserva la sincronización y las inferencias independientes hasta contar con un contrato de datos adecuado. [Matrices, calibración y resultados por actor](fase9_fusion.metricas.json)

### Académico

El artefacto vigente conserva **88.8 % de exactitud, F1 macro 0.873, ROC-AUC 0.971, ECE 0.045 y cobertura 92.5 %**. La matriz publicada es `[[49,5],[4,22]]`. El entrenamiento anterior reprodujo su informe byte por byte. El Joblib vigente coincide con su repetición, con SHA256 `01ee2da2f81ab4222b174f86ed5c2475a18d9439adafc0b89dfeaf8a84a9a5dc`. La API devuelve campos faltantes si faltan G1, G2, escala o corte. Con las notas de ejemplo G1=7 y G2=6 devolvió 0.912 para `G3 < 10/20`. Asistencia y participación se procesan en el seguimiento por reglas. [Informe UCI](fase7_academico.metricas.json)

## API, frontend y pruebas

`POST /api/prediccion/analisis-experimental` incluye `criterio_abstencion` con umbral, margen mínimo, puntaje máximo, margen observado y motivos. El panel muestra la causa junto al modelo, versión, dataset y calidad. Las rutas y la carga bajo demanda de Fase 8 siguen disponibles. El seguimiento probó un fixture sintético de IMAGEN y VIDEO con asociación verificada y registros normalizados de asistencia y participación. Se verificaron la deduplicación y la exclusión de registros sin identidad. La interoperabilidad con productores reales sigue pendiente de exportaciones autorizadas.

La prueba manual con pesos locales verificó una abstención facial por probabilidad y margen insuficientes y una abstención vocal por probabilidad insuficiente. Al quitar la configuración de pesos, la API devolvió `modelo_no_disponible` para la selección facial real, audio y académico, y mantuvo la respuesta de sincronización.

Pasaron 127 pruebas Python y 22 Node. También se verificó la sintaxis de `frontend/app.js`.

## Rendimiento en CPU

Se ejecutó una petición en frío y 30 consecutivas por modalidad con `TestClient`, en procesos separados y con `OPENBLAS_NUM_THREADS`, `OMP_NUM_THREADS` y `MKL_NUM_THREADS` en 1. El tiempo en frío incluye inicialización de bibliotecas, carga diferida y respuesta. RSS es la memoria residente final del proceso. La carga total del sistema se registró antes y durante cada corrida. No se atribuyen las diferencias respecto a Fase 8 a cambios de rendimiento porque las condiciones del equipo variaron.

| Caso | Fría | p50 | p95 | RSS final | CPU del sistema antes / durante |
|---|---:|---:|---:|---:|---:|
| Facial CMU | 3 847.4 ms | 81.7 ms | 90.9 ms | 242.9 MiB | 25.6 % / 55.4 % |
| Audio RAVDESS | 3 336.2 ms | 30.2 ms | 37.6 ms | 181.2 MiB | 27.3 % / 55.4 % |
| Académico UCI | 5 276.5 ms | 6.4 ms | 12.4 ms | 174.0 MiB | 91.1 % / 87.9 % |
| Consulta de archivos | 46.2 ms | 4.2 ms | 6.4 ms | 68.0 MiB | 58.0 % / 80.4 % |
| WAV sin pesos opcionales | 2 753.8 ms | 14.7 ms | 45.4 ms | 123.2 MiB | 71.1 % / 86.6 % |

Otra corrida académica registró 27.3 s en frío y p50 de 6.3 ms. La corrida facial emitió sus mediciones tras completar las peticiones y el proceso de prueba excedió el tiempo límite durante el cierre. El resultado facial describe las peticiones completadas.

Los pesos activos ocupan 392 636 bytes para facial, 11 097 bytes para audio y 1 284 bytes para académico. El paquete de fusión experimental ocupa 26 093 bytes. Para repetir una medición, configura los directorios de pesos como en Fase 8 y ejecuta `./backend/.venv/Scripts/python.exe -u -B -m backend.entrenamiento_prediccion.medir_fase8 audio`. Sustituye `audio` por `facial`, `academico` o `estado_archivos` según el caso. [Configuración del entorno](ENTRENAMIENTO_FASE8.md#api-frontend-y-fuentes-externas)

## Reproducción en PowerShell

Usar Python 3.11, las dependencias del proyecto y el perfil con PyTorch para el candidato CNN. Los CSV, WAV, pesos y ZIP quedan en `_archivo/`. Los comandos se ejecutan desde la raíz. [Instalación y configuración de artefactos](ENTRENAMIENTO_FASE8.md)

```powershell
$py = './backend/.venv/Scripts/python.exe'
& $py -B -m backend.entrenamiento_prediccion.entrenar_fase9 facial _archivo/fase8/datos/cmu-face-images.zip --referencia _archivo/fase8/modelos/facial.joblib --salida _archivo/fase9/modelos
& $py -B -m backend.entrenamiento_prediccion.entrenar_fase9 audio _archivo/fase7/datos/ravdess-speech.zip --referencia _archivo/fase8/modelos/audio.joblib --salida _archivo/fase9/modelos
& $py -B -m backend.entrenamiento_prediccion.graficar_fase9 _archivo/fase9/modelos docs/fase9_riesgo_cobertura.svg
New-Item -ItemType Directory -Force _archivo/fase9/crema | Out-Null
foreach ($i in 0..5) {
    $nombre = 'wds-audio-test-{0:D6}.tar' -f $i
    curl.exe -fL "https://zenodo.org/api/records/14646870/files/$nombre/content" -o "_archivo/fase9/crema/$nombre"
}
& $py -B -m backend.entrenamiento_prediccion.evaluar_crema_fase9 _archivo/fase9/crema _archivo/fase7/datos/ravdess-speech.zip _archivo/fase8/modelos/audio.joblib --salida _archivo/fase9/crema.metricas.json
curl.exe -fL 'https://zenodo.org/api/records/3255102/files/FacialTracking_Actors_01-24.zip/content' -o _archivo/fase9/ravdess-tracking.zip
& $py -B -m backend.entrenamiento_prediccion.evaluar_fusion_fase9 _archivo/fase7/datos/ravdess-speech.zip _archivo/fase9/ravdess-tracking.zip --salida _archivo/fase9/fusion.metricas.json --artefacto _archivo/fase9/fusion.joblib
& $py -B -m unittest discover -s tests
node --check frontend/app.js
node --test tests/test_frontend.cjs
```

Para FER2013, inicia sesión en Kaggle, abre **Data**, acepta las condiciones si el sitio lo solicita y descarga el CSV original. Con el CLI oficial autenticado, utiliza `kaggle competitions download challenges-in-representation-learning-facial-expression-recognition-challenge -p _archivo/fase9/datos`. Extrae el archivo manteniendo el orden de filas y ejecuta el importador con `--fer-plus` como indica la guía. [Página de Kaggle](https://www.kaggle.com/competitions/challenges-in-representation-learning-facial-expression-recognition-challenge/data), [comando facial](ENTRENAMIENTO_FASE8.md#reproducción-local)

## Próximos pasos

Obtener FER2013 con acceso autorizado y reservar una prueba facial independiente. Para la voz, validar con audio objetivo y reservar actores para calibración y prueba. Para usar la fusión, confirmar si VIDEO entrega series de unidades de acción compatibles y validar el emparejamiento con los WAV del productor. Las alertas académicas requieren evidencia educativa y un desenlace definido.
