# Frontend de integración

Interfaz de PREDICCIÓN para importar o editar JSON de IMAGEN/VIDEO y consultar evidencia.
Sirve desde FastAPI en http://localhost:8001; permite configurar la dirección del servicio.

Formatos: entrada conjunta para `/api/prediccion/integrar`, exportación IMAGEN,
alerta/fotogramas VIDEO y eventos normalizados para `/api/prediccion`.
Para JSON sueltos de un módulo selecciona su formato: la interfaz crea el envoltorio correspondiente.

No solicita cámara ni micrófono, ni sube medios para inferencia. AUDIO sigue pendiente.
El ejemplo inicial es sintético; el índice es heurístico y exige revisión humana.

El selector de motor permite **Supervisión de exámenes** o **Seguimiento por estudiante**.
El segundo carga ocho ejemplos desde `/api/prediccion/estudiantes/ejemplos/{caso}`,
envía `/api/prediccion/estudiantes` y presenta evidencias por módulo/contexto,
identidad, reglas, datos faltantes, contradicciones, prioridad y recomendaciones.
Conserva entradas separadas al alternar motores; no guarda datos en el navegador.
Solo demo sintética local: no cargar datos reales ni exponer mediante proxies/túneles.
El POST B carece de autenticación y rechaza accesos remotos. Los avisos solo se sugieren.

Pruebas funcionales del controlador con API real y DOM mínimo:
`node --test tests/test_frontend.cjs`. No sustituyen revisión visual en navegador.
La interfaz anterior se conserva en el respaldo externo descrito en `docs/ORDEN_Y_ARCHIVO.md`.
