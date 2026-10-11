"""Entrada única: python -m uvicorn backend.app:app --port 8001."""
import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from backend.modulos.prediccion.api import router as motor_router

RAIZ = Path(__file__).resolve().parent.parent
app = FastAPI(title="AulaPredict · Predicción", version="3.1.0")
app.include_router(motor_router, prefix="/api")


@app.get("/api/modulos")
def modulos():
    salida = []
    for nombre in ("imagen", "video", "audio", "prediccion"):
        ruta = RAIZ / "backend" / "modulos" / nombre / "modulo.json"
        config = json.loads(ruta.read_text(encoding="utf-8"))
        config["carpeta"] = f"backend/modulos/{nombre}"
        config["archivos_presentes"] = [
            artefacto for artefacto in config["artefactos"]
            if (RAIZ / artefacto).is_file()
        ]
        salida.append(config)
    return {"modulos": salida}


app.mount("/", StaticFiles(directory=RAIZ / "frontend", html=True), name="prueba-local")
