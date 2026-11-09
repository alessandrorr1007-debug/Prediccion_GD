"""Mide peticiones en el proceso de la API y su memoria residente; requiere psutil."""
import argparse
import base64
import json
from pathlib import Path
from statistics import median, quantiles
from time import perf_counter
from zipfile import ZipFile

from fastapi.testclient import TestClient


def main():
    import psutil

    from backend.app import app

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tipo", choices=("audio", "academico", "estado", "estado_archivos", "facial"))
    parser.add_argument("--ravdess", type=Path, default=Path("_archivo/fase7/datos/ravdess-speech.zip"))
    parser.add_argument("--imagen", type=Path, default=Path("_archivo/fase7/datos/astronaut.png"))
    parser.add_argument("--repeticiones", type=int, default=30)
    args = parser.parse_args()
    if args.repeticiones < 2:
        parser.error("Se requieren al menos dos repeticiones.")
    proceso = psutil.Process()
    datos = {"schema_version": 1}
    if args.tipo == "audio":
        with ZipFile(args.ravdess) as zip_audio:
            muestra = next(n for n in zip_audio.namelist() if n.endswith("03-01-08-01-01-01-21.wav"))
            datos["audio"] = {"wav_b64": base64.b64encode(zip_audio.read(muestra)).decode()}
    elif args.tipo == "facial":
        datos["imagen"] = {"imagen_b64": base64.b64encode(args.imagen.read_bytes()).decode()}
    elif args.tipo == "academico":
        datos["academico"] = {"G1": 7, "G2": 6, "corte": "despues_g2", "escala": "0-20"}

    with TestClient(app) as cliente:
        def medir():
            inicio = perf_counter()
            if args.tipo.startswith("estado"):
                query = "?cargar=false" if args.tipo == "estado_archivos" else ""
                salida = cliente.get("/api/prediccion/modelos-investigacion" + query)
            else:
                salida = cliente.post("/api/prediccion/analisis-experimental", json=datos)
            salida.raise_for_status()
            return 1000 * (perf_counter() - inicio), salida.json()

        cpu_previa = psutil.cpu_percent(interval=.5)
        antes = proceso.memory_info().rss
        fria, salida = medir()
        despues = proceso.memory_info().rss
        muestras = [medir()[0] for _ in range(args.repeticiones)]
        clave = "imagen" if args.tipo == "facial" else args.tipo
        bloque = salida.get("fuentes", {}).get(clave, salida.get(clave, salida))
        print(json.dumps(dict(tipo=args.tipo, fria_ms=fria, p50_ms=median(muestras),
                              p95_ms=quantiles(muestras, n=100)[94], rss_base_MiB=antes / 2**20,
                              rss_primera_MiB=despues / 2**20, rss_final_MiB=proceso.memory_info().rss / 2**20,
                              estado=bloque.get("estado"), modelo=bloque.get("modelo", {}).get("version"),
                              cpu_sistema_previa_pct=cpu_previa, cpu_sistema_durante_pct=psutil.cpu_percent())))


if __name__ == "__main__":
    main()
