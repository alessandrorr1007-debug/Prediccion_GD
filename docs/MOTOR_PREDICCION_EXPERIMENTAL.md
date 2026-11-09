# AulaPredict · Motor experimental y seguimiento académico

La [Fase 7](ENTRENAMIENTO_FASE7.md) amplía este contrato con modelos opcionales de investigación, fragmentos WAV y calificaciones parciales. El flujo histórico descrito aquí se conserva.

## Auditoría de partida

La captura visual existente ejecuta Haar y, si están instalados, YOLO Pose y YOLO de objetos. Usa dos Random Forest entrenados en vectores sintéticos. El clasificador estima expresiones a partir de nueve rasgos y el regresor de la captura histórica estima objetivos simulados. La proyección de `/api/vision/analizar` y los dos índices de revisión anteriores son heurísticas. Los adaptadores de imagen y video consumen JSON de objetos y eventos. La ruta de captura acepta una imagen en base64 simple o data URL mediante OpenCV. No existía un contrato de productor ni un formato de audio binario aceptado. El visor, la subida de foto y los flujos JSON se mantienen.

## Entrada experimental

`POST /api/prediccion/analisis-experimental` recibe un JSON v1 de hasta 8 MiB. Cada clave `imagen`, `video` o `audio` es opcional. `imagen` y `video` aceptan `imagen_b64` con una imagen mejorada, un rostro recortado o un fotograma ya obtenido. Este endpoint no abre archivos de video, URLs ni streams. Para objetos y detecciones temporales usa `/api/prediccion/integrar` o `/api/prediccion/estudiantes` con los [adaptadores existentes](CONTRATO_MODULOS.md). En observaciones normalizadas de seguimiento se puede adjuntar `duracion_segundos` si el productor la declara. Las reglas temporales existentes conservan su significado.

Cada fuente experimental admite `evento_id`, `sesion_id`, `fecha_hora` con zona horaria, `naturaleza` y `calidad` opcionales. Las referencias se conservan sin atribuir identidad. El análisis no almacena archivos ni recibe un identificador de estudiante. Usa entradas sintéticas o autorizadas.

Ejemplo local de **descriptores sintéticos**, independiente de un productor de audio:

```json
{
  "schema_version": 1,
  "audio": {
    "naturaleza": "sintetica",
    "evento_id": "descriptor-demo-1",
    "sesion_id": "clase-demo",
    "fecha_hora": "2026-11-09T10:00:20-05:00",
    "duracion_segundos": 4,
    "rms_normalizado": 0.18,
    "f0_hz": 155,
    "variabilidad_f0_hz": 12,
    "pausas_segundos": 0.7,
    "ritmo_segmentos_minuto": 54
  }
}
```

La entrada acústica acepta solo características declaradas en estas unidades. Se abstiene con duración inferior a 0.25 s, sin descriptores, con RMS cero, con pausa total o con calidad declarada inferior a 0.4. Rechaza pausas mayores a la duración y valores fuera de esquema. El productor externo, el formato de archivo y el clasificador acústico permanecen pendientes. Se debe acordar una definición de segmento, escalas de energía, calidad, referencias de sesión e identidad, y si el productor entregará rasgos o un fragmento autorizado.

El estado de cada fuente se devuelve por separado. Una imagen base64 inválida puede coexistir con descriptores acústicos válidos. Un JSON mal formado o una fuente con campos de tipo incorrecto recibe 400 o 422, respectivamente. Con dos fuentes elegibles, se comprueba sesión, procedencia declarada y diferencia de tiempo de hasta un segundo. Una referencia visual compartida de la misma sesión, instante y procedencia se conserva en ambas respuestas pero cuenta una vez para la comprobación. Los puntajes faciales y descriptores acústicos conservan sus unidades. La fusión estadística está pendiente.

## Clasificador reutilizado y evaluación

El laboratorio reutiliza `modelo_emociones_facial.pkl` v2.5 y los rasgos visuales existentes. Requiere un solo rostro frontal de al menos 64 × 64 y se abstiene si el puntaje mayor es inferior a 0.65 o la diferencia con el segundo es inferior a 0.15. Son umbrales experimentales, sin calibración en rostros. El laboratorio no llama al regresor de sucesos. Los porcentajes de la captura histórica se conservan por compatibilidad como demostración sintética separada del seguimiento.

- **Entrenamiento versionado:** semilla 42, 5,600 vectores faciales generados en código, con partición estratificada 80/20. El regresor histórico usa 6,000 casos sintéticos. No se descargaron datasets ni se entrenaron pesos nuevos en esta fase.
- **Auditoría de validación y prueba:** 1,400 vectores nuevos por partición con semillas 43 y 44, respectivamente. El modelo permanece congelado y los umbrales son fijos antes de medir. El programa imprime SHA-256 del artefacto, precisión, recall, F1, matriz de confusión, Brier, log loss, ECE de 10 tramos y cobertura. La prueba sintética dio exactitud y F1 macro de **0.9986**, ECE **0.0216**, Brier multiclase **0.0087** y cobertura **0.9921**. Esto mide generalización dentro del generador, sin evaluar imágenes de estudiantes, posturas no frontales ni calibración en una población real.
- **Datasets considerados, sin uso:** Radboud Faces exige acceso académico y supervisión para estudiantes y contiene expresiones posadas. RAVDESS se publica con licencia CC BY-NC-SA 4.0 y contiene voz actuada en inglés norteamericano. Ninguno sirve por sí solo como validación en aulas peruanas. Para un estudio posterior habría que autorizar el uso, separar por persona o actor antes de entrenar, dedicar validación a calibración y reservar una prueba independiente. [Condiciones de Radboud Faces](https://rafd.nl/FAQ.html) · [RAVDESS y su licencia](https://zenodo.org/records/1188976)

Reproduce la auditoría desde la raíz. Usa el ejecutable equivalente de Linux si corresponde.

```powershell
./backend/.venv/Scripts/python.exe -B -m backend.entrenamiento_prediccion.evaluar_expresiones
./backend/.venv/Scripts/python.exe -B -m unittest discover -s tests
node --test tests/test_frontend.cjs
```

## Asistencia, participación y prioridad académica

El POST local `/api/prediccion/estudiantes` admite `registros_academicos` además de `contextos`. Cada registro lleva ID de evento, sesión, fecha, origen y tipo. Asistencia usa `estado`; participación usa `cantidad` (conteo declarado de un bloque sin solapamiento). El evento debe vincularse a un estudiante inscrito con `verificada: true`. Si se informa confianza, se aplica el umbral de identidad del seguimiento. La verificación es una declaración del integrador. Esta demo rechaza datos declarados reales. Retransmisiones con el mismo ID, tipo y sesión se cuentan una vez. Versiones incompatibles se excluyen. La ausencia de registros se devuelve como `null`, distinta de un cero explícito.

El índice histórico se conserva. `indicadores_academicos.prioridad_academica` muestra un índice separado por tareas, reuniones, ausencias con base suficiente y evaluación próxima cuando hay al menos dos tareas pendientes. Participación se reporta como conteo. La prioridad académica no incorpora expresión, voz, objetos ni conteos de escena. Si faltan registros académicos evaluables, el valor es `null`. El caso histórico Juan devuelve 90 en su índice anterior y 40 en el académico. El [caso de cuatro estudiantes](../ejemplos/seguimiento_participacion_sintetico.json) se puede cargar desde **Asistencia y participación declaradas**.

No se encontró un historial autorizado con desenlaces académicos para comparar regresión logística y Random Forest supervisados. Una comparación posterior requiere definir el desenlace y horizonte, usar solo variables disponibles al corte, separar cronológicamente y por estudiante, y comparar errores, calibración y reglas sobre la misma prueba independiente. No se infieren calificaciones ni se requiere base de datos.
