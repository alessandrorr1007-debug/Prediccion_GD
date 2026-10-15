$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$pythonPrediccion = Join-Path $PSScriptRoot 'backend\.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPrediccion)) {
    throw 'Crea el entorno con py -3.11 -m venv backend/.venv e instala requirements.txt.'
}
Write-Host 'Abre http://localhost:8001 para integrar resultados JSON de los equipos. Ctrl+C para detener.'
& $pythonPrediccion -m uvicorn backend.app:app --host 127.0.0.1 --port 8001
