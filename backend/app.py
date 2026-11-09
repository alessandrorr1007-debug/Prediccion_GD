import json
import logging
import os
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
if str(RAIZ) not in sys.path:
    sys.path.insert(0, str(RAIZ))

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from backend.entrenamiento_prediccion.imagenes import ImagenInvalida
from backend.entrenamiento_prediccion.modelos_yolo import YOLO_BEST
from backend.entrenamiento_prediccion.predictor import obtener_escenario_aula_ejemplo, procesar_captura_imagen
from backend.modulos.prediccion.api import router as motor_router
from backend.modulos.prediccion.captura_entrada import EntradaCaptura, EntradaVision, leer_captura
from backend.modulos.prediccion.seguimiento_api import router as seguimiento_router
from backend.modulos.vision_service import procesar_frame

logger = logging.getLogger(__name__)
app = FastAPI(title="AulaPredict · Predicción", version="3.1.0")
origenes_frontend = os.getenv(
    "FRONTEND_ORIGINS",
    "http://localhost:8001,http://127.0.0.1:8001,https://prediccion-frontend.onrender.com",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origen.strip() for origen in origenes_frontend if origen.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
app.include_router(motor_router, prefix="/api")
app.include_router(seguimiento_router, prefix="/api")


@app.get("/api/modulos")
def modulos():
    salida = []
    for nombre in ("imagen", "video", "audio", "prediccion"):
        ruta = RAIZ / "backend" / "modulos" / nombre / "modulo.json"
        config = json.loads(ruta.read_text(encoding="utf-8"))
        if nombre == "audio" and config["estado"] == "pendiente_repositorio_y_contrato":
            config["estado_integracion"] = "integracion_pendiente"
        config["carpeta"] = f"backend/modulos/{nombre}"
        config["archivos_presentes"] = [
            artefacto for artefacto in config["artefactos"]
            if (RAIZ / artefacto).is_file()
        ]
        salida.append(config)
    return {"modulos": salida}


async def _analizar_imagen(funcion, *argumentos):
    try:
        return await run_in_threadpool(funcion, *argumentos)
    except ImagenInvalida as error:
        raise HTTPException(422, str(error)) from None
    except Exception as error:
        logger.error("Análisis de predicción fallido (%s): %s",
                     getattr(funcion, "__name__", type(funcion).__name__), type(error).__name__)
        return JSONResponse(status_code=500, content={
            "estado": "error_inferencia",
            "detail": "No se pudo completar el análisis de predicción.",
        })


@app.get("/api/vision/estado")
def vision_estado():
    modelo = YOLO_BEST.diagnostico()
    return {
        "estado": "listo",
        "modelo_yolo_disponible": modelo["carga"] == "cargado",
        "ruta_modelo_yolo": YOLO_BEST.nombre if modelo["pesos_presentes"] else None,
        "modelo_yolo": modelo,
        "mejora_imagen": "CLAHE + Unsharp + Contraste activo",
        "seguimiento_facial": "HaarCascade + Geometría + Landmarks",
        "emociones": ["alegria", "neutral", "tristeza", "estres", "fatiga"],
        "prediccion_academica": "Escala 0-20 explicable"
    }


@app.post("/api/vision/analizar")
async def vision_analizar(request: Request):
    entrada = await leer_captura(request, EntradaVision)
    return await _analizar_imagen(
        procesar_frame, entrada.imagen_b64, entrada.modo, entrada.aplicar_mejora, entrada.segundos_distraccion
    )


@app.post("/api/prediccion/analizar-captura")
async def prediccion_analizar_captura(request: Request):
    """Analiza una imagen con identidad desconocida y contexto de acciones opcional."""
    entrada = await leer_captura(request, EntradaCaptura)
    contexto = entrada.contexto_externo
    return await _analizar_imagen(
        procesar_captura_imagen, entrada.imagen_b64, contexto.model_dump(exclude_unset=True) if contexto else None
    )


@app.get("/api/prediccion/ejemplo-aula")
async def prediccion_ejemplo_aula():
    """Retorna cinco perfiles sintéticos, sin usar la cámara."""
    return await _analizar_imagen(obtener_escenario_aula_ejemplo)


@app.get("/api/prediccion/modelo/metricas")
def prediccion_metricas():
    """
    Retorna las métricas del pipeline de entrenamiento del Módulo de Predicción.
    """
    ruta_json = RAIZ / "backend" / "entrenamiento_prediccion" / "metricas_entrenamiento.json"
    if ruta_json.is_file():
        return json.loads(ruta_json.read_text(encoding="utf-8"))
    return {"estado": "en_entrenamiento", "mensaje": "Ejecutar entrenar_prediccion.py"}


app.mount("/", StaticFiles(directory=RAIZ / "frontend", html=True), name="prueba-local")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app:app", host="127.0.0.1", port=8001, reload=False)
