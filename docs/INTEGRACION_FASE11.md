# AulaPredict · Integración final de Predicción

## Auditoría y alcance

La Fase 11 partió de `e76a80c` en `main`, 27 commits por delante de `origin/main`. Al retomar se encontraron 13 archivos de trabajo y `INFORME_ESTADO.md` como archivo previo sin seguimiento. La interrupción dejó implementados el validador, el aislamiento por modalidad y la selección y reinicio de casos. La revisión detectó que la validación de un bloque podía rechazar una petición completa y que el clasificador Haar compartido necesitaba acceso coordinado en solicitudes simultáneas. [Fase 10 y sus mediciones](INTEGRACION_FASE10.md)

## Contratos, adaptadores y estado por equipo

Se revisaron los módulos, ejemplos y archivos disponibles en el proyecto. Se encontraron contratos, fixtures sintéticos y corpus de investigación. Sigue pendiente recibir exportaciones autorizadas de los productores para certificar la interoperabilidad.

| Equipo | Formato esperado | Evidencia recibida y campos | Transformación y pendiente |
|---|---|---|---|
| IMAGEN | `frames` o fotograma con ID, tiempo y objetos. Sesión para correlación. Origen temporal explícito si se declaran fechas | Fixture original con fecha y sin origen temporal. El validador lo rechaza. Fixture de Fase 11 con sesión, origen ISO, calidad y confianza válidos. `_nota` figura como adicional | Convierte fechas a segundos desde el origen, normaliza clase y conserva calidad. Falta una exportación real y su versión |
| VIDEO | `frames` o alerta VIDEO v1 con `evento_id`, `frame_id`, `timestamp` en segundos y `detecciones` | Alerta sintética compatible. Sesión ausente como advertencia. `persona_id` y rutas de imagen se registran como campos adicionales para este perfil | Normaliza clases y tiempos. `persona_id` carece de valor como identidad verificada. Falta una exportación real y el contrato de unidades de acción |
| AUDIO | WAV base64 PCM16 o descriptores aceptados. Sesión, origen y fecha cuando estén disponibles. Registros normalizados para asistencia y participación | Fixture de descriptores compatible y WAV RAVDESS validado en la demo. Los descriptores no activan el clasificador WAV | Valida el formato y prepara el WAV a 16 kHz. Falta una exportación real y la especificación de eventos académicos del productor |

Se reutilizan los adaptadores existentes. El validador local informa campos compatibles, adicionales y faltantes, errores, advertencias y transformaciones. El código de salida es 0 para entradas compatibles y 2 para rechazo. `--sesion` verifica un alcance explícito. Los campos opcionales conservan su condición cuando no se exige ese alcance.

```powershell
$py = './backend/.venv/Scripts/python.exe'
$mod = 'backend.modulos.prediccion.validacion_contratos'
& $py -B -m $mod imagen ejemplos/fase11_imagen_sintetica.json --sesion demo-local
& $py -B -m $mod video ejemplos/video_alerta_v1_sintetica.json
& $py -B -m $mod audio ejemplos/fase11_audio_sintetico.json --sesion demo-local
& $py -B -m $mod seguimiento ejemplos/seguimiento_multimodal_sintetico.json
```

## Arquitectura y API

`POST /api/prediccion/orquestar` valida el sobre v1, las señales y las notas por modalidad. Responde HTTP 200 con `estado: parcial` cuando un bloque queda excluido y conserva los resultados que se pueden procesar. `errores` indica campo y código. Las fuentes que fallan al adaptar seguimiento aparecen en `fuentes_seguimiento_excluidas` con su índice, módulo y causa. Se suspenden las asociaciones del módulo y sesión afectados para evitar atribuciones ambiguas. Si el esquema global o las referencias de seguimiento impiden una evaluación segura, ese bloque queda ausente. La ruta de seguimiento anterior conserva su validación estricta.

El alcance `sesion_id` sigue siendo opcional. La opción `ventana_captura` con inicio y fin ISO y zona horaria permite excluir señales fuera de la ventana o sin fecha. Evalúa tiempo de captura declarado. El motor de seguimiento conserva su ventana por segundo de sesión. Una versión de sobre inválida devuelve 422. Una modalidad ausente, una abstención y la falta de pesos son estados explícitos.

`POST /api/prediccion/demostracion-integral` admite `caso` con `todos`, `A`, `B`, `C` o `D`. El panel consulta salud e inventario sin cargar pesos. **Reiniciar** cancela la espera en el navegador, descarta respuestas anteriores y limpia los resultados. Una petición que ya está procesando en el servidor puede finalizar por su cuenta.

## Modelos, fusión y seguridad

Se conservaron los pesos y las métricas históricas. CMU obtuvo 36.8 % de exactitud y 0 % de cobertura. RAVDESS vocal obtuvo 42.5 % y 4.6 % de cobertura. UCI obtuvo 88.8 %, F1 macro de 0.873 y 92.5 % de cobertura. La fusión RAVDESS obtuvo 67.5 %, F1 macro de 0.659, 40 % de cobertura y ECE de 0.150. El caso público verificado ejecutó la fusión con solicitud explícita y devolvió abstención. La predicción académica usa G1/G2 y queda separada de expresiones y reglas. [Métricas y procedencia](INTEGRACION_FASE10.md#modelos-verificados)

El acceso a Haar se serializa para coordinar solicitudes concurrentes. Las rutas locales rechazan Host u origen cruzado y cabeceras de reenvío. El límite de 2 MiB se comprueba antes de añadir cada bloque al búfer. Los errores parciales omiten valores de entrada. Los nombres y rutas de pesos los configura el operador. Los medios del corpus se procesan en memoria. La demo usa identificadores ficticios y la asociación de identidad exige referencias de sesión.

## Instalación, prueba y exposición

Los lanzadores Windows inician Uvicorn en `127.0.0.1:8001` y verifican los cuatro casos por HTTP. Se mantuvo la configuración de despliegue existente. La validación de esta fase es local en Windows y CPU. La guía manual explica la instalación limpia y la configuración opcional de artefactos. [Prueba manual](PRUEBA_MANUAL_LOCAL.md), [guía de exposición](GUIA_EXPOSICION_FASE11.md)

La prueba Node acciona el controlador del panel con un DOM mínimo y consulta Uvicorn por HTTP. El intento de inspección interactiva de Chrome se detuvo porque la herramienta de control no pudo verificar la URL de la ventana. La guía incluye la comprobación manual en Chrome.

La instalación nueva en `_archivo/fase11/venv` usó Python 3.11.15. `uv pip check` verificó 33 paquetes. Pasaron 140 pruebas Python y 24 Node con `AULAPREDICT_E2E_FASE10=1`. La prueba optativa ejecutó inferencia real con los artefactos locales. El lanzador sirvió la página HTTP y el verificador confirmó los cuatro casos y la fusión.

## Resistencia HTTP local

| Perfil | Completadas | Arranque | p50 | p95 | RSS final | CPU previa |
|---|---:|---:|---:|---:|---:|---:|
| Pesos y fusión, una solicitud simultánea | 12/12 | 21.77 s | 393.6 ms | 528.9 ms | 268.5 MiB | 96.3 % |
| Pesos y fusión, dos solicitudes simultáneas | 12/12 | 2.93 s | 338.1 ms | 425.8 ms | 269.5 MiB | 62.6 % |
| Sin artefactos opcionales, una solicitud simultánea | 12/12 | 3.54 s | 9.3 ms | 18.8 ms | 84.7 MiB | 62.8 % |

Cada perfil inició un proceso de servidor. En las tres corridas hubo cero errores en las peticiones medidas, el caso con VIDEO inválido conservó el resultado AUDIO, el exceso de 2 MiB devolvió HTTP 413 y salud respondió después. Con artefactos se procesó una imagen pública de 791 555 bytes dentro del límite. La carga previa del equipo varió y las cifras corresponden a perfiles distintos. No permiten atribuir mejoras de latencia a la concurrencia ni compararlas directamente con Fase 10.

Para repetir la medición en CPU configura las variables de artefactos descritas en Fase 10 e instala `psutil` en el entorno de medición. Cada llamada inicia su propio servidor y ejecuta una prueba de recuperación después de la carga.

```powershell
& $py -B -m backend.entrenamiento_prediccion.medir_integracion_fase10 --fusion --repeticiones 12
& $py -B -m backend.entrenamiento_prediccion.medir_integracion_fase10 --fusion --repeticiones 12 --concurrencia 2
& $py -B -m backend.entrenamiento_prediccion.medir_integracion_fase10 --sin-modelos --repeticiones 12
```

Pendientes para la exposición y la integración externa. Completar la comprobación visual en Chrome, recibir muestras autorizadas de los productores, obtener FER2013 por el canal oficial y validar los modelos en el dominio objetivo antes de ampliar su uso.
