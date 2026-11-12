# Probar AulaPredict en Windows y Chrome

## Iniciar

En PowerShell, desde el repositorio:

```powershell
Set-Location 'D:\Proyectos\PREDICCION'
.\iniciar_aulapredict.bat
```

Mantén esa ventana abierta. Cuando Uvicorn indique que escucha en el puerto 8001, abre Chrome y entra en [AulaPredict local](http://127.0.0.1:8001/). En una segunda ventana de PowerShell ejecuta:

```powershell
Set-Location 'D:\Proyectos\PREDICCION'
.\verificar_aulapredict.bat
.\verificar_aulapredict.bat --fusion
```

El verificador consulta el servidor por HTTP, muestra el inventario y ejecuta los cuatro casos. Con `--fusion` devuelve código 2 si la pareja o los pesos opcionales impiden ejecutarla. El código 1 indica que la verificación no pudo completarse. Para detener el servidor, pulsa `Ctrl+C` en su terminal. Si 8001 está ocupado, revisa qué servicio lo usa antes de volver a iniciar.

## Probar la cámara y una fotografía

1. En Chrome, abre [AulaPredict local](http://127.0.0.1:8001/). En **Captura de Imagen para Predicción**, deja seleccionado **Facial experimental** y pulsa **Encender cámara**.
2. Cuando Chrome pregunte, pulsa **Permitir**. Si el sitio está bloqueado, abre el icono de controles a la izquierda de la dirección, entra en **Configuración del sitio**, permite **Cámara** y recarga. En Windows, revisa **Configuración > Privacidad y seguridad > Cámara** si el navegador sigue sin tener acceso. Cierra otras aplicaciones que estén usando el dispositivo.
3. Comprueba que el visor muestre video en vivo y **Cámara lista**. Para la prueba manual, deja desmarcada **Captura automática**. Encuadra un rostro frontal y pulsa **Capturar fotograma**. La imagen queda visible mientras se analiza.
4. Lee el resultado debajo de los controles. **Rostro detectado · Abstención del modelo facial** muestra que se encontró un rostro y que las probabilidades no alcanzaron el criterio de clasificación. El visor distingue entre ausencia de detección, rostro pequeño, varios rostros y error técnico. **Modelo facial no disponible** indica que faltan pesos utilizables. La expresión estimada se muestra con identidad desconocida y sin calcular riesgo académico a partir de la foto.
5. Pulsa **Nueva Captura** para volver al visor. Pulsa **Detener cámara** para liberar el dispositivo. Si falla el visor, puedes volver a encender la cámara o usar la carga de fotografía.
6. Con la cámara detenida, pulsa **Subir Foto** y elige un archivo JPEG, PNG o WebP de hasta 5 MiB. Si tienes instaladas las muestras locales, puedes usar `_archivo/fase7/datos/astronaut.png`. Confirma que se muestra la vista previa y que **Fotografía seleccionada · Analizando…** cambia al estado final.
7. Si hay error de red, revisa que Uvicorn siga abierto. Si la imagen es inválida, vuelve a exportarla en un formato admitido. Selecciona de nuevo el archivo con **Subir Foto** para reintentar desde la misma página.

La captura manual y la foto en modo **Facial experimental** usan `POST /api/prediccion/analisis-experimental`. La vista previa de cámara no envía imágenes por sí sola. Si eliges **Captura de aula histórica**, se usa `POST /api/prediccion/analizar-captura`, que puede tardar más de 30 segundos al inicializar los modelos de aula por primera vez.

En la prueba HTTP local con `astronaut.png`, la ruta histórica tardó 43,75 s en la primera llamada y 608 ms en la segunda. Después de reiniciar Uvicorn, la ruta facial tardó 20,73 s en la primera llamada durante la ejecución concurrente de las suites y 274 ms en la segunda. La cabecera `Server-Timing` separa lectura y validación de la evaluación en el servidor.

La verificación automatizada cubre permisos simulados, reproducción, envío, detención, errores y reintento. También se verificó la respuesta facial con una foto pública a través de Uvicorn y la presencia de los controles en Chrome. El acceso a la cámara física, su vista previa y el recorrido de carga con el selector de archivos requieren la prueba manual anterior.

Para diagnosticar una captura, abre **DevTools > Red**, selecciona `analisis-experimental` y revisa `fuentes.imagen` en la respuesta. `deteccion_facial` describe el resultado del detector. `rostros` contiene cajas en píxeles de la imagen orientada, medidas desde la esquina superior izquierda. El detector Haar busca desde 30 × 30 píxeles en la imagen de detección, limitada a 1600 píxeles en su lado mayor. El clasificador requiere un solo recorte de al menos 64 × 64 en la imagen decodificada. La detección puede fallar con perfiles, oclusiones o caras pequeñas. `tiempos_ms` y la cabecera `Server-Timing` muestran las etapas ejecutadas.

## Probar el panel

1. Expande **Demostración integral con cuatro estudiantes ficticios** y pulsa **Verificar sistema**.
2. Selecciona **Los cuatro casos** y pulsa **Ejecutar demostración local**. A presenta notas y asistencia. B muestra notas faltantes y participación cero. C presenta las muestras públicas si están instaladas. D explica la exclusión por sesión distinta.
3. Selecciona **D · Conflicto de sesión** y vuelve a ejecutar. Debe aparecer solo D. Pulsa **Reiniciar** para limpiar los resultados y volver a la selección de los cuatro casos.
4. Con los artefactos configurados, marca **Ejecutar fusión experimental con la pareja pública RAVDESS**. El panel muestra compatibilidad, ejecución y abstención. Las observaciones públicas aparecen sin atribución personal.

## Preparar otra computadora

En una copia limpia del repositorio, con Windows, `uv` y Chrome:

```powershell
uv venv --python 3.11.15 backend/.venv
uv pip install --python ./backend/.venv/Scripts/python.exe -r requirements.txt -r tests/requirements.txt
uv pip check --python ./backend/.venv/Scripts/python.exe
.\iniciar_aulapredict.bat
```

Si tu Python está en otro entorno, puedes indicar su ejecutable con `AULAPREDICT_PYTHON` antes de iniciar. El lanzador detecta los archivos presentes en las rutas convencionales de `_archivo`, respetando las variables ya configuradas. Para reproducir los pesos y las muestras públicas, sigue las rutas y comandos de las Fases 7–10. El modo con fixtures funciona aunque esos archivos falten. [Preparación de artefactos](INTEGRACION_FASE10.md#instalación-local)

Si el inventario muestra **archivo presente** pero el análisis devuelve **modelo no disponible**, comprueba la versión exacta de scikit-learn, la ruta configurada y la procedencia del Joblib. Usa pesos de origen confiable. Para validar un JSON de un compañero, usa el comando de diagnóstico antes de enviarlo a la API. [Comandos y contratos](INTEGRACION_FASE11.md)
