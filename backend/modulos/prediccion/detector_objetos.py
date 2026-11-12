"""Detección de objetos y señales de encuadre separada del modelo facial."""
import logging
import os
from time import perf_counter

import cv2
import numpy as np

from backend.entrenamiento_prediccion.modelos_yolo import YOLO_BEST
from backend.modulos.video.adapter import ALIAS

logger = logging.getLogger(__name__)

CLASES_COMPATIBLES = ("persona", "mochila", "telefono", "cuaderno", "libro", "audifonos", "reloj", "laptop")
ETIQUETAS_OBJETOS = {
    "persona": "Persona",
    "mochila": "Mochila",
    "telefono": "Teléfono móvil",
    "cuaderno": "Cuaderno",
    "libro": "Libro",
    "audifonos": "Audífonos",
    "reloj": "Reloj",
    "laptop": "Computador portátil",
}
LICENCIA_YOLO = "pendiente de verificar para best.pt"
METRICAS_ENTRENAMIENTO_BEST = {
    "precision": 0.77568,
    "recall": 0.68693,
    "mAP50": 0.7464,
    "mAP50_95": 0.58511,
}
UMBRAL_OBJETO = 0.45
UMBRAL_PERSONA = 0.40
LIMITACIONES_OBJETOS = [
    "La presencia de un objeto en una fotografía aislada no demuestra distracción, uso indebido ni bajo rendimiento académico.",
    "Los pesos best.pt cubren únicamente ocho clases escolares/de examen (persona, mochila, telefono, cuaderno, libro, audifonos, reloj, laptop).",
    "La licencia de best.pt debe acreditarse con su proveedor. Ultralytics ofrece AGPL-3.0 y licencia Enterprise.",
]


def metadata_detector():
    return {
        "nombre": YOLO_BEST.nombre,
        "arquitectura": "YOLOv8n",
        "licencia": LICENCIA_YOLO,
        "clases_compatibles": list(CLASES_COMPATIBLES),
        "metricas_referencia": dict(METRICAS_ENTRENAMIENTO_BEST),
        "umbrales": {"objeto": UMBRAL_OBJETO, "persona": UMBRAL_PERSONA},
    }


def evaluar_senales_geometricas(caras, ancho_img, alto_img, gris=None):
    """Extrae observaciones objetivas de encuadre e iluminación sin dependencias externas."""
    senales = []
    n_caras = len(caras or ())
    if n_caras == 0:
        senales.append({
            "codigo": "persona_fuera_de_encuadre",
            "descripcion": "No se localizó un rostro frontal dentro del área visible (posible persona fuera de encuadre, giro lateral o baja iluminación).",
            "origen": "opencv_haar_encuadre",
        })
    elif n_caras > 1:
        senales.append({
            "codigo": "multiples_personas",
            "descripcion": f"Se detectaron {n_caras} rostros frontales en la captura; no corresponde atribuir una sola identidad ni expresión individual.",
            "origen": "opencv_haar_encuadre",
        })
    else:
        rostro = caras[0]
        w, h = int(rostro.get("ancho", 0)), int(rostro.get("alto", 0))
        x, y = int(rostro.get("x", 0)), int(rostro.get("y", 0))
        if min(w, h) < 64:
            senales.append({
                "codigo": "rostro_pequeno",
                "descripcion": f"El recorte facial mide {w} × {h} px (< 64 × 64 px), insuficiente para clasificar expresiones de forma fiable.",
                "origen": "opencv_haar_encuadre",
            })
        margen_x = max(2, round(ancho_img * 0.02))
        margen_y = max(2, round(alto_img * 0.02))
        if x <= margen_x or y <= margen_y or (x + w) >= (ancho_img - margen_x) or (y + h) >= (alto_img - margen_y):
            senales.append({
                "codigo": "rostro_parcial_o_borde",
                "descripcion": "El rostro se encuentra muy próximo al borde del encuadre; podría estar parcialmente oculto o recortado.",
                "origen": "opencv_haar_encuadre",
            })
    if gris is not None and gris.size > 0:
        media = float(np.mean(gris))
        nitidez = float(cv2.Laplacian(gris, cv2.CV_64F).var())
        if media < 40:
            senales.append({
                "codigo": "iluminacion_baja",
                "descripcion": f"Iluminación promedio baja ({media:.0f}/255), lo que reduce la fiabilidad del detector facial.",
                "origen": "opencv_calidad_visual",
            })
        elif media > 225:
            senales.append({
                "codigo": "sobreexposicion",
                "descripcion": f"Brillo promedio muy alto ({media:.0f}/255), posible sobreexposición visual.",
                "origen": "opencv_calidad_visual",
            })
        if nitidez < 18:
            senales.append({
                "codigo": "nitidez_reducida",
                "descripcion": f"Nitidez visual baja (varianza Laplaciana {nitidez:.1f}); posible desenfoque o movimiento.",
                "origen": "opencv_calidad_visual",
            })
    return senales


def normalizar_detecciones_externas(detecciones):
    """Convierte detecciones ya producidas por IMAGEN/VIDEO o cajas simples al formato común."""
    if not detecciones:
        return []
    salida = []
    for item in detecciones:
        if not isinstance(item, dict):
            continue
        clase_raw = item.get("clase") or item.get("senal")
        if not isinstance(clase_raw, str) or not clase_raw.strip():
            continue
        clase = ALIAS.get(clase_raw.strip().lower(), clase_raw.strip().lower())
        confianza = None
        for campo in ("confianza_procesada", "confianza_capturada", "confianza_video", "confianza"):
            if item.get(campo) is not None:
                try:
                    valor = float(item[campo])
                    if np.isfinite(valor) and 0 <= valor <= 1:
                        confianza = round(valor, 4)
                        break
                except (TypeError, ValueError, OverflowError):
                    pass
        if confianza is None:
            continue
        coordenadas = ("x1", "y1", "x2", "y2")
        fuente_caja = item if all(k in item for k in coordenadas) else item.get("caja")
        caja = None
        if isinstance(fuente_caja, dict):
            try:
                valores = [float(fuente_caja[k]) for k in coordenadas]
                x1, y1, x2, y2 = valores
                if all(np.isfinite(valores)) and 0 <= x1 < x2 and 0 <= y1 < y2:
                    caja = dict(zip(coordenadas, (round(v, 2) for v in valores)))
            except (KeyError, TypeError, ValueError, OverflowError):
                pass
        salida.append({
            "clase": clase,
            "etiqueta": ETIQUETAS_OBJETOS.get(clase, clase.replace("_", " ").capitalize()),
            "confianza": confianza,
            "origen": str(item.get("origen") or "adaptador_externo"),
            **({"caja": caja} if caja is not None else {}),
        })
    return salida


def _inferir_yolo_local(imagen, ancho_img, alto_img):
    t0 = perf_counter()
    diag_previo = YOLO_BEST.diagnostico()
    modelo = YOLO_BEST.cargar()
    if modelo is None:
        return {
            "estado": "error_inferencia" if YOLO_BEST.carga == "error" else "modelo_no_disponible",
            "diagnostico": YOLO_BEST.diagnostico("error" if YOLO_BEST.carga == "error" else "no_ejecutada"),
            "latencia_ms": round((perf_counter() - t0) * 1000, 3),
            "objetos": [],
            "conteo_personas": None,
        }
    try:
        resultados = modelo.predict(imagen, verbose=False, conf=min(UMBRAL_OBJETO, UMBRAL_PERSONA))
    except Exception as error:
        logger.warning("Inferencia de objetos YOLO fallida: %s", type(error).__name__)
        return {
            "estado": "error_inferencia",
            "diagnostico": YOLO_BEST.diagnostico("error"),
            "latencia_ms": round((perf_counter() - t0) * 1000, 3),
            "objetos": [],
            "conteo_personas": None,
        }
    objetos = []
    conteo_personas = 0
    res0 = resultados[0] if resultados else None
    nombres = getattr(modelo, "names", {}) or {}
    if res0 is not None and getattr(res0, "boxes", None) is not None:
        for box in res0.boxes:
            cls_idx = int(box.cls[0]) if hasattr(box.cls, "__len__") else int(box.cls)
            conf = float(box.conf[0]) if hasattr(box.conf, "__len__") else float(box.conf)
            clase_raw = str(nombres.get(cls_idx, cls_idx)).strip().lower()
            clase = ALIAS.get(clase_raw, clase_raw)
            umbral = UMBRAL_PERSONA if clase == "persona" else UMBRAL_OBJETO
            if conf < umbral:
                continue
            xyxy = box.xyxy[0].tolist() if hasattr(box.xyxy[0], "tolist") else list(box.xyxy[0])
            x1, y1, x2, y2 = [round(max(0.0, float(v)), 1) for v in xyxy]
            x2 = min(float(ancho_img), x2)
            y2 = min(float(alto_img), y2)
            if clase == "persona":
                conteo_personas += 1
            objetos.append({
                "clase": clase,
                "etiqueta": ETIQUETAS_OBJETOS.get(clase, clase.capitalize()),
                "confianza": round(conf, 4),
                "origen": "yolo_best_local",
                "caja": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
            })
    return {
        "estado": "ejecutado",
        "diagnostico": YOLO_BEST.diagnostico("ejecutada"),
        "frio": diag_previo["carga"] == "pendiente",
        "latencia_ms": round((perf_counter() - t0) * 1000, 3),
        "objetos": objetos,
        "conteo_personas": conteo_personas,
    }


def detectar_objetos_imagen(imagen, *, caras=(), gris=None, detecciones_externas=None, usar_yolo=None):
    """Ejecuta detección de objetos separada del modelo facial y consolida señales de encuadre."""
    alto_img, ancho_img = imagen.shape[:2]
    senales_encuadre = evaluar_senales_geometricas(caras, ancho_img, alto_img, gris)
    externas = normalizar_detecciones_externas(detecciones_externas)

    modo_env = os.getenv("AULAPREDICT_DETECTOR_OBJETOS", "").strip().lower()
    if modo_env in {"0", "false", "desactivado", "off"}:
        solicitar_yolo = False
    elif modo_env == "yolo":
        solicitar_yolo = True
    else:
        solicitar_yolo = bool(usar_yolo)

    local = None
    if solicitar_yolo:
        local = _inferir_yolo_local(imagen, ancho_img, alto_img)

    objetos_locales = local["objetos"] if local else []
    conteo_personas = local["conteo_personas"] if local else None
    if conteo_personas is None and externas:
        conteo_personas = sum(1 for o in externas if o["clase"] == "persona")
    if conteo_personas is not None and conteo_personas > 1 and not any(
        s["codigo"] == "multiples_personas" for s in senales_encuadre
    ):
        senales_encuadre.append({
            "codigo": "multiples_personas",
            "descripcion": f"El detector visual identificó {conteo_personas} personas en el encuadre.",
            "origen": "detector_objetos",
        })

    combinados = list(externas)
    vistos = {(o["clase"], round(o["confianza"], 2), tuple(sorted(o.get("caja", {}).items()))) for o in externas}
    for obj in objetos_locales:
        huella = (obj["clase"], round(obj["confianza"], 2), tuple(sorted(obj.get("caja", {}).items())))
        if huella not in vistos:
            vistos.add(huella)
            combinados.append(obj)

    objetos_relevantes = [o for o in combinados if o["clase"] != "persona"]

    if local and local["estado"] == "ejecutado":
        estado = "hibrido" if externas else "ejecutado"
        origen = "hibrido" if externas else "yolo_best_local"
    elif externas:
        estado = "solo_externas"
        origen = "adaptador_externo"
    elif local and local["estado"] in {"modelo_no_disponible", "error_inferencia"}:
        estado = local["estado"]
        origen = "opencv_geometrico"
    else:
        estado = "no_solicitado"
        origen = "opencv_geometrico"

    return {
        "estado": estado,
        "origen": origen,
        "modelo": metadata_detector(),
        "latencia_ms": local["latencia_ms"] if local else 0.0,
        "objetos": combinados,
        "objetos_no_persona": objetos_relevantes,
        "conteo_personas": conteo_personas,
        "senales_encuadre": senales_encuadre,
        "adaptador_externo_listo": True,
        "limitaciones": list(LIMITACIONES_OBJETOS),
    }
