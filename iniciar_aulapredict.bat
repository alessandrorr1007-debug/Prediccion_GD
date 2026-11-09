@echo off
setlocal
cd /d "%~dp0"
if not defined AULAPREDICT_PYTHON set "AULAPREDICT_PYTHON=%CD%\backend\.venv\Scripts\python.exe"
if not exist "%AULAPREDICT_PYTHON%" (
    echo Falta el entorno Python. Consulta docs\PRUEBA_MANUAL_LOCAL.md.
    exit /b 1
)
if not defined AULAPREDICT_MODELOS_FASE7 if exist "_archivo\fase7\modelos\academico.joblib" set "AULAPREDICT_MODELOS_FASE7=%CD%\_archivo\fase7\modelos"
if not defined AULAPREDICT_MODELOS_FASE8 if exist "_archivo\fase8\modelos" set "AULAPREDICT_MODELOS_FASE8=%CD%\_archivo\fase8\modelos"
if not defined AULAPREDICT_DEMO_IMAGEN if exist "_archivo\fase7\datos\astronaut.png" set "AULAPREDICT_DEMO_IMAGEN=%CD%\_archivo\fase7\datos\astronaut.png"
if not defined AULAPREDICT_DEMO_RAVDESS if exist "_archivo\fase7\datos\ravdess-speech.zip" set "AULAPREDICT_DEMO_RAVDESS=%CD%\_archivo\fase7\datos\ravdess-speech.zip"
if not defined AULAPREDICT_DEMO_TRACKING if exist "_archivo\fase9\ravdess-tracking.zip" set "AULAPREDICT_DEMO_TRACKING=%CD%\_archivo\fase9\ravdess-tracking.zip"
if not defined AULAPREDICT_FUSION_FASE10 if exist "_archivo\fase9\fusion.joblib" set "AULAPREDICT_FUSION_FASE10=%CD%\_archivo\fase9\fusion.joblib"
echo Abre en Chrome http://127.0.0.1:8001/
"%AULAPREDICT_PYTHON%" -B -m uvicorn backend.app:app --host 127.0.0.1 --port 8001
exit /b %ERRORLEVEL%
