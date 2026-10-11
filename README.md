# AulaPredict · Predicción

Servicio de integración del equipo de **PREDICCIÓN**. Recibe los resultados de IMAGEN, VIDEO y, cuando esté disponible, AUDIO; no entrena ni duplica los modelos de esos equipos.

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

## API

- `GET /api/salud`: estado del motor.
- `GET /api/modulos`: estado, repositorio y adaptadores de cada equipo.
- `POST /api/prediccion`: contrato interno de eventos ya normalizados.
- `POST /api/prediccion/integrar`: formatos entregados por IMAGEN y VIDEO.
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
```

El índice generado es heurístico y no calibrado: no representa una probabilidad de fraude ni debe producir sanciones automáticas.

## Verificación

```powershell
./backend/.venv/Scripts/python.exe -m pip install -r tests/requirements.txt
./backend/.venv/Scripts/python.exe -m unittest discover -s tests -v
```
