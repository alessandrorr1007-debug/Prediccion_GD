# Interfaz de predicción

Interfaz de PREDICCIÓN para importar o editar JSON de IMAGEN/VIDEO y consultar evidencia.
Sirve desde FastAPI en http://localhost:8001; permite configurar la dirección del servicio.

Formatos: entrada conjunta para `/api/prediccion/integrar`, exportación IMAGEN,
alerta/fotogramas VIDEO y eventos normalizados para `/api/prediccion`.
Para JSON sueltos de un módulo selecciona su formato: la interfaz crea el envoltorio correspondiente.

## Cámara y captura

La cámara se solicita al pulsar **Iniciar visor de cámara** en localhost o HTTPS. Con la captura automática habilitada, se comprueba localmente si hay un rostro y se envía ese fotograma al backend que sirve el panel. El intervalo configurable empieza en 5 segundos y se aplica a toda la cámara. Se permite una solicitud de análisis a la vez.

Se usa `FaceDetector` del navegador cuando funciona. Como alternativa se carga MediaPipe Tasks Vision 0.10.32 con BlazeFace. La alternativa requiere acceso a jsDelivr para el código y WASM y a Google Cloud Storage para el modelo. El detector procesa los fotogramas en el navegador y el JPEG seleccionado se envía al servidor de AulaPredict. Si el detector no está disponible, sigue habilitada la captura manual. [Documentación de MediaPipe](https://developers.google.com/edge/mediapipe/solutions/vision/face_detector?tab=Web)

**Detener cámara** libera el stream y cancela la solicitud de cámara en el cliente. La captura manual y la subida de archivos usan el mismo endpoint de análisis y dejan la foto fija. **Nueva captura** vuelve al visor. Si falla un análisis automático, se pausa la captura automática y se puede reactivar con el selector. La captura visual asigna referencias del encuadre con identidad desconocida. El panel indica cuándo el servidor usa el respaldo visual y omite las estimaciones si faltan los modelos predictivos.

## Seguimiento académico

El enlace **Seguimiento académico** abre el panel de integración. El selector de motor permite **Supervisión de exámenes** o **Seguimiento por estudiante**.
**Integración de fuentes** consulta `/api/modulos` y distingue un adaptador instalado de un productor validado. El escenario **Imagen, video, captura e historial** muestra procedencia, identidad declarada, observaciones de escena sin atribución, coincidencias y registros académicos. Si un JSON de seguimiento contiene una fuente inválida, el panel indica su posición, módulo y motivo.
El segundo ofrece ejemplos desde `/api/prediccion/estudiantes/ejemplos/{caso}`,
envía `/api/prediccion/estudiantes` y presenta evidencias por módulo/contexto,
identidad, reglas, datos faltantes, contradicciones, prioridad y recomendaciones.
Conserva entradas separadas al alternar motores; no guarda datos en el navegador.
Solo demo sintética local: no cargar datos reales ni exponer mediante proxies/túneles.
El POST B carece de autenticación y rechaza accesos remotos. Los avisos solo se sugieren.

Pruebas funcionales del controlador con API real y DOM mínimo:
`node --test tests/test_frontend.cjs`. No sustituyen revisión visual en navegador.
La interfaz anterior se conserva en el respaldo externo descrito en `docs/ORDEN_Y_ARCHIVO.md`.
