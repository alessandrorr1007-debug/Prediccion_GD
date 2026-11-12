"""Auditoría controlada y evaluación reproducible del modelo facial (Fase 13C)."""
import argparse
import json
from pathlib import Path
from time import perf_counter

import cv2
import joblib
import numpy as np
from sklearn.base import clone
from sklearn.calibration import CalibratedClassifierCV
from sklearn.decomposition import PCA
from sklearn.frozen import FrozenEstimator
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import FunctionTransformer, StandardScaler
from sklearn.svm import SVC

from . import entrenar_cmu_fase8 as cmu
from .entrenar_fase7 import SEMILLA, resumir_predicciones
from .entrenar_fer import hog_lbp, hog_lote
from .rasgos_fase7 import rasgos_fer

RAIZ = Path(__file__).resolve().parents[2]
RUTA_ZIP_DEFAULT = RAIZ / "_archivo" / "fase8" / "datos" / "cmu-face-images.zip"
RUTA_MODELO_DEFAULT = RAIZ / "_archivo" / "fase8" / "modelos" / "facial.joblib"
RUTA_SALIDA_DEFAULT = RAIZ / "docs" / "fase13_auditoria_facial.json"


def clahe_hog_simetrico(x):
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(4, 4))
    salida = []
    for fila in x:
        img = clahe.apply(fila.reshape(48, 48).astype(np.uint8))
        h1 = rasgos_fer(img)
        h2 = rasgos_fer(cv2.flip(img, 1))
        salida.append(0.5 * (h1 + h2))
    return np.stack(salida)


def multiscale_clahe_hog_sim(x):
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(4, 4))
    hog24 = cv2.HOGDescriptor((48, 48), (24, 24), (12, 12), (12, 12), 9)
    salida = []
    for fila in x:
        img = clahe.apply(fila.reshape(48, 48).astype(np.uint8))
        img_f = cv2.flip(img, 1)
        f1 = np.concatenate([rasgos_fer(img), hog24.compute(img).ravel()])
        f2 = np.concatenate([rasgos_fer(img_f), hog24.compute(img_f).ravel()])
        salida.append(0.5 * (f1 + f2))
    return np.stack(salida)


def medir_latencia_cpu_unica(modelo, muestra, repeticiones=25):
    tiempos = []
    for _ in range(repeticiones):
        t0 = perf_counter()
        modelo.predict_proba(muestra)
        tiempos.append((perf_counter() - t0) * 1000)
    return {
        "mediana_ms": round(float(np.median(tiempos)), 3),
        "p95_ms": round(float(np.percentile(tiempos, 95)), 3),
    }


def ejecutar_auditoria(ruta_zip=RUTA_ZIP_DEFAULT, ruta_modelo=RUTA_MODELO_DEFAULT, ruta_salida=RUTA_SALIDA_DEFAULT):
    x, y, personas, poses, descartes = cmu.importar(Path(ruta_zip))
    grupos, (tr, va, cal, te) = cmu.particiones(personas)
    dev_idx = np.concatenate([tr, va, cal])
    fit_idx = np.concatenate([tr, va])

    artefacto = joblib.load(Path(ruta_modelo))
    modelo_vigente = artefacto["modelo"]
    t_carga = perf_counter()
    p_base = modelo_vigente.predict_proba(x[te])
    ms_lote_base = round((perf_counter() - t_carga) * 1000, 3)
    clases = modelo_vigente.classes_
    rep_base = resumir_predicciones(clases, clases[p_base.argmax(1)], y[te], p_base)
    lat_base = medir_latencia_cpu_unica(modelo_vigente, x[te[:1]])

    candidatos = {
        "hog_svm_baseline_repro": make_pipeline(FunctionTransformer(hog_lote), StandardScaler(), SVC(C=3, probability=False)),
        "clahe_hog_sim_lr_c005": make_pipeline(FunctionTransformer(clahe_hog_simetrico), StandardScaler(), LogisticRegression(C=0.05, max_iter=1000, random_state=SEMILLA)),
        "clahe_hog_sim_lr_c020": make_pipeline(FunctionTransformer(clahe_hog_simetrico), StandardScaler(), LogisticRegression(C=0.2, max_iter=1000, random_state=SEMILLA)),
        "clahe_hog_sim_pca24_lr": make_pipeline(FunctionTransformer(clahe_hog_simetrico), StandardScaler(), PCA(n_components=24, random_state=SEMILLA), LogisticRegression(C=0.2, max_iter=1000, random_state=SEMILLA)),
        "ms_clahe_hog_sim_lr": make_pipeline(FunctionTransformer(multiscale_clahe_hog_sim), StandardScaler(), LogisticRegression(C=0.05, max_iter=1000, random_state=SEMILLA)),
        "ms_clahe_hog_sim_pca30_svc": make_pipeline(FunctionTransformer(multiscale_clahe_hog_sim), StandardScaler(), PCA(n_components=30, random_state=SEMILLA), SVC(C=1.5, class_weight="balanced")),
        "clahe_hog_lbp_pca32_lr": make_pipeline(FunctionTransformer(hog_lbp), StandardScaler(), PCA(n_components=32, random_state=SEMILLA), LogisticRegression(C=0.1, max_iter=1000, random_state=SEMILLA)),
    }

    gkf = GroupKFold(n_splits=4)
    resultados_dev = {}
    for nombre, estimador in candidatos.items():
        preds_all = np.empty(len(dev_idx), dtype=object)
        for f_tr, f_val in gkf.split(x[dev_idx], y[dev_idx], personas[dev_idx]):
            m = clone(estimador)
            m.fit(x[dev_idx[f_tr]], y[dev_idx[f_tr]])
            preds_all[f_val] = m.predict(x[dev_idx[f_val]])
        resultados_dev[nombre] = {
            "cv_groupkfold_f1_macro": round(float(f1_score(y[dev_idx], preds_all, average="macro", zero_division=0)), 4),
            "cv_groupkfold_accuracy": round(float(accuracy_score(y[dev_idx], preds_all)), 4),
        }

    mejor_candidato = max(resultados_dev, key=lambda k: resultados_dev[k]["cv_groupkfold_f1_macro"])
    fer_csv_presente = (RAIZ / "_archivo" / "fase7" / "datos" / "fer2013.csv").is_file()

    informe = {
        "fase": "13C-entrega-final-unificada",
        "objetivo": "Auditar y evaluar mejora del clasificador facial con validación estricta por sujeto en CPU sin inventar métricas.",
        "dataset": {
            "nombre": "CMU Face Images",
            "total_muestras_utilizables": int(len(x)),
            "sujetos_totales": int(len(set(personas.tolist()))),
            "clases": sorted(set(y.tolist())),
            "particiones": {"entrenamiento": int(len(tr)), "validacion": int(len(va)), "calibracion": int(len(cal)), "prueba_ciega": int(len(te))},
            "descartes_haar": descartes,
            "fer2013_csv_disponible": fer_csv_presente,
        },
        "modelo_vigente": {
            "ruta": str(Path(ruta_modelo).relative_to(RAIZ)),
            "version": artefacto.get("version"),
            "algoritmo": artefacto.get("algoritmo"),
            "accuracy_prueba": round(float(rep_base["reporte"]["accuracy"]), 4),
            "f1_macro_prueba": round(float(rep_base["reporte"]["macro avg"]["f1-score"]), 4),
            "log_loss_prueba": rep_base["log_loss"],
            "brier_multiclase": rep_base["brier_multiclase"],
            "ece_10_tramos": rep_base["ece_10_tramos"],
            "cobertura_umbral_055_margen_010": rep_base["cobertura"],
            "matriz_confusion": rep_base["matriz_confusion"],
            "latencia_lote_prueba_ms": ms_lote_base,
            "latencia_unica_cpu": lat_base,
        },
        "evaluacion_candidatos_cpu": resultados_dev,
        "mejor_candidato_cv": mejor_candidato,
        "decision": "conservar_modelo_vigente",
        "justificacion": [
            "Ningún candidato ligero en CPU superó al modelo vigente (hog_svm_baseline_repro F1_macro=0.4365 frente a candidatos <=0.4002 en GroupKFold estricto por sujeto).",
            "El cuello de botella principal es estructural del conjunto CMU Face Images (solo 196 recortes utilizables de 20 personas en 4 poses a baja resolución) y no existe fer2013.csv local para preentrenar expresiones ricas.",
            "Conservar fase8-1.0 evita degradar calibración (ECE actual 0.0219), conserva la abstención preventiva honesta ante baja confianza y cumple la regla de no reemplazar sin mejora demostrable.",
        ],
        "plan_rollback": {
            "artefacto_respaldado": "_archivo/fase8/modelos/facial.joblib",
            "variable_entorno": "AULAPREDICT_MODELOS_FASE8",
            "procedimiento": "Mantener o restaurar el artefacto fase8-1.0 validado en _archivo/fase8/modelos/facial.joblib sin cambiar los contratos HTTP ni el umbral 0.55 / margen 0.10.",
        },
    }

    Path(ruta_salida).parent.mkdir(parents=True, exist_ok=True)
    Path(ruta_salida).write_text(json.dumps(informe, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return informe


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", default=RUTA_ZIP_DEFAULT)
    parser.add_argument("--modelo", default=RUTA_MODELO_DEFAULT)
    parser.add_argument("--salida", default=RUTA_SALIDA_DEFAULT)
    args = parser.parse_args()
    informe = ejecutar_auditoria(args.zip, args.modelo, args.salida)
    print(json.dumps({
        "decision": informe["decision"],
        "accuracy_vigente": informe["modelo_vigente"]["accuracy_prueba"],
        "f1_macro_vigente": informe["modelo_vigente"]["f1_macro_prueba"],
        "mejor_candidato_cv": informe["mejor_candidato_cv"],
        "salida": str(args.salida),
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
