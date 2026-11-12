"""Experimento facial alternativo con fotografías reales de CMU Face Images."""
import argparse
from collections import Counter
import hashlib
from io import BytesIO
import json
from pathlib import Path
import re
import tarfile
from zipfile import ZipFile

import cv2
import joblib
import numpy as np
import sklearn
from sklearn.dummy import DummyClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import FunctionTransformer, StandardScaler
from sklearn.svm import SVC
from threadpoolctl import threadpool_limits

from .cnn_fer import CNNFER
from .entrenar_fase7 import MARGEN, SEMILLA, UMBRAL, ajustar, huella
from .entrenar_fer import hog_lote
from backend.modulos.prediccion.modelos_fase7 import VERSION_FASE8

CMU = {"fuente": "https://doi.org/10.24432/C5JC79", "licencia": "CC BY 4.0",
       "nombre": "CMU Face Images", "dominio": "expresiones posadas de 20 personas en condiciones de captura controladas"}
CLASES = {"angry": "enojo", "happy": "alegria", "sad": "tristeza", "neutral": "neutral"}
PGM = re.compile(r"faces/([a-z0-9]+)/\1_(straight|left|right|up)_(angry|happy|sad|neutral)_open\.(pgm|bad)")


def importar(ruta):
    cara = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    registros, conflictos, personas_fuente = {}, set(), set()
    descartes = Counter()
    with ZipFile(ruta) as zip_cmu, tarfile.open(fileobj=BytesIO(zip_cmu.read("faces.tar.gz")), mode="r:gz") as tar:
        for miembro in sorted(tar.getmembers(), key=lambda m: m.name):
            coincidencia = PGM.fullmatch(miembro.name)
            if not miembro.isfile() or coincidencia is None:
                continue
            persona, pose, clase, extension = coincidencia.groups()
            personas_fuente.add(persona)
            if extension == "bad" or miembro.size > 64 * 1024:
                descartes["pgm_invalido"] += 1
                continue
            with tar.extractfile(miembro) as archivo:
                original = cv2.imdecode(np.frombuffer(archivo.read(), dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
            if original is None or original.shape != (120, 128):
                descartes["pgm_invalido"] += 1
                continue
            gris = cv2.resize(original, (256, 240), interpolation=cv2.INTER_LINEAR)
            caras = cara.detectMultiScale(gris, scaleFactor=1.15, minNeighbors=4, minSize=(64, 64))
            if len(caras) != 1:
                descartes["sin_un_rostro"] += 1
                continue
            x, y, w, h = caras[0]
            recorte = cv2.resize(gris[y:y+h, x:x+w], (48, 48), interpolation=cv2.INTER_AREA).ravel()
            digest = hashlib.sha256(recorte).digest()
            etiqueta = CLASES[clase]
            if digest in registros:
                descartes["duplicado_exacto"] += 1
                if registros[digest][1:3] != (etiqueta, persona):
                    conflictos.add(digest)
                continue
            registros[digest] = (recorte, etiqueta, persona, pose)
    filas = [v for k, v in registros.items() if k not in conflictos]
    personas_utiles = {fila[2] for fila in filas}
    if len(personas_fuente) != 20 or len(personas_utiles) < 16:
        raise ValueError("Se esperaban 20 personas de origen y al menos 16 con recortes válidos.")
    descartes["personas_sin_recortes"] = len(personas_fuente - personas_utiles)
    x, y, personas, poses = zip(*filas)
    return np.stack(x), np.array(y), np.array(personas), poses, dict(descartes)


def intervalos(modelo, x, y, grupos):
    rng = np.random.default_rng(SEMILLA)
    unicos = np.unique(grupos)
    indices = {grupo: np.flatnonzero(grupos == grupo) for grupo in unicos}
    pred = modelo.predict(x)
    scores = []
    for muestras in rng.choice(unicos, size=(1000, len(unicos))):
        filas = np.concatenate([indices[grupo] for grupo in muestras])
        scores.append((accuracy_score(y[filas], pred[filas]),
                       f1_score(y[filas], pred[filas], labels=modelo.classes_, average="macro", zero_division=0)))
    exactitud, f1 = np.percentile(scores, [2.5, 97.5], axis=0).T.tolist()
    return {"exactitud": exactitud, "f1_macro": f1, "remuestreos_por_persona": 1000}


def candidatos(*, incluir_cnn=True):
    modelos = {
        "mayoria": DummyClassifier(strategy="most_frequent"),
        "hog_logistica": make_pipeline(FunctionTransformer(hog_lote), StandardScaler(),
                                       LogisticRegression(C=.2, max_iter=400, random_state=SEMILLA)),
        "hog_svm": make_pipeline(FunctionTransformer(hog_lote), StandardScaler(), SVC(C=3)),
    }
    if incluir_cnn:
        modelos["cnn_regularizada"] = CNNFER(epochs=18, regularizada=True)
    return modelos


def particiones(personas):
    orden = np.random.default_rng(SEMILLA).permutation(np.unique(personas))
    n_tr = len(orden) // 2
    n_aux = round(.15 * len(orden))
    grupos = np.split(orden, [n_tr, n_tr + n_aux, n_tr + 2 * n_aux])
    return grupos, tuple(np.flatnonzero(np.isin(personas, grupo)) for grupo in grupos)


def entrenar(ruta, *, incluir_cnn=True):
    cv2.setNumThreads(1)
    x, y, personas, poses, descartes = importar(ruta)
    grupos, indices = particiones(personas)
    modelo, reporte = ajustar(x, y, indices, candidatos(incluir_cnn=incluir_cnn))
    prueba = indices[-1]
    return modelo, dict(reporte, tipo="facial", version=VERSION_FASE8, dataset=CMU, dataset_sha256=huella(ruta),
                        sklearn=sklearn.__version__, semilla=SEMILLA, umbral=UMBRAL, margen=MARGEN,
                        personas_por_particion=list(map(len, grupos)), particiones=list(map(len, indices)),
                        categorias=dict(sorted(Counter(y).items())), poses=dict(sorted(Counter(poses).items())),
                        descartes=descartes, ic95_exploratorio=intervalos(modelo, x[prueba], y[prueba], personas[prueba]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--salida", type=Path, required=True)
    parser.add_argument("--sin-cnn", action="store_true", help="Compara los modelos clásicos sin instalar PyTorch.")
    args = parser.parse_args()
    with threadpool_limits(limits=1):
        modelo, reporte = entrenar(args.dataset, incluir_cnn=not args.sin_cnn)
    args.salida.mkdir(parents=True, exist_ok=True)
    metadatos = {clave: reporte[clave] for clave in ("tipo", "version", "sklearn", "dataset")}
    joblib.dump(dict(metadatos, modelo=modelo, algoritmo=reporte["seleccion"]), args.salida / "facial.joblib", compress=3)
    (args.salida / "facial.metricas.json").write_text(json.dumps(reporte, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
