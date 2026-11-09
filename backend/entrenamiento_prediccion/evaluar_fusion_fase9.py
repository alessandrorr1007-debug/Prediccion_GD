"""Experimento de fusión sobre audio y unidades de acción emparejadas de RAVDESS."""
import argparse
from collections import Counter
import json
from pathlib import Path
import re
from zipfile import ZipFile

import joblib
import numpy as np
import pandas as pd
import sklearn
from threadpoolctl import threadpool_limits

from .entrenar_fase7 import SEMILLA, candidatos_tabulares, clips_ravdess, evaluar, huella
from .entrenar_fase9 import calibrar
from .rasgos_fase7 import EntradaInvalida, SenalInsuficiente, rasgos_audio

TRACKING_MD5 = "5753bbc64a9a790f8a8d3e03cba526ee"
PATRON = re.compile(r"01-(01-0[1-8]-0[12]-0[12]-0[12]-(?:0[1-9]|1\d|2[0-4]))\.csv")
UNIDADES = tuple(f"AU{i:02d}_r" for i in (1, 2, 4, 5, 6, 7, 9, 10, 12, 14, 15, 17, 20, 23, 25, 26, 45))
CAMPOS = {"timestamp", "confidence", *UNIDADES}


def rasgos_visuales(archivo, duracion):
    tabla = pd.read_csv(archivo, usecols=lambda nombre: nombre.strip() in CAMPOS)
    tabla.columns = tabla.columns.str.strip()
    if set(tabla.columns) != CAMPOS:
        raise ValueError("Faltan columnas OpenFace en RAVDESS Tracking")
    tiempos = tabla["timestamp"].to_numpy()
    if (not len(tiempos) or not np.isfinite(tiempos).all() or (np.diff(tiempos) < 0).any()
            or abs(tiempos[-1] - duracion) > .5 or tiempos[0] > .2):
        return None, "tiempo_incompatible"
    solapados = (tiempos >= 0) & (tiempos <= duracion)
    calidad = solapados & (tabla["confidence"] >= .80)
    if calidad.sum() < 20 or calidad.sum() / solapados.sum() < .70:
        return None, "tracking_insuficiente"
    valores = tabla.loc[calidad, list(UNIDADES)].to_numpy()
    if not np.isfinite(valores).all():
        return None, "tracking_invalido"
    return np.concatenate([valores.mean(axis=0), valores.std(axis=0), np.percentile(valores, 90, axis=0)]), None


def cargar(ruta_audio, ruta_visual):
    if huella(ruta_visual, "md5") != TRACKING_MD5:
        raise ValueError("El ZIP visual no coincide con el publicado por Zenodo.")
    audio, visual, y, actores = [], [], [], []
    descartes = Counter()
    with ZipFile(ruta_visual) as zip_visual:
        archivos = {}
        for entrada in zip_visual.infolist():
            m = PATRON.fullmatch(Path(entrada.filename).name)
            if m and not entrada.is_dir():
                if m[1] in archivos:
                    raise ValueError("ID visual duplicado")
                archivos[m[1]] = entrada
        for wav, clase, actor, identificador in clips_ravdess(ruta_audio, descartes, con_id=True):
            if identificador not in archivos:
                descartes["sin_pareja_visual"] += 1
                continue
            try:
                vector, calidad = rasgos_audio(wav, ampliado=True)
            except (EntradaInvalida, SenalInsuficiente) as error:
                descartes[type(error).__name__] += 1
                continue
            with zip_visual.open(archivos[identificador]) as archivo:
                rasgos, motivo = rasgos_visuales(archivo, calidad["duracion_segundos"])
            if motivo:
                descartes[motivo] += 1
                continue
            audio.append(vector)
            visual.append(rasgos)
            y.append(clase)
            actores.append(actor)
    return np.asarray(audio), np.asarray(visual), np.asarray(y), np.asarray(actores), dict(descartes)


def entrada_por_modalidad(audio=None, visual=None):
    if audio is None:
        return ("abstencion", None) if visual is None else ("solo_visual", visual)
    if visual is None:
        return "solo_audio", audio
    return "audio_visual", np.column_stack([audio, visual])


def experimentar(ruta_audio, ruta_visual):
    audio, visual, y, actores, descartes = cargar(ruta_audio, ruta_visual)
    tr = np.flatnonzero(actores <= 16)
    cal = np.flatnonzero((actores >= 17) & (actores <= 20))
    prueba = np.flatnonzero(actores >= 21)
    if [len(np.unique(actores[p])) for p in (tr, cal, prueba)] != [16, 4, 4]:
        raise ValueError("El emparejamiento no preservó los grupos de actores previstos.")
    base = candidatos_tabulares(14)["regresion_logistica"]
    resultados, modelos = {}, {}
    for modalidades in ((audio, None), (None, visual), (audio, visual)):
        nombre, x = entrada_por_modalidad(*modalidades)
        modelo = calibrar(base, x, y, tr, cal)
        modelos[nombre] = modelo
        resultados[nombre] = evaluar(modelo, x[prueba], y[prueba])
        por_actor = {}
        for actor in np.unique(actores[prueba]):
            indices = prueba[actores[prueba] == actor]
            evaluacion = evaluar(modelo, x[indices], y[indices])
            por_actor[str(actor)] = {"n": len(indices), "exactitud": evaluacion["reporte"]["accuracy"],
                                     "cobertura": evaluacion["cobertura"]}
        resultados[nombre]["actores_prueba"] = por_actor
    informe = {"objetivo": "ocho expresiones actuadas de RAVDESS", "modelo": "regresion_logistica_escalada",
            "version": "fusion-fase9-1.0", "sklearn": sklearn.__version__,
            "semilla": SEMILLA, "fuente_tracking": "https://doi.org/10.5281/zenodo.3255102",
            "sha256_audio": huella(ruta_audio), "sha256_visual": huella(ruta_visual),
            "tracking_md5": TRACKING_MD5, "particiones": list(map(len, (tr, cal, prueba))),
            "descartes": descartes, "historica_expuesta_para_audio": True, "resultados": resultados,
            "entrada_ausente": {"sin_visual": "solo_audio", "sin_audio": "solo_visual", "sin_ambas": "abstencion"}}
    return informe, modelos


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audio", type=Path)
    parser.add_argument("tracking", type=Path)
    parser.add_argument("--salida", required=True, type=Path)
    parser.add_argument("--artefacto", type=Path)
    args = parser.parse_args()
    with threadpool_limits(limits=1):
        informe, modelos = experimentar(args.audio, args.tracking)
    args.salida.parent.mkdir(parents=True, exist_ok=True)
    args.salida.write_text(json.dumps(informe, indent=2), encoding="utf-8")
    if args.artefacto:
        args.artefacto.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump({"version": informe["version"], "sklearn": informe["sklearn"], "modelos": modelos},
                    args.artefacto, compress=3)


if __name__ == "__main__":
    main()
