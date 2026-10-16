# AulaPredict · Predicción

Servicio de integración del equipo de **PREDICCIÓN**. Recibe los resultados de IMAGEN, VIDEO y, cuando esté disponible, AUDIO; no entrena ni duplica los modelos de esos equipos.

Ahora ofrece **dos motores independientes**: supervisión de exámenes (existente)
y seguimiento por estudiante (demostración sintética local). El segundo cruza
observaciones con identidad explícitamente asociada y contexto académico;
no predice notas, diagnósticos ni sanciones. [Diseño, reglas y contrato B](docs/SEGUIMIENTO_ESTUDIANTES.md).

---

## 🔌 Guía Rápida para el Integrador General (Cómo consumir el Entrenamiento de Predicción)

Si eres el encargado de unir los módulos del curso (**VIDEO**, **IMAGEN** y **PREDICCIÓN**), puedes consumir nuestro motor entrenado de dos maneras directas:

### Opción A: Importación directa del entrenamiento en Python (Librería Autocontenida)

1. **Carpetas requeridas:** Copia a tu proyecto las carpetas de este repositorio:
   - `backend/entrenamiento_prediccion/` (contiene los modelos `modelo_emociones_facial.pkl`, `modelo_sucesos_academicos.pkl` e inferencia).
   - `backend/modelo_ia/` (contiene los modelos de visión `yolo11n-pose.pt` y `best.pt`).

2. **Código de Inferencia en 3 líneas:**
```python
from backend.entrenamiento_prediccion import procesar_captura_imagen

# 1. Recibe la imagen mejorada de IMAGEN (base64) y las acciones detectadas de VIDEO/IMAGEN
contexto = {"acciones_detectadas": ["uso_celular"], "objetos": ["telefono"]}
resultado = procesar_captura_imagen(imagen_b64, contexto_externo=contexto)

# 2. Acceso a alumnos detectados y sus 7 emociones universales + predicción de riesgo parcial
print(f"Alumnos detectados: {resultado['total_alumnos']}")
for est in resultado["estudiantes"]:
    print(f"Estudiante: {est['nombre']} | Dominante: {est['emociones']['dominante']} | Score Riesgo: {est['score']}/100")
```

---

### Opción B: Consumo vía API REST en Producción

1. **Petición HTTP:** Envía un `POST /api/prediccion/analizar-captura`:
```http
POST /api/prediccion/analizar-captura HTTP/1.1
Content-Type: application/json

{
  "imagen_b64": "data:image/jpeg;base64,...",
  "contexto_externo": {
    "acciones_detectadas": ["uso_celular", "mirada_desviada"],
    "objetos": ["telefono"]
  }
}
```

2. **Formato JSON de Respuesta en Producción:**
- **Sin personas en captura (0 alumnos falsos):**
```json
{
  "estado": "sin_personas",
  "mensaje": "No se detectaron estudiantes en la captura. No hay predicciones para generar.",
  "total_alumnos": 0,
  "estudiantes": [],
  "resolucion_captura": "1280x720",
  "soporte_emociones": 7
}
```

- **Con alumnos detectados:**
```json
{
  "estado": "exito",
  "total_alumnos": 1,
  "resolucion_captura": "1280x720",
  "soporte_emociones": 7,
  "estudiantes": [
    {
      "id": 1,
      "nombre": "Estudiante 1",
      "subId": "0.91",
      "estado": "Distracción detectada",
      "accionDetectada": "Uso de celular detectado en regazo o pupitre",
      "atencion": 28,
      "emociones": {
        "neutral": 15,
        "felicidad": 8,
        "tristeza": 12,
        "enojo": 18,
        "miedo": 42,
        "sorpresa": 3,
        "disgusto": 2,
        "dominante": "Miedo / Ansiedad (😨)"
      },
      "causas": [
        { "texto": "Distracción o consulta no autorizada mediante dispositivo móvil", "prob": 88 },
        { "texto": "Bloqueo cognitivo o falta de preparación conceptual", "prob": 74 }
      ],
      "consecuencias": [
        { "texto": "Riesgo crítico de desaprobación ('jalar') en el examen parcial", "prob": 82 },
        { "texto": "Pérdida de continuidad académica en la sesión evaluativa", "prob": 79 }
      ],
      "score": 85,
      "nivelRiesgo": "Riesgo de Desempeño: ALTO / CRÍTICO",
      "esRiesgoAlto": true,
      "alertaExamen": "Riesgo inminente de desaprobar ('jalar') el examen parcial.",
      "narrativa": "El Estudiante 1 presenta patrones de mirada hacia el regazo y manipulación de smartphone...",
      "box": { "x": 0.35, "y": 0.18, "w": 0.30, "h": 0.54 },
      "distractor": true,
      "distractorBox": { "x": 0.42, "y": 0.58, "w": 0.10, "h": 0.14, "label": "Celular (0.91)" }
    }
  ]
}
```

---

## Equipos conectados

- **VIDEO:** [SistemaSupervisionExamenes](https://github.com/cesarcabanillas1921-bit/SistemaSupervisionExamenes). Entrega detecciones por fotograma con clase, confianza y tiempo.
- **IMAGEN:** [SistemaSupervisionExamenes-Imagen](https://github.com/Zudo45/SistemaSupervisionExamenes-Imagen). Verifica detecciones, mide calidad y exporta JSON/CSV.
- **AUDIO:** pendiente de repositorio y contrato de salida.
- **PREDICCIÓN:** normaliza las señales, aplica reglas explicables y devuelve evidencia para revisión humana.

Los entrenamientos, pesos y aplicaciones de cada modalidad permanecen en sus repositorios. Este proyecto conserva únicamente adaptadores y contratos de integración.

## Inicio local

Requiere Python 3.11:

```powershell
py -3.11 -m venv backend/.venv
./backend/.venv/Scripts/python.exe -m pip install -r requirements.txt
./iniciar-prediccion.ps1
```

Abrir `http://localhost:8001`. La interfaz permite editar una entrada conjunta de IMAGEN y VIDEO y ejecutar PREDICCIÓN.

También permite importar JSON de un módulo y seleccionar su formato. No solicita
cámara ni micrófono: las rutas locales `/api/medios/*` quedaron retiradas.
El material previo de entrenamiento/inferencia está archivado fuera del repo,
con respaldo verificado; ver [inventario y restauración](docs/ORDEN_Y_ARCHIVO.md).

## API

- `GET /api/salud`: estado del motor.
- `GET /api/modulos`: estado, repositorio y adaptadores de cada equipo.
- `POST /api/prediccion`: contrato interno de eventos ya normalizados.
- `POST /api/prediccion/integrar`: formatos entregados por IMAGEN y VIDEO.
- `POST /api/prediccion/estudiantes`: seguimiento por estudiante, solo demo sintética local.
- `GET /api/prediccion/estudiantes/ejemplos/{caso}`: ocho escenarios ficticios de seguimiento.
- `GET /docs`: documentación interactiva.

Prueba de integración:

```powershell
Invoke-RestMethod -Uri http://localhost:8001/api/prediccion/integrar -Method Post -ContentType 'application/json' -Body (Get-Content ejemplos/integracion_imagen_video.json -Raw)
```

## Estructura

```text
backend/app.py                         Entrada de FastAPI
backend/modulos/imagen/adapter.py      Adaptador de la exportación de IMAGEN
backend/modulos/video/adapter.py       Adaptador de detecciones de VIDEO
backend/modulos/audio/modulo.json      Integración pendiente
backend/modulos/prediccion/            Integración, API y motor de reglas
ejemplos/                              Entradas reproducibles
frontend/                              Prueba local del contrato conjunto
tests/                                 Pruebas de API, adaptadores y motor
docs/                                  Contratos e inventario del archivo externo
```

El índice generado es heurístico y no calibrado: no representa una probabilidad de fraude ni debe producir sanciones automáticas.

## Seguimiento por estudiante

En la interfaz selecciona **Seguimiento por estudiante**, carga un ejemplo y evalúa.
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
./backend/.venv/Scripts/python.exe -m pip install -r tests/requirements.txt
./backend/.venv/Scripts/python.exe -m unittest discover -s tests -v
node --test tests/test_frontend.cjs
```
