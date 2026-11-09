# AulaPredict · Guía de demostración de Predicción

Esta guía usa exclusivamente datos sintéticos. El seguimiento corre como demo local. La captura usa una imagen de prueba sin personas reales. Los resultados se explican como índices de revisión o estimaciones experimentales, según el motor.

## Requisitos previos

- Clon del proyecto con Python 3.11.15, `uv` y Chrome o Edge. Node es necesario para ejecutar las pruebas de frontend.
- Cámara opcional. Para mostrar captura automática, usa un rostro sintético autorizado en el encuadre. La detección local usa `FaceDetector` cuando está disponible o descarga el código, WASM y modelo de MediaPipe como alternativa.
- Los dos `.pkl` versionados deben estar en `backend/entrenamiento_prediccion/`. Los pesos YOLO son opcionales. El perfil base usa OpenCV Headless y permite continuar con el detector Haar.
- Ejecuta los comandos desde la raíz. Para el seguimiento abre `http://127.0.0.1:8001` directamente, sin proxies ni túneles.

## Inicio en Windows

```powershell
uv venv --python 3.11.15 backend/.venv
uv pip install --python ./backend/.venv/Scripts/python.exe -r requirements.txt
./iniciar-prediccion.ps1
```

Si ya creaste el entorno con las dependencias del proyecto, basta con ejecutar el último comando. En otra terminal:

```powershell
$base = 'http://127.0.0.1:8001'
Invoke-RestMethod "$base/api/salud"
Invoke-RestMethod "$base/api/vision/estado"
(Invoke-RestMethod "$base/api/prediccion/ejemplo-aula").modelos_predictivos | ConvertTo-Json -Depth 5
```

## Inicio en Linux

```bash
uv venv --python 3.11.15 backend/.venv
uv pip install --python backend/.venv/bin/python -r requirements.txt
backend/.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8001
```

Para reproducir el arranque de Render, el comando en ese entorno usa `--host 0.0.0.0 --port "$PORT"`. Usa localhost para la sustentación del seguimiento. Un despliegue remoto, aunque esté saludable, mantiene el bloqueo del seguimiento sintético remoto.

## Secuencia de la sustentación

1. **Inicio.** Abre `http://127.0.0.1:8001`. Identifica el visor y las secciones **Integración de fuentes** y **Seguimiento académico**.
2. **Salud del backend.** Consulta `GET /api/salud`. Espera `estado: ok` y `motor_listo: true`. Corresponde al motor de reglas.
3. **Estado de modelos.** Consulta `GET /api/vision/estado` para distinguir pesos YOLO presentes y cargados. Sin `.pt`, espera `modelo_no_disponible` en `modelo_yolo`. Consulta `GET /api/prediccion/ejemplo-aula` para calentar y verificar los dos Random Forest. Deben devolver `modelos_predictivos_disponibles: true` y cinco perfiles ficticios. Las métricas de entrenamiento están en `GET /api/prediccion/modelo/metricas`.
4. **Captura desde la interfaz.** Pulsa **Iniciar visor de cámara** y permite el acceso. Con el modo automático activo, presenta el rostro sintético. El detector del navegador decide si envía un JPEG a `POST /api/prediccion/analizar-captura`. El intervalo inicial es de 5 segundos por cámara y solo se procesa una petición a la vez. Si no dispara, usa **Capturar Imagen y Predecir** o **Subir Foto**. Las referencias de la cámara quedan con identidad desconocida. Pulsa **Detener cámara** al terminar.
5. **Recepción de observaciones.** En **Integración de fuentes**, consulta `GET /api/modulos`. Imagen y video muestran los adaptadores disponibles y su validación con fixtures sintéticos. Audio muestra `estado_integracion: integracion_pendiente`. Estos estados informan del contrato y los archivos disponibles, sin implicar que un productor externo esté conectado en vivo.
6. **Consulta académica.** Abre **Seguimiento académico**, elige **Juan Pérez · concurrencia de factores**, carga el ejemplo y pulsa **Evaluar señales**. `POST /api/prediccion/estudiantes` devuelve **90/100**, nivel alto, reglas con evidencia y docente/tutor como destinatarios sugeridos.
7. **Integración de evidencias.** Carga **Imagen, video, captura e historial**. Espera **30/100** por tareas pendientes y evaluación próxima. Imagen y video describen una misma ocurrencia de teléfono y conservan sus orígenes. El conteo sintético de cámara queda en **Observaciones sin atribuir**. La coincidencia documentada no suma puntos por duplicado.
8. **Información insuficiente.** Carga **Datos insuficientes**. El índice aparece como `—` y se detallan los datos faltantes. Para mostrar otro caso, elige **Identidad desconocida** y comprueba que las observaciones quedan sin atribuir.
9. **Explicación de la prioridad.** Reabre el caso multimodal. Muestra las reglas de tareas y evaluación próxima, sus referencias y la coincidencia separada. Si muestras el flujo de revisión de exámenes, mantén su índice separado de la prioridad académica.
10. **Cierre.** Indica qué provino del ejemplo sintético, qué se verificó en el navegador y cuáles son los pendientes de integración. Las sugerencias se muestran en pantalla. El sistema no envía avisos, guarda historiales ni verifica identidad biométrica.

## Datos y comprobaciones por API

- `POST /api/prediccion/estudiantes` con `seguimiento_juan_sintetico.json` devuelve 90, nivel alto.
- La misma ruta con `seguimiento_multimodal_sintetico.json` devuelve 30, nivel moderado, tres fuentes declaradas y el conteo sin atribuir.
- `seguimiento_insuficientes_sintetico.json` devuelve `indice_prioridad: null`.
- `POST /api/prediccion/integrar` con `integracion_imagen_video.json` devuelve `indice_revision: 62.52`.
- `POST /api/prediccion/analizar-captura` con un JPEG sintético sin rostro devuelve `estado: sin_personas` y `total_alumnos: 0`.

En PowerShell, con el servidor iniciado:

```powershell
$json = Get-Content ejemplos/seguimiento_multimodal_sintetico.json -Raw -Encoding UTF8
Invoke-RestMethod "$base/api/prediccion/estudiantes" -Method Post -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($json))
```

En Linux:

```bash
curl -fsS -H 'Content-Type: application/json' --data-binary @ejemplos/seguimiento_multimodal_sintetico.json http://127.0.0.1:8001/api/prediccion/estudiantes
```

## Contingencias

- **Cámara ausente, permiso denegado o equipo sin detector.** Usa **Subir Foto** para demostrar el POST y **Probar con Captura Grupal** para mostrar cinco perfiles sintéticos. Con un visor activo pero sin detector disponible, usa la captura manual. La foto plana del siguiente comando comprueba el caso sin rostro y se guarda fuera del repositorio.

```powershell
./backend/.venv/Scripts/python.exe -c "import cv2,numpy as np; from pathlib import Path; from tempfile import gettempdir; p=Path(gettempdir())/'aulapredict-fondo-sintetico.jpg'; ok,b=cv2.imencode('.jpg',np.full((480,640,3),180,dtype=np.uint8)); assert ok; p.write_bytes(b.tobytes()); print(p)"
```

- **Falla la captura automática.** El visor pausa el modo automático tras un error de análisis. Comprueba salud, red y el mensaje HTTP. Reactiva la casilla cuando esté resuelto. La primera inferencia puede tardar más por carga de modelos.
- **Faltan los `.pt`.** Continúa con el perfil base. Espera `modo_respaldo` en captura y el diagnóstico de pesos ausentes.
- **Faltan los `.pkl`.** La interfaz informa que los modelos predictivos no están disponibles y omite las estimaciones. Para mostrar los perfiles, restaura los artefactos versionados desde un clon íntegro. El seguimiento por reglas puede demostrarse por separado.
- **HTTP 403 en seguimiento.** Ejecuta directamente en localhost. Si aparece 422, revisa `detail` y, si corresponde, `error_integracion`. Un 413 indica que se superó el límite de la ruta.
- **Los equipos externos no están disponibles.** Usa los JSON identificados como sintéticos. No presentes esa ejecución como validación con exportaciones reales.

## Contratos pendientes con los otros grupos

- **Imagen:** solicitar exportación anonimizada de fotograma o `frames[]`, con ID de fotograma y objeto, clase, estado, confianza, calidad normalizada si existe, sesión y tiempo en segundos o `timestamp` con origen temporal.
- **Video:** solicitar `frames[]` o alerta VIDEO v1 anonimizada, con ID estable de evento/fotograma, segundo relativo, clase, confianza y calidad si existe. Si describe el mismo evento que Imagen, acordar un ID de evidencia compartido. Una identidad individual requiere una asociación explícita y verificable.
- **Audio:** solicitar un esquema versionado y un JSON anonimizado de ejemplo, con ID de evento, sesión, tiempo, tipo de señal, valor, confianza, calidad cuando exista y criterio de vinculación con identidad. La integración permanece pendiente hasta validar ese contrato.

## Verificación y límites

Ejecuta desde la raíz, tras instalar las dependencias de pruebas:

```powershell
uv pip install --python ./backend/.venv/Scripts/python.exe -r tests/requirements.txt
./backend/.venv/Scripts/python.exe -B -m unittest discover -s tests
node --test tests/test_frontend.cjs
```

El [notebook de entrenamiento](entrenamiento_sintetico.ipynb) reproduce el clasificador facial y el regresor académico con semilla 42 y datos generados. La exactitud facial de 99.02 %, el MAE de 3.45 y el R² de 0.902 describen ese experimento. El seguimiento utiliza reglas separadas. La evidencia emocional no diagnostica ni acredita riesgo académico, y los resultados de distintos motores no se suman como probabilidades.
