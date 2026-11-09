"""Selecciona modelos y abstención con datos fuera de muestra y grupos disjuntos."""
import argparse
import json
from pathlib import Path

import cv2
import joblib
import numpy as np
import sklearn
from sklearn.base import clone
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.frozen import FrozenEstimator
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import FunctionTransformer, StandardScaler
from threadpoolctl import threadpool_limits

from . import entrenar_audio_fase8 as audio, entrenar_cmu_fase8 as cmu
from .entrenar_fase7 import SEMILLA, huella, resumir_predicciones
from .entrenar_fer import hog_lbp
from backend.modulos.prediccion.modelos_fase7 import MARGEN, PREPROCESADO_AUDIO_FASE8, UMBRAL, VERSION_FASE8

VERSION = "fase9-1.0"
UMBRALES = tuple(i / 100 for i in range(25, 91, 5))
MARGENES = (.05, .10, .15, .20, .25)
POLITICA_FASE8 = {"umbral": UMBRAL, "margen": MARGEN}


def calibrar(modelo, x, y, ajuste, calibracion):
    estimador = clone(modelo).fit(x[ajuste], y[ajuste])
    calibrado = CalibratedClassifierCV(FrozenEstimator(estimador), method="sigmoid", cv=2)
    return calibrado.fit(x[calibracion], y[calibracion])


def validacion_cruzada(modelo, x, y, clases, folds):
    probabilidades = np.empty((len(y), len(clases)))
    for i, validacion in enumerate(folds):
        j = (i + 1) % len(folds)
        ajuste = np.concatenate([fold for k, fold in enumerate(folds) if k not in (i, j)])
        calibrado = calibrar(modelo, x, y, ajuste, folds[j])
        if not np.array_equal(calibrado.classes_, clases):
            raise ValueError("Una partición perdió clases durante el ajuste.")
        probabilidades[validacion] = calibrado.predict_proba(x[validacion])
    return probabilidades


def medir_politica(p, aciertos, grupos, umbral, margen):
    orden = np.sort(p, axis=1)
    emitidas = (orden[:, -1] >= umbral) & (orden[:, -1] - orden[:, -2] >= margen)
    n = int(emitidas.sum())
    precision = float(aciertos[emitidas].mean()) if n else None
    grupos_emitidos = np.unique(grupos[emitidas])
    inferior = peor = None
    if n:
        z = 1.96
        inferior = (precision + z*z/(2*n) - z*np.sqrt((precision*(1-precision) + z*z/(4*n))/n)) / (1 + z*z/n)
        if len(grupos_emitidos) > 1:
            peor = min(float(aciertos[emitidas & (grupos != g)].mean()) for g in grupos_emitidos)
    return {"umbral": umbral, "margen": margen, "emitidas": n, "aciertos": int(aciertos[emitidas].sum()),
            "cobertura": n / len(p), "precision_selectiva": precision,
            "riesgo": 1 - precision if precision is not None else None,
            "grupos_cubiertos": len(grupos_emitidos), "wilson_inferior": inferior,
            "precision_min_sin_un_grupo": peor}


def elegir(resultados, referencia, minimo):
    base = resultados[referencia]
    base_politica = base["politica_fase8"]
    piso = .80
    if base_politica["emitidas"] >= minimo:
        piso = max(piso, base_politica["precision_selectiva"] - .03)
    elegibles = []
    for nombre, datos in resultados.items():
        if datos["f1_macro"] < base["f1_macro"] - .02:
            continue
        for punto in datos["curva"]:
            if (punto["emitidas"] >= minimo and punto["grupos_cubiertos"] >= 4
                    and punto["cobertura"] >= .10 and punto["cobertura"] > base_politica["cobertura"]
                    and punto["precision_selectiva"] >= piso and punto["wilson_inferior"] >= .65
                    and punto["precision_min_sin_un_grupo"] >= .72):
                elegibles.append((nombre, punto))
    return max(elegibles, key=lambda e: (e[1]["cobertura"], e[1]["precision_selectiva"],
                                          resultados[e[0]]["f1_macro"]), default=None)


def resumir(p, y, grupos, clases):
    pred = clases[p.argmax(axis=1)]
    orden = np.sort(p, axis=1)
    reporte = resumir_predicciones(clases, pred, y, p)
    reporte["f1_macro"] = reporte["reporte"]["macro avg"]["f1-score"]
    reporte["cuantiles_p10_p50_p90_max"] = {
        "probabilidad_maxima": np.percentile(orden[:, -1], [10, 50, 90, 100]).tolist(),
        "margen": np.percentile(orden[:, -1] - orden[:, -2], [10, 50, 90, 100]).tolist(),
    }
    reporte["politica_fase8"] = medir_politica(p, pred == y, grupos, **POLITICA_FASE8)
    return reporte


def preparar(tipo, ruta):
    if tipo == "facial":
        cv2.setNumThreads(1)
        x, y, grupos, _, descartes = cmu.importar(ruta)
        _, (tr, va, cal, historica) = cmu.particiones(grupos)
        candidatos = {nombre: (m, None) for nombre, m in cmu.candidatos().items()}
        candidatos["hog_lbp_logistica"] = (make_pipeline(FunctionTransformer(hog_lbp), StandardScaler(),
                                                         LogisticRegression(C=.1, max_iter=400)), None)
        return x, y, grupos, np.concatenate([tr, va]), cal, historica, candidatos, "hog_svm", cmu.CMU, descartes
    x, y, grupos, _, descartes = audio.cargar(ruta)
    tr = np.flatnonzero(grupos <= 16)
    cal = np.flatnonzero((grupos >= 17) & (grupos <= 20))
    historica = np.flatnonzero(grupos >= 21)
    candidatos = audio.candidatos()
    candidatos["extra_trees"] = (ExtraTreesClassifier(n_estimators=160, min_samples_leaf=2, max_features=.65,
                                                       n_jobs=1, random_state=SEMILLA), None)
    return x, y, grupos, tr, cal, historica, candidatos, "regresion_logistica", dict(audio.RAVDESS, nombre="RAVDESS"), descartes


def experimentar(tipo, ruta, ruta_referencia):
    x, y, grupos, tr, cal, historica, candidatos, referencia, dataset, descartes = preparar(tipo, ruta)
    desarrollo = np.sort(np.concatenate([tr, cal]))
    yd, gd = y[desarrollo], grupos[desarrollo]
    clases = np.unique(yd)
    folds = [va for _, va in GroupKFold(n_splits=4).split(x[desarrollo], yd, gd)]
    resultados = {}
    for nombre, (modelo, dimension) in candidatos.items():
        p = validacion_cruzada(modelo, x[desarrollo, :dimension], yd, clases, folds)
        datos = resumir(p, yd, gd, clases)
        aciertos = clases[p.argmax(axis=1)] == yd
        datos["curva"] = [medir_politica(p, aciertos, gd, u, m) for m in MARGENES for u in UMBRALES]
        resultados[nombre] = datos
    minimo = 15 if tipo == "facial" else 30
    elegido = elegir(resultados, referencia, minimo)
    informe = {"tipo": tipo, "version": VERSION, "dataset": dataset, "dataset_sha256": huella(ruta),
               "sklearn": sklearn.__version__, "semilla": SEMILLA, "descartes": descartes,
               "n_desarrollo": len(desarrollo), "grupos_por_fold": [len(np.unique(gd[f])) for f in folds],
               "referencia": referencia, "minimo_emitidas": minimo, "validacion": resultados,
               "promocion": elegido is not None, "seleccion": elegido[0] if elegido else referencia,
               "historica_expuesta": True}
    anterior = joblib.load(ruta_referencia)
    if (anterior["tipo"], anterior["version"], anterior["algoritmo"]) != (tipo, VERSION_FASE8, referencia):
        raise ValueError("El artefacto de referencia debe corresponder al modelo publicado de Fase 8.")
    p_anterior = anterior["modelo"].predict_proba(x[historica])
    informe["historica_fase8"] = resumir(p_anterior, y[historica], grupos[historica], clases)
    if elegido is None:
        return informe, None
    nombre, punto = elegido
    politica = {clave: punto[clave] for clave in ("umbral", "margen")}
    estimador, dimension = candidatos[nombre]
    modelo = calibrar(estimador, x[:, :dimension], y, tr, cal)
    p = modelo.predict_proba(x[historica, :dimension])
    informe["historica_candidato"] = resumir(p, y[historica], grupos[historica], clases)
    informe["historica_candidato"]["politica_elegida"] = medir_politica(
        p, clases[p.argmax(axis=1)] == y[historica], grupos[historica], **politica)
    informe["politica"] = politica
    artefacto = {clave: informe[clave] for clave in ("tipo", "version", "sklearn", "dataset", "politica")}
    artefacto.update(modelo=modelo, algoritmo=nombre)
    if tipo == "audio" and dimension is None:
        artefacto["preprocesado"] = PREPROCESADO_AUDIO_FASE8
    return informe, artefacto


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tipo", choices=("facial", "audio"))
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--referencia", type=Path, required=True)
    parser.add_argument("--salida", type=Path, required=True)
    args = parser.parse_args()
    with threadpool_limits(limits=1):
        informe, artefacto = experimentar(args.tipo, args.dataset, args.referencia)
    args.salida.mkdir(parents=True, exist_ok=True)
    if artefacto is not None:
        joblib.dump(artefacto, args.salida / f"{args.tipo}.joblib", compress=3)
    (args.salida / f"{args.tipo}.metricas.json").write_text(json.dumps(informe, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
