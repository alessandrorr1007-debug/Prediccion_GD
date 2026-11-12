"""Prepara la carga ordenada de DLLs en Windows antes de recolectar módulos de prueba con pandas."""
import sys

if sys.platform == "win32":
    try:
        import torch  # noqa: F401
    except Exception:
        pass
