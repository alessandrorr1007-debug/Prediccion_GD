# Contratos recibidos por PREDICCIÓN

Estado: 15 de octubre de 2026. Solo recibe JSON de resultados, no medios,
modelos ni datasets. Sus índices son heurísticos para revisión humana:
no constituyen diagnóstico, probabilidad de fraude ni sanción.

## Entrada conjunta

`POST /api/prediccion/integrar`: `imagen` y/o `video`, `objetos_permitidos`,
`segundo_actual` y `ventana_segundos` opcionales. `/api/prediccion` conserva
el contrato interno de eventos normalizados. Se mantienen las respuestas existentes.

## IMAGEN

Referencia externa de solo lectura: `D:/Proyectos/IMAGEN_REFERENCIA`.
Repositorio: https://github.com/Zudo45/SistemaSupervisionExamenes-Imagen
Commit: `eddc6234f338f9011bd1ff5cdf02985b68434167`, 8 de octubre de 2026,
19:56:11 -05:00. No incluye exportaciones reales; la versión del equipo puede diferir.

Esquema de `modulo_imagen/exportacion.py`:

- Raíz: `modulo: "IMAGEN"`, `fuente`, `generado` (ISO sin zona),
  `total_frames` entero y `frames` lista.
- Frame: `frame_id` entero, `origen` texto, `timestamp` número o fecha,
  `ancho`/`alto` enteros, `alerta_video` objeto o null, `calidad` objeto,
  `resumen` objeto y `objetos` lista.
- Objeto: `id` entero local al frame, `clase` texto, cajas `x1,y1,x2,y2`,
  `confianza_video`, `confianza_capturada`, `confianza_procesada` (0–1),
  `variacion_confianza`, `estado`, `iou_verificacion` y `caracteristicas`.
- El vigilante guarda también un frame individual con `archivo`, `procesado_en`,
  `segundos_proceso`, `decisiones` e `imagenes`. Se aceptan ambos formatos JSON.
- CSV: una fila por objeto; `objeto_id`, referencias de frame/alerta,
  campos de detección y características aplanadas. No exporta calidad del frame.
  PREDICCIÓN recibe JSON; no interpreta CSV directamente.

`calidad.capturado` y `calidad.mejorado`: brillo (media 0–255), contraste
(desviación), nitidez (varianza de Laplaciano), ruido (sigma estimada), entropía
(bits). Opcionalmente `vs_original` incluye PSNR/SSIM antes/después.
No es una puntuación 0–1. Se conserva `calidad_normalizada` opcional del contrato
anterior; si falta se usa **1 provisional**, sin afirmar calidad medida.
Las métricas, cajas, características y resumen permanecen en el JSON de origen.

Estados: `confirmada` (antes/después) y `recuperada` (solo después) se incorporan;
`no_confirmada` (solo antes) y `no_detectada` (ninguno) se descartan.
Sin estado se mantiene la compatibilidad previa; otros estados se descartan.
Confianza: procesada, capturada, VIDEO y genérica, en ese orden.
Una confianza inválida no se oculta usando otra.

Solo se exportan objetos de referencia: los encontrados únicamente después pueden
figurar en el resumen sin aparecer en `objetos`. No hay emociones ni identidad.
`caracteristicas.persona_asociada` es un índice geométrico del frame, no un alumno
ni una pista persistente. Las cajas usan la escala del pipeline, que puede redimensionar.

### Tiempo, IDs y compatibilidad

- Video: segundos `numero/FPS`.
- Carpeta: índice de imagen, **no tiempo transcurrido real**.
- Imagen individual: `0`.
- Vigilante: fecha sin zona extraída del nombre; vacío si no lo reconoce.

Se valida 0–86400 segundos, también para fechas convertidas. Se rechazan vacíos,
mezclas de fechas/segundos y zonas inconsistentes. Sin VIDEO, las fechas siguen
siendo relativas al mínimo del lote, salvo `origen_temporal` explícito.
**Con VIDEO y fechas de IMAGEN se exige `imagen.origen_temporal`**: fecha ISO
correspondiente al segundo cero de VIDEO. Debe usar la misma convención de zona
que los timestamps: si no llevan zona, el origen tampoco. El integrador debe
verificar esa correspondencia; no se inventa zona ni se alinea al mínimo del lote.

Ejemplo del envoltorio de PREDICCIÓN (sesión/origen temporal no los produce IMAGEN):

```json
{
  "imagen": {
    "sesion_id": "demo-01",
    "origen_temporal": "2026-10-15T09:59:50",
    "frames": [{"frame_id": 0, "timestamp": "2026-10-15 10:00:00",
      "origen": "captura.jpg", "objetos": [
        {"id": 0, "clase": "telefono", "confianza_procesada": 0.88, "estado": "confirmada"}]}]
  },
  "video": {"frames": [{"frame_id": 1, "timestamp": 10, "detecciones": []}]}
}
```

Los IDs se delimitan por origen, tiempo y `sesion_id` opcional con una huella
estable, además de frame/objeto. Reenvíos conservan IDs. Entre sesiones se debe
aportar `sesion_id` para evitar reutilizaciones. Sin origen ni sesión se preserva
el ID legado. Los índices de carpetas necesitan un mapeo temporal externo antes
de cruzarse con VIDEO: el JSON no permite inferirlo automáticamente.

`ejemplos/imagen_exportacion_sintetica.json` reproduce el esquema productor;
es sintético, marcado en nombre y `_nota`. Falta validación con una salida real.
Puede reemplazarse por una exportación real acumulada sin cambiar las pruebas del ejemplo.

## VIDEO

Se mantienen `frames` y alertas `schema_version: 1` con `modulo: "VIDEO"`, UUID
`evento_id`, `frame_id`, `timestamp` en segundos y `detecciones` clase/confianza.
Confirmación y tiempo de foto son distintos; confirmar/proximidad no demuestra uso.
IDs: `video:alerta:<UUID>:deteccion:<índice>`. Seguimiento no equivale a identidad.
Calidad por defecto 1; `modelo` usa nombres y no hashes completos.
No hay clases nuevas ni cambios en PESOS. Solo existe un ALIAS, en `video/adapter.py`.

El IMAGEN publicado espera nombres sin UUID final y no lee el JSON de VIDEO:
puede perder fecha, UUID y metadatos. No se modifica el productor externo ni
se compensan esos datos inventándolos en PREDICCIÓN.

## AUDIO y alcance pendiente

AUDIO espera repositorio, resultados y contrato. Solo contiene `modulo.json` y
`.gitkeep`; integrar AUDIO devuelve error explícito. Admitir eventos internos con
modalidad audio no implica tener un adaptador real.

El contrato recibido aún no aporta emociones ni identidad verificable. PREDICCIÓN
incorpora un segundo motor de seguimiento académico **sintético**, desacoplado del
motor de exámenes. Su contrato nuevo requiere asociaciones explícitas de identidad
y contexto aportado por el integrador; no se presentan como capacidades de los equipos.
Ver [SEGUIMIENTO_ESTUDIANTES.md](SEGUIMIENTO_ESTUDIANTES.md): contrato versionado,
API local con OpenAPI, reglas, ejemplos y límites. AUDIO sigue pendiente y cualquier
clasificación emocional futura se trata como observación incierta, sin puntos.

---

## Ingesta Multimodal Directa por Captura (Producción v2.5)

`POST /api/prediccion/analizar-captura`: Ingesta directa de imagen mejorada (entregada por el módulo de **IMAGEN**) y contexto de acciones detectadas (entregado por **VIDEO** o **IMAGEN**).

### Esquema de Entrada:
```json
{
  "imagen_b64": "data:image/jpeg;base64,...",
  "contexto_externo": {
    "acciones_detectadas": ["uso_celular", "uso_audifonos", "mirada_desviada", "postura_cansancio"],
    "objetos": ["telefono", "audifonos", "laptop"]
  }
}
```

### Comportamiento y Garantías:
1. **Detección Híbrida Real:** Ejecuta YOLO Pose (`yolo11n-pose.pt`) y YOLO Best (`best.pt`) para detectar alumnos y objetos por proximidad espacial. Calcula inclinación de cabeza vertical (`head_pitch`).
2. **Cero Estudiantes Falsos:** Si la imagen capturada tiene 0 personas (pared, escritorio vacío), retorna inmediatamente `total_alumnos: 0`, `estudiantes: []` y estado `"sin_personas"`.
3. **Predicción Multimodal:** Para cada alumno detectado evalúa las **7 emociones universales en porcentaje** con `modelo_emociones_facial.pkl` (99.02% accuracy) e infiere acontecimientos previos, consecuencias y riesgo de desaprobar el parcial (`prob_jalar_parcial`) con `modelo_sucesos_academicos.pkl` (R²=0.902).

