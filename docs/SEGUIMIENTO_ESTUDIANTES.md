# AulaPredict: dos motores independientes

## Diagnóstico previo y alcance implementado

La inspección confirmó FastAPI, adaptadores JSON de IMAGEN/VIDEO, motor de exámenes
sin identidad y frontend de recepción de resultados. Las **37 pruebas iniciales
pasaron**. Se conservaron los cambios locales existentes y no se hicieron commits
ni push. No se modificó el respaldo externo del 15 de octubre de 2026.

IMAGEN publicado solo exporta objetos verificados y métricas; VIDEO identifica
pistas locales, no alumnos. Ninguno acredita emociones ni identidad personal en
los contratos recibidos. AUDIO sigue pendiente, con solo sus dos marcadores.

- **Motor A:** `engine.py`, `/api/prediccion` y `/api/prediccion/integrar` permanecen
  con sus reglas, ventanas, calidad, deduplicación y respuestas actuales.
- **Motor B:** `seguimiento.py`, contrato Pydantic, puente de adaptadores y router
  propios. No modifica puntuaciones del A ni suma ambos índices.
- No incorpora reconocimiento facial, inferencia local, modelos, datasets ni entrenamiento.

## Uso reproducible

```powershell
./iniciar-prediccion.ps1
```

Abrir http://localhost:8001, seleccionar **Seguimiento por estudiante**, cargar un
escenario sintético y evaluar. La interfaz conserva separadamente la entrada del
motor A y muestra estudiante/sesión, índice, reglas, evidencia por módulo,
contexto, datos faltantes, contradicciones y recomendaciones. La respuesta JSON
completa también está disponible. No hay cámara ni micrófono.

También desde PowerShell, con el servicio iniciado:

```powershell
$json = Get-Content ejemplos/seguimiento_juan_sintetico.json -Raw -Encoding UTF8
$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
Invoke-RestMethod -Uri http://localhost:8001/api/prediccion/estudiantes -Method Post -ContentType 'application/json; charset=utf-8' -Body $bytes
```

El POST tiene esquemas de entrada/salida en `/docs` y `/openapi.json`.
`GET /api/prediccion/estudiantes/ejemplos/{caso}` entrega únicamente los ocho
ejemplos ficticios permitidos; no sirve archivos arbitrarios ni perfiles reales.

## Contrato B, versión 1

Entrada raíz (ver JSON completos en `ejemplos/seguimiento_*_sintetico.json`):

- `schema_version: 1`, `simulado: true`, `descripcion` obligatoria que identifica la demo.
- `estudiantes`: `estudiante_id`, nombre opcional y **sesiones explícitas de inscripción**.
  El nombre solo se muestra: no interviene en las reglas.
- `sesiones`: ID, actividad (`clase`, `examen`, `taller`), inicio ISO con zona,
  segundo actual (0–86400), objetos permitidos y `finalizada` para referencias históricas.
- `observaciones` e `historial`: mismo esquema de señales. No se guarda historial:
  el integrador aporta en cada petición lo que desea analizar.
- `asociaciones`: vínculo explícito de **sesión + módulo + ID de observación** a
  estudiante, método (`revision_manual` o `registro_institucional`), referencia
  verificable, `verificada: true` y confianza >=0.9 (o umbral más estricto configurado).
  Inscripción y referencias deben existir. Una asociación ausente, débil o ambigua
  nunca se sustituye por nombre, `persona_id`, `telefono_id`, posición o proximidad.
- `contextos`: estudiante/sesión, origen del registro, asistencia (`presente`,
  `ausente`, `justificada`), tareas (`pendiente`, `entregada`), reuniones
  (`incumplida`, `realizada`, `cancelada`) y evaluación próxima opcional.
  Cada registro tiene ID y fecha. `null`/ausente significa desconocido; una lista
  vacía es un listado aportado sin registros. No se inventan antecedentes ni se
  consultan sistemas institucionales. Se excluyen registros con fecha futura.
- `fuentes`: resultados JSON de IMAGEN/VIDEO mediante los adaptadores actuales.
- `reglas`: configuración opcional validada; se devuelve como `reglas_aplicadas`.

Ejemplo de observación normalizada (sintética, no un contrato ya entregado por VIDEO):

```json
{
  "id": "video:demo-1",
  "sesion_id": "demo-01",
  "modulo": "video",
  "segundo": 10,
  "fecha_hora": "2026-10-15T10:00:10-05:00",
  "origen": "observacion_VIDEO_SINTETICA",
  "tipo": "objeto",
  "valor": "telefono",
  "presente": true,
  "confianza": 0.92,
  "calidad": 0.8,
  "evidencia_id": "captura-demo-1"
}
```

`fecha_hora` debe coincidir con inicio + segundo (tolerancia de un segundo).
No se mezclan relojes ni sesiones. `presente:false` es una **ausencia explícitamente
aportada**, nunca inferida porque el detector no entregó un objeto.
Calidad desconocida (`null`) no se considera calidad suficiente.

El contrato reserva `tipo: emocion`, siete valores (`alegria`, `tristeza`, `miedo`,
`enojo`, `sorpresa`, `asco`, `neutral`) y porcentaje 0–100 separado de confianza.
Son clasificaciones inciertas: no aportan puntos ni sustituyen evidencia académica.
**Esto no afirma que IMAGEN/VIDEO produzcan emociones.** Los ejemplos principales
no inventan ese resultado. `senal_voz` corresponde a AUDIO, pero AUDIO se rechaza
explícitamente hasta recibir contrato y adaptador; no se simula una integración acústica.

## Reutilización de resultados actuales

Una fuente tiene `modulo`, `sesion_id`, `origen`, `datos` (JSON productor) y
`evidencias` opcional (mapa ID normalizado → referencia de captura compartida).
El puente llama a `adaptar_video` o `adaptar_imagen`; no ejecuta modelos.
Los IDs emitidos por esos adaptadores se preservan. Se construye la fecha desde
el reloj explícito de la sesión. Los vínculos se declaran aparte en `asociaciones`.
La función `reunir_observaciones` permite inspeccionar los IDs antes de asociarlos.

Fechas IMAGEN requieren `datos.origen_temporal`, incluso si llega como única fuente
del motor B. Debe coincidir con el inicio de sesión. Si IMAGEN exporta fechas sin
zona, se declara el origen en ese mismo reloj local; el inicio de sesión aporta
la zona explícita. No se deduce ubicación ni identidad a partir de metadatos.
Los índices de carpetas no son segundos reales: el integrador debe mapearlos.

Los adaptadores antiguos mantienen calidad **1 provisional** cuando el productor
no aporta un valor normalizado. El motor B informa esa limitación: no es calidad
medida. Todos conservan un único diccionario ALIAS en `video/adapter.py`.

## Reglas de demostración y puntos predeterminados

Los puntos son decisiones heurísticas configurables, sin calibración estadística:

- Presencia recurrente de teléfono no permitido: **35**. Mínimo tres muestras
  separadas >=5 segundos en los últimos 60 segundos; por tanto, al menos diez
  segundos entre primera y tercera. No demuestra uso, distracción ni fraude.
- Al menos dos tareas registradas pendientes: **20**; no presume atraso ni causa.
- Al menos una reunión incumplida: **10**.
- Al menos dos ausencias con una base de cinco registros: **15**; sin inferir deserción.
- Concurrencia de recurrencia, alguna tarea pendiente y reunión incumplida: **15**.
  Es una combinación explícita, no una prueba de causalidad.
- Evaluación próxima junto con recurrencia o dos pendientes: **10**.
- Cambio del patrón observado: **10**, solo con tres o más sesiones previas
  finalizadas de la misma persona, actividad, permisos, módulos y duración efectiva
  de ventana. Se requieren al menos tres muestras explícitas de presencia/ausencia
  por sesión y un aumento >=0.5 de la fracción positiva respecto al promedio previo.
  No se reutilizan como bases independientes sesiones con igual inicio o referencias
  de evidencia compartidas. Mide muestras aportadas, no conducta ni cobertura continua.

Por defecto: confianza >=0.6 y calidad >=0.4. Ventanas y pesos pueden configurarse.
La identidad nunca puede bajar de confianza 0.9. Índice: suma de puntos, tope 100.
Nivel bajo <30, moderado >=30, alto >=60. Sin observaciones de objetos aceptadas
ni registros académicos válidos: `datos_insuficientes`, índice `null`.
Emociones o anuncios de evaluación por sí solos no bastan.

Juan activa 20 + 10 + 35 + 15 + 10 = **90**, prioridad alta para revisión.
Docente y tutor son destinatarios sugeridos; el sistema no envía mensajes.
No se afirma que Juan esté distraído, tenga un problema emocional o desapruebe.

## Duplicados, correlación y contradicciones

- Retransmisión idéntica por sesión/módulo/ID: una sola vez, con contador de omitidos.
- Mismo ID con contenidos distintos: todas sus versiones se excluyen y se informa.
- Misma referencia `evidencia_id` o muestras del mismo objeto a <=1 segundo:
  una muestra correlacionada por estudiante/sesión. No suman modalidades independientes.
- Si la muestra contiene presencia y ausencia, se excluye del cálculo y se muestra
  la contradicción. Para retrasos mayores se exige referencia común: no se puede
  descubrir correlación arbitraria sin datos del productor.
- Un registro académico repetido no suma; estados/fechas incompatibles del mismo
  ID se excluyen. Las tareas distintas siguen siendo factores distintos.
- Una observación aislada no activa recurrencia. No se atribuyen causas psicológicas.

## Escenarios sintéticos y resultados esperados

- `seguimiento_juan_sintetico.json`: prioridad **90**, alta, cinco reglas.
- `seguimiento_sin_alerta_sintetico.json`: prioridad **0**, sin regla activada.
- `seguimiento_identidad_desconocida_sintetico.json`: **datos insuficientes**, tres
  observaciones sin atribuir, sin adjudicar detecciones a Juan.
- `seguimiento_insuficientes_sintetico.json`: **datos insuficientes**, sin historial aportado.
- `seguimiento_contradictorio_sintetico.json`: prioridad **0**, contradicciones para resolver.
- `seguimiento_duplicados_sintetico.json`: prioridad **90**, tres duplicados omitidos.
- `seguimiento_aislado_sintetico.json`: prioridad **0**, no concluye uso ni falta de atención.
- `seguimiento_cambio_patron_sintetico.json`: prioridad actual **100** y tres sesiones
  históricas con ausencia explícita. El cambio es de observaciones, no de conducta.

## Seguridad, privacidad y límites

API B solo acepta `simulado:true`, conexión local directa (loopback) y cuerpo <=2 MB.
Rechaza conexiones remotas/proxies con 403 y datos marcados reales con 422.
**No hay autenticación institucional**: el marcador sintético no acredita que un
nombre o referencia sean reales ni autoriza su uso. Usar exclusivamente personajes
ficticios. No publicar este flujo mediante túneles, proxies ni extensiones que lo
expongan. Para datos reales hacen falta autenticación, permisos por rol y estudiante,
revisión de privacidad, procedencia y política de retención acordada.

No hay base de datos, archivos de historial, almacenamiento del navegador ni logs
de cuerpos personales en este flujo. Las respuestas usan `Cache-Control: no-store`;
los errores de validación no reflejan valores del input. No hay GET de perfiles.
La documentación OpenAPI describe el contrato; no lista datos de estudiantes.
Se rechazan campos ajenos, incluidos atributos sensibles no requeridos.

El nombre y las clasificaciones emocionales no asignan puntos. Las asociaciones
son declaraciones referenciadas del integrador: PREDICCIÓN no comprueba documentos
externos ni convierte confianza en identidad biométrica. Toda salida exige revisión
humana, incluso cuando no se activa una regla. No hay sanciones ni avisos automáticos.

## Verificación

```powershell
./backend/.venv/Scripts/python.exe -B -m unittest discover -s tests -v
node --test tests/test_frontend.cjs
```

Las pruebas Node usan un DOM mínimo y un servidor FastAPI real temporal en loopback,
con solo ejemplos ficticios; no necesitan paquetes npm. Se inicia y detiene su propio
servidor. `PYTHON_FOR_TESTS` permite elegir otro intérprete con los requisitos instalados.
No equivalen a validación visual en navegador.

Resultado final: **75 pruebas Python aprobadas y 4 funcionales Node aprobadas;
0 fallidas**. Las 37 originales permanecen aprobadas. La revisión de sintaxis de
JavaScript y `git diff --check` también pasan. No se realizó validación visual en
un navegador. Los cambios locales previos se conservaron y el respaldo externo
no se modificó.

Archivos de esta evolución:

- Nuevos: `backend/modulos/prediccion/seguimiento.py`, `seguimiento_contrato.py`,
  `seguimiento_integracion.py`, `seguimiento_api.py`; ocho JSON `seguimiento_*_sintetico.json`;
  `tests/test_seguimiento.py`, `tests/test_seguimiento_api.py`, `tests/test_frontend.cjs`;
  este documento.
- Modificados: `backend/app.py`, `backend/requirements.txt`, manifiesto y README de
  PREDICCIÓN; `frontend/index.html`, `frontend/app.js`, `frontend/style.css` y README;
  README raíz y `docs/CONTRATO_MODULOS.md`.
- Sin cambios por esta evolución: motor A, adaptadores de equipos, marcadores AUDIO,
  ejemplos/pruebas previos y respaldo externo.

## Próximos pasos

Validar exportaciones reales de IMAGEN/VIDEO; acordar referencia compartida de
captura, reloj y asociación revisada de identidad; recibir el contrato AUDIO.
Después, evaluar reglas con docentes/tutores y casos etiquetados antes de usar
prioridades en un entorno real. Una integración autenticada es un trabajo posterior,
no una capacidad implícita de esta demostración.
