"""Evaluación externa de modelos RAVDESS congelados en seis archivos CREMA-D."""
import argparse
from collections import Counter
import json
from pathlib import Path
import re
import tarfile

import joblib
import numpy as np
from threadpoolctl import threadpool_limits

from .entrenar_fase7 import clips_ravdess, huella
from .entrenar_fase9 import POLITICA_FASE8, medir_politica, resumir
from .rasgos_fase7 import EntradaInvalida, SenalInsuficiente, rasgos_audio
from backend.modulos.prediccion.modelos_fase7 import PREPROCESADO_AUDIO_FASE8

MD5 = ("8771d3e9dfdbd1aeb2dfa67f1e0b75b1", "cd77acbf10b33d89e0f0a7d371a61090",
       "2583c762c802287dd63204660eb2af52", "d296623cc57b0268a70faa21d1b3ed69",
       "49b26e14f74316c5c173cf1577165115", "5f4eedcbc36ca67ca9dd081203fd3399")
ETIQUETAS = {"ANG": "enojo", "DIS": "asco", "FEA": "miedo", "HAP": "alegria",
             "NEU": "neutral", "SAD": "tristeza"}
PATRON = re.compile(r"(\d{4})_[A-Z]{3}_(ANG|DIS|FEA|HAP|NEU|SAD)_[A-Z]{2}\.wav")


def clips_crema(directorio):
    vistos = set()
    for i, md5 in enumerate(MD5):
        ruta = directorio / f"wds-audio-test-{i:06d}.tar"
        if huella(ruta, "md5") != md5:
            raise ValueError(f"MD5 inválido para {ruta.name}")
        with tarfile.open(ruta, mode="r:") as archivo:
            for entrada in archivo:
                if not entrada.isfile() or not entrada.name.endswith(".wav"):
                    continue
                nombre = Path(entrada.name).name
                coincidencia = PATRON.fullmatch(nombre)
                if coincidencia is None or nombre in vistos or entrada.size > 2 * 1024**2:
                    raise ValueError(f"Entrada CREMA-D inesperada: {nombre}")
                vistos.add(nombre)
                actor, codigo = coincidencia.groups()
                with archivo.extractfile(entrada) as wav:
                    yield wav.read(), ETIQUETAS[codigo], actor


def evaluar(clips, artefacto, *, ravdess=False):
    x, etiquetas, grupos = [], [], []
    descartes = Counter()
    ampliado = artefacto.get("preprocesado") == PREPROCESADO_AUDIO_FASE8
    for contenido, etiqueta, actor in clips:
        if (ravdess and actor < 21) or etiqueta not in ETIQUETAS.values():
            continue
        try:
            vector, _ = rasgos_audio(contenido, ampliado=ampliado)
        except (EntradaInvalida, SenalInsuficiente) as error:
            descartes[type(error).__name__] += 1
            continue
        x.append(vector)
        etiquetas.append(etiqueta)
        grupos.append(str(actor))
    modelo = artefacto["modelo"]
    p = modelo.predict_proba(np.asarray(x))
    y, grupos = np.asarray(etiquetas), np.asarray(grupos)
    reporte = resumir(p, y, grupos, modelo.classes_)
    reporte["f1_macro_seis_clases"] = float(np.mean([reporte["reporte"][c]["f1-score"] for c in ETIQUETAS.values()]))
    pred = modelo.classes_[p.argmax(axis=1)]
    reporte["politica_activa"] = medir_politica(p, pred == y, grupos, **artefacto.get("politica", POLITICA_FASE8))
    reporte["predicciones_fuera_de_seis_clases"] = int((~np.isin(pred, list(ETIQUETAS.values()))).sum())
    reporte["actores"] = {actor: {"n": int((grupos == actor).sum()),
                                  "exactitud": float((pred[grupos == actor] == y[grupos == actor]).mean())}
                           for actor in np.unique(grupos)}
    reporte["descartes"] = dict(descartes)
    return reporte


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("crema", type=Path)
    parser.add_argument("ravdess", type=Path)
    parser.add_argument("modelo", type=Path)
    parser.add_argument("--salida", type=Path, required=True)
    args = parser.parse_args()
    with threadpool_limits(limits=1):
        artefacto = joblib.load(args.modelo)
        informe = {"fuente_crema": "https://doi.org/10.5281/zenodo.14646870", "crema_md5": MD5,
                   "modelo": artefacto["algoritmo"], "version": artefacto["version"],
                   "modelo_sha256": huella(args.modelo), "ravdess_sha256": huella(args.ravdess),
                   "crema": evaluar(clips_crema(args.crema), artefacto),
                   "ravdess_historica_seis_clases": evaluar(clips_ravdess(args.ravdess, Counter()), artefacto, ravdess=True)}
    args.salida.parent.mkdir(parents=True, exist_ok=True)
    args.salida.write_text(json.dumps(informe, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
