"""Audita el clasificador versionado sobre rasgos sintéticos independientes."""
import hashlib
import json

import numpy as np
from sklearn.metrics import classification_report, confusion_matrix, log_loss

from backend.modulos.prediccion.analisis_experimental import ETIQUETAS, seleccionar_expresion
from . import predictor
from .dataset_generator import generar_dataset_facial


def evaluar_particion(modelo, semilla):
    datos = generar_dataset_facial(n_samples=1400, random_state=semilla)
    etiquetas = datos["label_emocion"].to_numpy()
    puntajes = modelo.predict_proba(datos[list(predictor.RASGOS_FACIALES)].to_numpy())
    clases = modelo.classes_
    predicciones = clases[puntajes.argmax(axis=1)]
    confianza = puntajes.max(axis=1)
    aciertos = etiquetas == predicciones
    tramos = np.minimum((confianza * 10).astype(int), 9)
    ece = 0.0
    for tramo in range(10):
        en_tramo = tramos == tramo
        if en_tramo.any():
            ece += en_tramo.mean() * abs(confianza[en_tramo].mean() - aciertos[en_tramo].mean())
    elegibles = np.array([seleccionar_expresion(dict(zip(clases, fila, strict=True))) is not None
                          for fila in puntajes])
    return {
        "semilla": semilla, "muestras": len(etiquetas),
        "reporte": classification_report(etiquetas, predicciones, labels=clases, target_names=ETIQUETAS,
                                          output_dict=True, zero_division=0),
        "matriz_confusion": confusion_matrix(etiquetas, predicciones, labels=clases).tolist(),
        "log_loss": float(log_loss(etiquetas, puntajes, labels=clases)),
        "brier_multiclase": float(np.square(puntajes - (etiquetas[:, None] == clases)).sum(axis=1).mean()),
        "ece_10_tramos": float(ece),
        "cobertura_sin_abstencion": float(elegibles.mean()),
        "accuracy_sin_abstencion": float(aciertos[elegibles].mean()) if elegibles.any() else None,
    }


def main():
    modelo = predictor.obtener_modelo_facial()
    if modelo is None:
        raise SystemExit("El clasificador versionado no está disponible.")
    salida = {
        "datos": "rasgos sintéticos del mismo generador, sin imágenes reales",
        "semilla_entrenamiento_versionado": 42,
        "artefacto_sha256": hashlib.sha256(predictor.RUTA_MODELO_FACIAL.read_bytes()).hexdigest(),
        "orden_clases": ETIQUETAS,
        "validacion": evaluar_particion(modelo, 43),
        "prueba": evaluar_particion(modelo, 44),
    }
    print(json.dumps(salida, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
