"""Mide el circuito de demostración por HTTP con un Uvicorn local aislado."""
import argparse
import json
import os
import socket
from statistics import median, quantiles
import subprocess
import sys
from time import perf_counter, sleep
from urllib.error import URLError
from urllib.request import Request, urlopen


def leer(url, datos=None):
    cuerpo = None if datos is None else json.dumps(datos).encode("utf-8")
    peticion = Request(url, data=cuerpo, headers={"Content-Type": "application/json"})
    with urlopen(peticion, timeout=60) as respuesta:
        return json.load(respuesta)


def medir(repeticiones, fusion, sin_modelos):
    import psutil

    entorno = dict(os.environ, OPENBLAS_NUM_THREADS="1", OMP_NUM_THREADS="1", MKL_NUM_THREADS="1")
    if sin_modelos:
        for variable in ("AULAPREDICT_MODELOS_FASE7", "AULAPREDICT_MODELOS_FASE8", "AULAPREDICT_DEMO_IMAGEN",
                         "AULAPREDICT_DEMO_RAVDESS", "AULAPREDICT_DEMO_TRACKING", "AULAPREDICT_FUSION_FASE10"):
            entorno.pop(variable, None)
    with socket.socket() as reserva:
        reserva.bind(("127.0.0.1", 0))
        puerto = reserva.getsockname()[1]
    base = f"http://127.0.0.1:{puerto}/api"
    destino = f"{base}/prediccion/demostracion-integral"
    cpu = psutil.cpu_percent(interval=.5)
    inicio = perf_counter()
    proceso = subprocess.Popen([sys.executable, "-B", "-m", "uvicorn", "backend.app:app", "--host", "127.0.0.1",
                                "--port", str(puerto), "--no-access-log"], env=entorno,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    servidor = psutil.Process(proceso.pid)

    def rss():
        return sum(p.memory_info().rss for p in (servidor, *servidor.children(recursive=True))) / 1024**2

    def peticion():
        comienzo = perf_counter()
        salida = leer(destino, {"solicitar_fusion": fusion})
        if len(salida["casos"]) != 4 or salida["fusion"]["ejecutada"] != (fusion and not sin_modelos):
            raise RuntimeError("La configuración de modelos no produjo el escenario esperado")
        return (perf_counter() - comienzo) * 1000, salida

    try:
        while True:
            try:
                leer(f"{base}/salud")
                break
            except (OSError, URLError):
                if proceso.poll() is not None or perf_counter() - inicio > 30:
                    raise RuntimeError("Uvicorn local no inició") from None
                sleep(.05)
        arranque = (perf_counter() - inicio) * 1000
        memoria_inicio = rss()
        comienzo = perf_counter()
        estado = leer(f"{base}/prediccion/modelos-investigacion?cargar=false")
        estado_ms = (perf_counter() - comienzo) * 1000
        fria, salida = peticion()
        muestras = [peticion()[0] for _ in range(repeticiones)]
        return {"repeticiones": repeticiones, "sin_modelos": sin_modelos, "fusion": salida["fusion"]["ejecutada"],
                "arranque_ms": arranque, "estado_modelos_ms": estado_ms, "fria_ms": fria,
                "p50_ms": median(muestras), "p95_ms": quantiles(muestras, n=100, method="inclusive")[94],
                "rss_arranque_mib": memoria_inicio, "rss_final_mib": rss(), "cpu_previa_pct": cpu,
                "modelos": {k: v["estado"] for k, v in estado.items()}}
    finally:
        procesos = [*servidor.children(recursive=True), servidor]
        for hijo in procesos:
            try:
                hijo.terminate()
            except psutil.NoSuchProcess:
                pass
        _, vivos = psutil.wait_procs(procesos, timeout=3)
        for hijo in vivos:
            try:
                hijo.kill()
            except psutil.NoSuchProcess:
                pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repeticiones", type=int, default=20)
    parser.add_argument("--fusion", action="store_true")
    parser.add_argument("--sin-modelos", action="store_true")
    args = parser.parse_args()
    if not 2 <= args.repeticiones <= 100:
        parser.error("Las repeticiones deben estar entre 2 y 100")
    print(json.dumps(medir(args.repeticiones, args.fusion, args.sin_modelos)))


if __name__ == "__main__":
    main()
