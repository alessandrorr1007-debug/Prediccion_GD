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
