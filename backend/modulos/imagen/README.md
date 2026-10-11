# Integración con IMAGEN

Fuente externa: [Zudo45/SistemaSupervisionExamenes-Imagen](https://github.com/Zudo45/SistemaSupervisionExamenes-Imagen).

El equipo de IMAGEN conserva su pipeline, entrenamiento, interfaz y dependencias. Este directorio contiene únicamente `adapter.py`, que lee su exportación JSON por fotograma y transforma objetos confirmados o recuperados en eventos para PREDICCIÓN.

PREDICCIÓN no vuelve a ejecutar YOLO ni modifica métricas de IMAGEN. `calidad_normalizada`, cuando se suministra, debe estar entre 0 y 1; las métricas sin calibrar de brillo, ruido o nitidez se conservan en el sistema de origen y no se convierten automáticamente.
