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
TAMANOS_ORIGINALES = {"Training": 28709, "PublicTest": 3589, "PrivateTest": 3589}


def importar(ruta, ruta_plus, *, exigir_original=False):
    datos = pd.read_csv(ruta)
    if not {"Usage", "emotion", "pixels"} <= set(datos.columns) or not 1 <= len(datos) <= 40000:
        raise ValueError("Se requiere el CSV original FER2013 con Usage, emotion y pixels.")
    if not set(datos.Usage) <= PARTICIONES.keys():
        raise ValueError("FER2013 contiene particiones no reconocidas.")
    if exigir_original and datos.Usage.value_counts().to_dict() != TAMANOS_ORIGINALES:
        raise ValueError("Las cantidades por partición no corresponden al CSV original de FER2013.")
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


def hog_lbp(imagenes):
    """Concatena HOG con histogramas LBP uniformes en dieciséis celdas."""
    hog = hog_lote(imagenes)
    imagen = imagenes.reshape(-1, 48, 48)
    centro = imagen[:, 1:-1, 1:-1]
    vecinos = [(0, 0), (0, 1), (0, 2), (1, 2), (2, 2), (2, 1), (2, 0), (1, 0)]
    bits = np.stack([imagen[:, i:i + 46, j:j + 46] >= centro for i, j in vecinos])
    cambios = (bits != np.roll(bits, 1, axis=0)).sum(axis=0)
    codigos = np.where(cambios <= 2, bits.sum(axis=0), 9)
    celdas = [bloque for fila in np.array_split(codigos, 4, axis=1) for bloque in np.array_split(fila, 4, axis=2)]
    histogramas = [(bloque[..., None] == np.arange(10)).mean(axis=(1, 2)) for bloque in celdas]
    return np.concatenate([hog, *histogramas], axis=1)


def entrenar(ruta, ruta_plus, cnn):
    from .entrenar_fase7 import SEMILLA, ajustar, huella

    x, y, grupo, descartes = importar(ruta, ruta_plus, exigir_original=True)
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
