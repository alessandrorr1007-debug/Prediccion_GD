"""Entrenamiento local de modelos de investigación. No descarga ni publica datos."""
import argparse
from collections import Counter
import hashlib
from io import BytesIO
import json
from pathlib import Path
import re
from zipfile import ZipFile

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.calibration import CalibratedClassifierCV
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.frozen import FrozenEstimator
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix, f1_score, log_loss, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from threadpoolctl import threadpool_limits

from .rasgos_fase7 import EntradaInvalida, SenalInsuficiente, rasgos_audio
from backend.modulos.prediccion.modelos_fase7 import MARGEN, UMBRAL, VERSION

SEMILLA = 42
ACADEMICO = ("G1", "G2")
VOCALES = ("neutral", "calma", "alegria", "tristeza", "enojo", "miedo", "asco", "sorpresa")
RAVDESS_MD5 = "bc696df654c87fed845eb13823edef8a"
RAVDESS = {"fuente": "https://zenodo.org/records/1188976", "licencia": "CC BY-NC-SA 4.0",
           "version": "1.0.0", "dominio": "habla actuada en ingles norteamericano"}
UCI = {"fuente": "https://doi.org/10.24432/C5TG7T", "licencia": "CC BY 4.0",
       "dominio": "matematicas, secundaria portuguesa; corte posterior al segundo periodo"}


def huella(ruta, algoritmo="sha256"):
    with ruta.open("rb") as archivo:
        return hashlib.file_digest(archivo, algoritmo).hexdigest()


def evaluar(modelo, x, y):
    clases = modelo.classes_
    p = modelo.predict_proba(x) if hasattr(modelo, "predict_proba") else None
    pred = modelo.predict(x) if p is None else clases[p.argmax(axis=1)]
    return resumir_predicciones(clases, pred, y, p)


def resumir_predicciones(clases, pred, y, p):
    reporte = {
        "n": len(y), "clases": clases.tolist(),
        "reporte": classification_report(y, pred, labels=clases, output_dict=True, zero_division=0),
        "matriz_confusion": confusion_matrix(y, pred, labels=clases).tolist(),
    }
    if p is None:
        return reporte
    maximos = p.max(axis=1)
    tramo = np.minimum((maximos * 10).astype(int), 9)
    aciertos = pred == y
    ece = sum(float((tramo == i).mean() * abs(maximos[tramo == i].mean() - aciertos[tramo == i].mean()))
              for i in range(10) if (tramo == i).any())
    orden = np.sort(p, axis=1)
    cubiertos = (maximos >= UMBRAL) & (orden[:, -1] - orden[:, -2] >= MARGEN)
    return {
        **reporte,
        "log_loss": float(log_loss(y, p, labels=clases)),
        "brier_multiclase": float(((p - (y[:, None] == clases)) ** 2).sum(axis=1).mean()),
        "ece_10_tramos": ece,
        "roc_auc": float(roc_auc_score(y, p[:, 1])) if len(clases) == 2 else None,
        "cobertura": float(cubiertos.mean()),
        "exactitud_selectiva": float(aciertos[cubiertos].mean()) if cubiertos.any() else None,
    }


def ajustar(x, y, indices, candidatos):
    entrenamiento, validacion, calibracion, prueba = indices
    if any(set(y[particion]) != set(y) for particion in indices):
        raise ValueError("Cada partición debe contener todas las clases.")
    scores = {}
    for nombre, modelo in candidatos.items():
        modelo.fit(x[entrenamiento], y[entrenamiento])
        scores[nombre] = float(f1_score(y[validacion], modelo.predict(x[validacion]), average="macro", zero_division=0))
    elegido = max((nombre for nombre in scores if nombre != "mayoria"), key=scores.get)
    crudo = candidatos[elegido]
    calibrado = CalibratedClassifierCV(FrozenEstimator(crudo), method="sigmoid")
    calibrado.fit(x[calibracion], y[calibracion])
    return calibrado, {
        "seleccion": elegido, "f1_macro_validacion": scores,
        "prueba_candidatos_sin_calibrar": {nombre: evaluar(m, x[prueba], y[prueba]) for nombre, m in candidatos.items()},
        "prueba_modelo_calibrado": evaluar(calibrado, x[prueba], y[prueba]),
    }


def candidatos_tabulares(profundidad):
    return {
        "mayoria": DummyClassifier(strategy="most_frequent"),
        "regresion_logistica": make_pipeline(StandardScaler(), LogisticRegression(max_iter=500, random_state=SEMILLA)),
        "random_forest": RandomForestClassifier(n_estimators=200, max_depth=profundidad, min_samples_leaf=3,
                                                random_state=SEMILLA, n_jobs=1),
    }


def entrenar_academico(ruta):
    with ZipFile(ruta) as contenedor:
        with ZipFile(BytesIO(contenedor.read("student.zip"))) as datos:
            with datos.open("student-mat.csv") as archivo:
                tabla = pd.read_csv(archivo, sep=";")
    # Solo un curso. Descartar faltantes en lugar de imputar calificaciones para el endpoint.
    valores = tabla[[*ACADEMICO, "G3"]].apply(pd.to_numeric, errors="coerce")
    validas = valores.notna().all(axis=1) & valores.ge(0).all(axis=1) & valores.le(20).all(axis=1)
    validas &= valores.mod(1).eq(0).all(axis=1)
    datos = valores.loc[validas & ~tabla.duplicated()]
    x = datos[list(ACADEMICO)].to_numpy()
    y = np.where(datos["G3"].to_numpy() < 10, "no_aprueba", "aprueba")
    tr, resto = train_test_split(np.arange(len(y)), test_size=.5, stratify=y, random_state=SEMILLA)
    medio, prueba = train_test_split(resto, test_size=.4, stratify=y[resto], random_state=SEMILLA)
    va, cal = train_test_split(medio, test_size=.5, stratify=y[medio], random_state=SEMILLA)
    indices = (tr, va, cal, prueba)
    modelo, reporte = ajustar(x, y, indices, candidatos_tabulares(6))
    return modelo, dict(reporte, dataset=UCI, entradas=list(ACADEMICO), desenlace="G3 < 10/20",
                        descartados=len(tabla) - len(datos), particiones=list(map(len, indices)))


def clips_ravdess(ruta, descartes, *, con_id=False):
    if huella(ruta, "md5") != RAVDESS_MD5:
        raise ValueError("El ZIP no coincide con el archivo de habla RAVDESS publicado en Zenodo.")
    vistos = set()
    with ZipFile(ruta) as archivo:
        for miembro in sorted(archivo.infolist(), key=lambda m: m.filename):
            nombre = Path(miembro.filename).name
            partes = re.fullmatch(r"03-01-(0[1-8])-0[12]-0[12]-0[12]-(0[1-9]|1[0-9]|2[0-4])\.wav", nombre)
            if not partes:
                continue
            contenido = archivo.read(miembro)
            h = hashlib.sha256(contenido).digest()
            if h in vistos:
                descartes["duplicado_exacto"] += 1
                continue
            vistos.add(h)
            clase, actor = map(int, partes.groups())
            clip = (contenido, VOCALES[clase - 1], actor)
            yield (*clip, nombre[3:-4]) if con_id else clip


def entrenar_audio(ruta):
    x, y, actores = [], [], []
    descartes = Counter()
    for contenido, clase, actor in clips_ravdess(ruta, descartes):
        try:
            rasgos, _ = rasgos_audio(contenido)
        except (EntradaInvalida, SenalInsuficiente) as error:
            descartes[type(error).__name__] += 1
            continue
        x.append(rasgos)
        y.append(clase)
        actores.append(actor)
    grupos = np.asarray(actores)
    # Cuatro actores por partición fuera de entrenamiento, con ambos sexos representados.
    rangos = ((1, 12), (13, 16), (17, 20), (21, 24))
    indices = [np.flatnonzero((grupos >= a) & (grupos <= b)) for a, b in rangos]
    modelo, reporte = ajustar(np.asarray(x), np.asarray(y), indices, candidatos_tabulares(14))
    return modelo, dict(reporte, dataset=RAVDESS, entradas="MFCC, deltas, RMS, centroide, actividad",
                        actores_por_particion=[list(range(a, b + 1)) for a, b in rangos],
                        particiones=list(map(len, indices)), descartados=dict(descartes))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tipo", choices=("academico", "audio", "facial"))
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--salida", type=Path, required=True)
    parser.add_argument("--fer-plus", type=Path)
    parser.add_argument("--cnn", action="store_true")
    args = parser.parse_args()
    with threadpool_limits(limits=1):
        if args.tipo == "facial":
            from .entrenar_fer import entrenar
            modelo, reporte = entrenar(args.dataset, args.fer_plus, args.cnn)
        elif args.fer_plus or args.cnn:
            parser.error("--fer-plus y --cnn solo corresponden a facial")
        else:
            modelo, reporte = (entrenar_audio if args.tipo == "audio" else entrenar_academico)(args.dataset)
    reporte.update(tipo=args.tipo, version=VERSION, semilla=SEMILLA, sklearn=sklearn.__version__,
                   dataset_sha256=huella(args.dataset), umbral=UMBRAL, margen=MARGEN)
    args.salida.mkdir(parents=True, exist_ok=True)
    joblib.dump({"modelo": modelo, "tipo": args.tipo, "version": reporte["version"], "sklearn": reporte["sklearn"],
                 "dataset": reporte["dataset"], "algoritmo": reporte["seleccion"]},
                args.salida / f"{args.tipo}.joblib", compress=3)
    ruta = args.salida / f"{args.tipo}.metricas.json"
    ruta.write_text(json.dumps(reporte, indent=2, ensure_ascii=True), encoding="utf-8")
    print(f"Modelo y evaluación guardados en {ruta}")


if __name__ == "__main__":
    main()
