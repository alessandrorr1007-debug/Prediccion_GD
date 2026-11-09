"""Grafica las curvas de validación de Fase 9; requiere matplotlib."""
import argparse
from io import StringIO
import json
from pathlib import Path


def main():
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.ticker import PercentFormatter

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("metricas", type=Path)
    parser.add_argument("salida", type=Path)
    args = parser.parse_args()
    matplotlib.rcParams["svg.hashsalt"] = "aulapredict-fase9"
    figura, ejes = plt.subplots(1, 2, figsize=(12, 5), layout="constrained")
    for tipo, eje in zip(("facial", "audio"), ejes, strict=True):
        ruta = args.metricas / f"{tipo}.metricas.json"
        informe = json.loads(ruta.read_text(encoding="utf-8"))
        for nombre, resultado in informe["validacion"].items():
            curva = [p for p in resultado["curva"] if p["margen"] == .10 and p["emitidas"] > 0]
            eje.plot([p["cobertura"] for p in curva], [p["riesgo"] for p in curva],
                     marker=".", label=nombre.replace("_", " "))
        eje.axhline(.20, color="gray", linestyle="--", linewidth=1)
        eje.axvline(.10, color="gray", linestyle=":", linewidth=1)
        eje.set(xlabel="Cobertura", ylabel="Error entre las clasificaciones emitidas",
                title=f"{tipo.capitalize()} · {informe['n_desarrollo']} muestras", xlim=(0, 1), ylim=(0, 1))
        eje.xaxis.set_major_formatter(PercentFormatter(xmax=1))
        eje.yaxis.set_major_formatter(PercentFormatter(xmax=1))
        eje.grid(alpha=.18)
        eje.legend(fontsize=8)
    figura.suptitle("Riesgo y cobertura en validación por grupo · margen 0.10")
    svg = StringIO()
    figura.savefig(svg, format="svg", metadata={"Date": None})
    contenido = "\n".join(linea.rstrip() for linea in svg.getvalue().splitlines()) + "\n"
    args.salida.write_text(contenido, encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
