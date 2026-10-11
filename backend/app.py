"""Entrada única: python -m uvicorn backend.app:app --port 8001."""
import json
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.modulos.prediccion.api import router as motor_router

RAIZ = Path(__file__).resolve().parent.parent
app = FastAPI(title="AulaPredict · Predicción", version="3.1.0")
origenes_frontend = os.getenv(
    "FRONTEND_ORIGINS",
    "http://localhost:8001,http://127.0.0.1:8001,https://prediccion-frontend.onrender.com",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origen.strip() for origen in origenes_frontend if origen.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
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
