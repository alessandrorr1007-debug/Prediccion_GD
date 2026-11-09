"""
Entrenamiento sintético e inferencia experimental de AulaPredict.
===========================================================================

Este paquete contiene los modelos entrenados y los algoritmos de inferencia
multimodal para la predicción de rendimiento, emociones y sucesos académicos.

Exportaciones Principales:
- procesar_captura_imagen(imagen_b64, contexto_externo=None)
    Detecta candidatos sin verificar su identidad y estima expresiones y
    sucesos cuando los modelos de demostración están disponibles.
- predecir_estudiante_multimodal(estudiante_id, rasgos, bbox_rel, acciones_contexto=None)
    Ejecuta la estimación experimental a partir de rasgos y acciones.
- obtener_metricas_modelo()
    Devuelve las métricas del experimento con datos sintéticos.
- obtener_escenario_aula_ejemplo()
    Devuelve un aula de demostración con cinco perfiles ficticios.
"""

from .predictor import (
    procesar_captura_imagen,
    predecir_estudiante_multimodal,
    obtener_metricas_modelo,
    obtener_escenario_aula_ejemplo,
)

__all__ = [
    "procesar_captura_imagen",
    "predecir_estudiante_multimodal",
    "obtener_metricas_modelo",
    "obtener_escenario_aula_ejemplo",
]
