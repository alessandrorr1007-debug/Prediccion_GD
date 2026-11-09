"""Importación local de FER2013 y anotaciones FER+ autorizadas."""
from collections import Counter
import hashlib

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import FunctionTransformer, StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.dummy import DummyClassifier

from .rasgos_fase7 import rasgos_fer

FER = ("enojo", "asco", "miedo", "alegria", "tristeza", "sorpresa", "neutral")
VOTOS = ("neutral", "happiness", "surprise", "sadness", "anger", "disgust", "fear", "contempt", "unknown", "nf")
ETIQUETAS_PLUS = ("neutral", "alegria", "sorpresa", "tristeza", "enojo", "asco", "miedo")
PARTICIONES = {"Training": 0, "PublicTest": 1, "PrivateTest": 2}


def importar(ruta, ruta_plus):
    datos = pd.read_csv(ruta)
    if not {"Usage", "emotion", "pixels"} <= set(datos.columns) or not 1 <= len(datos) <= 40000:
        raise ValueError("Se requiere el CSV original FER2013 con Usage, emotion y pixels.")
    if not set(datos.Usage) <= PARTICIONES.keys():
        raise ValueError("FER2013 contiene particiones no reconocidas.")
    votos = None
    if ruta_plus:
        plus = pd.read_csv(ruta_plus)
        plus.columns = plus.columns.str.strip().str.lower()
        if (not {"usage", *VOTOS} <= set(plus.columns) or len(plus) != len(datos)
                or plus.usage.tolist() != datos.Usage.tolist()):
            raise ValueError("FER+ debe tener el mismo número y orden de filas y particiones que FER2013.")
        votos = plus[list(VOTOS)].apply(pd.to_numeric, errors="raise").to_numpy()
        if not (np.isfinite(votos).all() and (votos >= 0).all() and np.equal(votos, np.floor(votos)).all()):
            raise ValueError("FER+ contiene votos inválidos.")

    unicos, conflictos, descartes = {}, set(), Counter()
    for i, fila in enumerate(datos[["Usage", "emotion", "pixels"]].itertuples(index=False, name=None)):
        uso, clase, pixeles = fila
        try:
            if int(clase) != float(clase) or not 0 <= int(clase) < 7:
                raise ValueError()
            valores = list(map(int, pixeles.split()))
            if len(valores) != 2304 or min(valores) < 0 or max(valores) > 255:
                raise ValueError()
        except (ValueError, TypeError, AttributeError, OverflowError):
            descartes["fila_invalida"] += 1
            continue
        etiqueta = FER[int(clase)]
        if votos is not None:
            distribucion = votos[i]
            ganador = int(distribucion.argmax())
            if ganador >= len(ETIQUETAS_PLUS) or distribucion[ganador] <= distribucion.sum() / 2:
                descartes["sin_mayoria_ferplus"] += 1
                continue
            etiqueta = ETIQUETAS_PLUS[ganador]
        imagen = np.asarray(valores, dtype=np.uint8)
        huella = hashlib.sha256(imagen).digest()
        anterior = unicos.get(huella)
        if anterior:
            descartes["duplicado_exacto"] += 1
            if anterior[1] != etiqueta:
                conflictos.add(huella)
            if anterior[2] >= PARTICIONES[uso]:
                continue
        unicos[huella] = (imagen, etiqueta, PARTICIONES[uso])
    descartes["conflictos_de_etiqueta"] = len(conflictos)
    filas = [v for k, v in unicos.items() if k not in conflictos]
    if not filas:
        raise ValueError("FER2013 no contiene filas utilizables.")
    x, y, grupo = zip(*filas)
    return np.stack(x), np.asarray(y), np.asarray(grupo), dict(descartes)


def hog_lote(X):
    return np.stack([rasgos_fer(fila.reshape(48, 48)) for fila in X])


def entrenar(ruta, ruta_plus, cnn):
    from .entrenar_fase7 import SEMILLA, ajustar, huella

    x, y, grupo, descartes = importar(ruta, ruta_plus)
    entrenamiento = np.flatnonzero(grupo == 0)
    tr, cal = train_test_split(entrenamiento, test_size=.15, stratify=y[entrenamiento], random_state=SEMILLA)
    indices = (tr, np.flatnonzero(grupo == 1), cal, np.flatnonzero(grupo == 2))
    candidatos = {
        "mayoria": DummyClassifier(strategy="most_frequent"),
        "hog_regresion_logistica": make_pipeline(FunctionTransformer(hog_lote), StandardScaler(),
                                                  LogisticRegression(max_iter=400, random_state=SEMILLA)),
    }
    if cnn:
        from .cnn_fer import CNNFER
        candidatos["cnn_ligera"] = CNNFER()
    modelo, reporte = ajustar(x, y, indices, candidatos)
    dataset = {"fuente": "https://www.kaggle.com/c/challenges-in-representation-learning-facial-expression-recognition-challenge/data",
               "licencia": "condiciones de FER2013 aceptadas por quien importa",
               "ferplus_sha256": huella(ruta_plus) if ruta_plus else None}
    return modelo, dict(reporte, dataset=dataset, descartados=descartes, particiones=list(map(len, indices)),
                        sujetos="el CSV no aporta identificadores de sujeto")
