"""Carga local opcional de pesos YOLO para los servicios de predicción."""
import logging
import os
from pathlib import Path
from threading import Lock

logger = logging.getLogger(__name__)
BACKEND = Path(__file__).resolve().parent.parent


class ModeloYolo:
    def __init__(self, nombre: str):
        self.nombre = nombre
        self.modelo = None
        self.carga = "pendiente"
        self._lock = Lock()

    def ruta(self):
        configurada = os.getenv("AULAPREDICT_YOLO_DIR")
        if configurada:
            ruta = Path(configurada) / self.nombre
            return ruta if ruta.is_file() else None
        carpetas = (BACKEND / "modelo_ia", BACKEND / "entrenamiento_prediccion",
                    BACKEND / "entrenamiento_prediccion" / "modelo_ia", BACKEND.parent / "modelo_ia")
        return next((c / self.nombre for c in carpetas if (c / self.nombre).is_file()), None)

    def cargar(self):
        with self._lock:
            if self.carga != "pendiente":
                return self.modelo
            ruta = self.ruta()
            if ruta is None:
                self.carga = "sin_pesos"
                return None
            try:
                from ultralytics import YOLO

                self.modelo = YOLO(str(ruta))
                self.carga = "cargado"
            except Exception as error:
                self.carga = "error"
                logger.warning("Carga YOLO fallida (%s): %s", self.nombre, type(error).__name__)
            return self.modelo

    def diagnostico(self, inferencia="no_ejecutada"):
        presentes = self.ruta() is not None
        if inferencia == "error":
            estado = "error_inferencia"
        elif self.carga == "cargado":
            estado = "modelo_disponible"
        elif self.carga == "pendiente" and presentes:
            estado = "carga_pendiente"
        else:
            estado = "modelo_no_disponible"
        return {
            "estado": estado, "pesos_presentes": presentes,
            "carga": "sin_pesos" if self.carga == "pendiente" and not presentes else self.carga,
            "inferencia": inferencia,
        }


YOLO_BEST = ModeloYolo("best.pt")
YOLO_POSE = ModeloYolo("yolo11n-pose.pt")
