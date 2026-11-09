@echo off
setlocal
cd /d "%~dp0"
if not defined AULAPREDICT_PYTHON set "AULAPREDICT_PYTHON=%CD%\backend\.venv\Scripts\python.exe"
if not exist "%AULAPREDICT_PYTHON%" (
    echo Falta el entorno Python. Consulta docs\PRUEBA_MANUAL_LOCAL.md.
    exit /b 1
)
"%AULAPREDICT_PYTHON%" -B -m backend.modulos.prediccion.verificar_fase11 %*
exit /b %ERRORLEVEL%
