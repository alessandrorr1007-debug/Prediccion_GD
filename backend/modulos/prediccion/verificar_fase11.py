"""Verifica por HTTP el servidor local iniciado para la exposición."""
import argparse
import json
from urllib.error import URLError

from backend.entrenamiento_prediccion.medir_integracion_fase10 import leer


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fusion", action="store_true")
    args = parser.parse_args()
    api = "http://127.0.0.1:8001/api"
    try:
        leer(f"{api}/salud")
        inventario = leer(f"{api}/prediccion/modelos-investigacion?cargar=false")
        demo = leer(f"{api}/prediccion/demostracion-integral", {"solicitar_fusion": args.fusion})
        casos = demo["casos"]
        if [caso["caso"] for caso in casos] != list("ABCD"):
            raise ValueError("casos inesperados")
        estados = {caso["caso"]: {"academico": caso["analisis"]["academico"]["estado"],
                                   "fuentes": {k: v["estado"] for k, v in caso["analisis"]["fuentes"].items()}}
                   for caso in casos}
        print(json.dumps({"backend": "disponible", "modelos": {k: v["estado"] for k, v in inventario.items()},
                          "casos": estados, "fusion": demo["fusion"]}, indent=2, ensure_ascii=True))
        if args.fusion and not demo["fusion"]["ejecutada"]:
            return 2
        return 0
    except (URLError, OSError, ValueError, KeyError):
        print("No se pudo verificar la demo en 127.0.0.1:8001. Ejecuta iniciar_aulapredict.bat y revisa su terminal.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
