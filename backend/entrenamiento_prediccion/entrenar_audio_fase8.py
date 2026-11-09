"""Comparación acústica reproducible con validación cruzada por actor."""
import argparse
from collections import Counter
import json
from pathlib import Path

import joblib
import numpy as np
import sklearn
from sklearn.base import clone
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.frozen import FrozenEstimator
from sklearn.metrics import f1_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from threadpoolctl import threadpool_limits

from .entrenar_fase7 import RAVDESS, SEMILLA, candidatos_tabulares, clips_ravdess, evaluar, huella
from .rasgos_fase7 import DIM_AUDIO_FASE7, EntradaInvalida, SenalInsuficiente, rasgos_audio
from backend.modulos.prediccion.modelos_fase7 import MARGEN, PREPROCESADO_AUDIO_FASE8, UMBRAL, VERSION_FASE8

REFERENCIA = "rf_fase7"


def cargar(ruta):
    x, y, actores, duraciones = [], [], [], []
    descartes = Counter()
    for contenido, etiqueta, actor in clips_ravdess(ruta, descartes):
        try:
            rasgos, calidad = rasgos_audio(contenido, ampliado=True)
        except (EntradaInvalida, SenalInsuficiente) as error:
            descartes[type(error).__name__] += 1
            continue
        x.append(rasgos)
        y.append(etiqueta)
        actores.append(actor)
        duraciones.append(calidad["duracion_segundos"])
    return np.asarray(x), np.asarray(y), np.asarray(actores), duraciones, dict(descartes)


def candidatos():
    tabulares = candidatos_tabulares(14)
    return {
        REFERENCIA: (tabulares["random_forest"], DIM_AUDIO_FASE7),
        "regresion_logistica": (tabulares["regresion_logistica"], None),
        "rf_optimizado": (RandomForestClassifier(n_estimators=250, min_samples_leaf=2, max_features=.5,
                                                  n_jobs=1, random_state=SEMILLA), None),
        "svm_rbf": (make_pipeline(StandardScaler(), SVC(C=5, class_weight="balanced")), None),
        "hist_gradient_boosting": (HistGradientBoostingClassifier(max_iter=65, max_leaf_nodes=15,
                                                                   random_state=SEMILLA), None),
    }


def entrenar(ruta):
    x, y, actores, duraciones, descartes = cargar(ruta)
    desarrollo = np.flatnonzero(actores <= 16)
    calibracion = np.flatnonzero((actores >= 17) & (actores <= 20))
    prueba = np.flatnonzero(actores >= 21)
    grupos = actores[desarrollo]
    if len(np.unique(grupos)) != 16:
        raise ValueError("Faltan actores de desarrollo en RAVDESS.")
    particiones = GroupKFold(n_splits=4).split(x[desarrollo], y[desarrollo], grupos)
    folds = [(desarrollo[tr], desarrollo[va]) for tr, va in particiones]
    modelos = candidatos()
    puntuaciones = {}
    for nombre, (modelo, dimension) in modelos.items():
        vector = x[:, :dimension]
        puntuaciones[nombre] = [float(f1_score(y[va], clone(modelo).fit(vector[tr], y[tr]).predict(vector[va]),
                                                average="macro", zero_division=0)) for tr, va in folds]
    medias = {nombre: float(np.mean(valores)) for nombre, valores in puntuaciones.items()}
    alternativa = max((nombre for nombre in modelos if nombre != REFERENCIA), key=medias.get)
    promocion = medias[alternativa] > medias[REFERENCIA]
    evaluaciones = {}
    calibrados = {}
    for nombre in (REFERENCIA, alternativa):
        modelo, dimension = modelos[nombre]
        vector = x[:, :dimension]
        modelo.fit(vector[desarrollo], y[desarrollo])
        calibrado = CalibratedClassifierCV(FrozenEstimator(modelo), method="sigmoid")
        calibrado.fit(vector[calibracion], y[calibracion])
        calibrados[nombre] = calibrado
        actores_prueba = {str(a): evaluar(calibrado, vector[actores == a], y[actores == a])
                          for a in sorted(set(actores[prueba]))}
        evaluaciones[nombre] = {
            "prueba_calibrada": evaluar(calibrado, vector[prueba], y[prueba]),
            "actores_prueba": {a: {"n": m["n"], "exactitud": m["reporte"]["accuracy"],
                                    "f1_macro": m["reporte"]["macro avg"]["f1-score"], "cobertura": m["cobertura"]}
                               for a, m in actores_prueba.items()},
        }
    reporte = {"tipo": "audio", "version": VERSION_FASE8, "dataset": dict(RAVDESS, nombre="RAVDESS"),
               "dataset_sha256": huella(ruta),
               "sklearn": sklearn.__version__, "semilla": SEMILLA, "umbral": UMBRAL, "margen": MARGEN,
               "particiones": [len(desarrollo), len(calibracion), len(prueba)], "descartados": descartes,
               "actores_validacion": [np.unique(actores[va]).tolist() for _, va in folds],
               "actores_calibracion": np.unique(actores[calibracion]).tolist(),
               "actores_prueba": np.unique(actores[prueba]).tolist(),
               "categorias": dict(sorted(Counter(y).items())),
               "duracion_p05_p50_p95": np.percentile(duraciones, [5, 50, 95]).tolist(),
               "f1_macro_por_fold": puntuaciones, "f1_macro_validacion": medias,
               "seleccion": alternativa if promocion else REFERENCIA, "alternativa": alternativa,
               "promocion": promocion, "evaluacion": evaluaciones}
    return calibrados[alternativa] if promocion else None, reporte


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--salida", required=True, type=Path)
    args = parser.parse_args()
    with threadpool_limits(limits=1):
        modelo, reporte = entrenar(args.dataset)
    args.salida.mkdir(parents=True, exist_ok=True)
    if modelo is not None:
        metadatos = {clave: reporte[clave] for clave in ("tipo", "version", "sklearn", "dataset")}
        joblib.dump(dict(metadatos, modelo=modelo, algoritmo=reporte["seleccion"], preprocesado=PREPROCESADO_AUDIO_FASE8),
                    args.salida / "audio.joblib", compress=3)
    (args.salida / "audio.metricas.json").write_text(json.dumps(reporte, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
