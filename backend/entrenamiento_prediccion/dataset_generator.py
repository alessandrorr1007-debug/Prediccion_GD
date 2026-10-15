"""
Generador de Dataset de Características Faciales y Proyección Académica
Módulo de Predicción (AulaPredict) - Sistema de Supervisión Inteligente
"""
import numpy as np
import pandas as pd

def generar_dataset_facial(n_samples: int = 4000, random_state: int = 42):
    """
    Genera un conjunto sintético calibrado de métricas faciales geométricas
    (apertura ocular, inclinación de cejas, curvatura de boca, inclinación cefálica, estabilidad de mirada)
    asociadas a los 4 estados emocionales académicos:
    0: Distracción / Fatiga (😴)
    1: Estrés / Ansiedad (😟)
    2: Tristeza / Desatención (😢)
    3: Neutral / Concentración (😊)
    """
    rng = np.random.RandomState(random_state)
    muestras_por_clase = n_samples // 4

    registros = []

    # CLASE 0: Distracción / Fatiga (😴)
    # Rasgos: Ojos entrecerrados o pesados, parpadeo lento, bostezo/boca abierta, cabeza inclinada hacia abajo
    for _ in range(muestras_por_clase):
        eye_open = rng.normal(loc=0.28, scale=0.08)
        eye_open = np.clip(eye_open, 0.05, 0.55)
        eyebrow_slope = rng.normal(loc=-0.15, scale=0.12)
        mouth_smile = rng.normal(loc=-0.10, scale=0.10)
        mouth_open = rng.normal(loc=0.35, scale=0.15)
        mouth_open = np.clip(mouth_open, 0.05, 0.90)
        head_tilt = rng.normal(loc=18.0, scale=8.0)  # Inclinación / cabeceo
        gaze_stability = rng.normal(loc=0.35, scale=0.12)
        blink_rate = rng.normal(loc=0.75, scale=0.10)
        registros.append({
            "eye_openness": eye_open,
            "eyebrow_slope": eyebrow_slope,
            "mouth_smile": mouth_smile,
            "mouth_open": mouth_open,
            "head_tilt": head_tilt,
            "gaze_stability": gaze_stability,
            "blink_rate": blink_rate,
            "label_emocion": 0,
            "nombre_emocion": "fatiga"
        })

    # CLASE 1: Estrés / Ansiedad (😟)
    # Rasgos: Cejas fruncidas/tensas, boca apretada (mouth_open bajo), mirada errática, cabeza rígida
    for _ in range(muestras_por_clase):
        eye_open = rng.normal(loc=0.60, scale=0.10)
        eye_open = np.clip(eye_open, 0.30, 0.85)
        eyebrow_slope = rng.normal(loc=0.55, scale=0.14)  # Ceño fruncido
        mouth_smile = rng.normal(loc=-0.25, scale=0.12)  # Tensión labial
        mouth_open = rng.normal(loc=0.08, scale=0.04)   # Labios apretados
        mouth_open = np.clip(mouth_open, 0.01, 0.20)
        head_tilt = rng.normal(loc=5.0, scale=5.0)
        gaze_stability = rng.normal(loc=0.45, scale=0.15)
        blink_rate = rng.normal(loc=0.82, scale=0.09)
        registros.append({
            "eye_openness": eye_open,
            "eyebrow_slope": eyebrow_slope,
            "mouth_smile": mouth_smile,
            "mouth_open": mouth_open,
            "head_tilt": head_tilt,
            "gaze_stability": gaze_stability,
            "blink_rate": blink_rate,
            "label_emocion": 1,
            "nombre_emocion": "estres"
        })

    # CLASE 2: Tristeza / Desatención (😢)
    # Rasgos: Comisuras de labios bajas, cejas arqueadas internamente, mirada baja/perdida
    for _ in range(muestras_por_clase):
        eye_open = rng.normal(loc=0.42, scale=0.09)
        eye_open = np.clip(eye_open, 0.20, 0.65)
        eyebrow_slope = rng.normal(loc=-0.40, scale=0.12) # Cejas caídas en bordes
        mouth_smile = rng.normal(loc=-0.50, scale=0.12)  # Comisuras caídas
        mouth_open = rng.normal(loc=0.12, scale=0.06)
        mouth_open = np.clip(mouth_open, 0.02, 0.30)
        head_tilt = rng.normal(loc=12.0, scale=6.0)
        gaze_stability = rng.normal(loc=0.25, scale=0.10) # Mirada dispersa/vacía
        blink_rate = rng.normal(loc=0.45, scale=0.12)
        registros.append({
            "eye_openness": eye_open,
            "eyebrow_slope": eyebrow_slope,
            "mouth_smile": mouth_smile,
            "mouth_open": mouth_open,
            "head_tilt": head_tilt,
            "gaze_stability": gaze_stability,
            "blink_rate": blink_rate,
            "label_emocion": 2,
            "nombre_emocion": "tristeza"
        })

    # CLASE 3: Neutral / Concentración (😊)
    # Rasgos: Ojos abiertos y enfocados, cejas relajadas, ligera sonrisa o boca relajada, cabeza alineada
    for _ in range(muestras_por_clase):
        eye_open = rng.normal(loc=0.72, scale=0.08)
        eye_open = np.clip(eye_open, 0.50, 0.95)
        eyebrow_slope = rng.normal(loc=0.02, scale=0.08)
        mouth_smile = rng.normal(loc=0.20, scale=0.12)
        mouth_open = rng.normal(loc=0.10, scale=0.05)
        mouth_open = np.clip(mouth_open, 0.02, 0.25)
        head_tilt = rng.normal(loc=2.0, scale=3.0)       # Cabeza erguida y centrada
        gaze_stability = rng.normal(loc=0.88, scale=0.06) # Mirada fija en sesión
        blink_rate = rng.normal(loc=0.35, scale=0.08)
        registros.append({
            "eye_openness": eye_open,
            "eyebrow_slope": eyebrow_slope,
            "mouth_smile": mouth_smile,
            "mouth_open": mouth_open,
            "head_tilt": head_tilt,
            "gaze_stability": gaze_stability,
            "blink_rate": blink_rate,
            "label_emocion": 3,
            "nombre_emocion": "concentracion"
        })

    df = pd.DataFrame(registros).sample(frac=1.0, random_state=random_state).reset_index(drop=True)
    return df

def generar_dataset_sucesos_y_riesgo(n_samples: int = 4000, random_state: int = 42):
    """
    Genera dataset para entrenar el modelo probabilístico de acontecimientos previos,
    consecuencias futuras (riesgo de jalar examen parcial) y score heurístico de desempeño (0-100).
    """
    rng = np.random.RandomState(random_state)
    registros = []

    for _ in range(n_samples):
        # Generar distribución de emociones tipo Dirichlet
        alpha = rng.exponential(scale=1.0, size=4) + 0.1
        emociones = rng.dirichlet(alpha)
        p_fatiga, p_estres, p_tristeza, p_concentracion = emociones

        # Presencia de distracción física o mirada desviada
        distractor = 1.0 if (rng.rand() < (0.45 * p_fatiga + 0.35 * p_estres + 0.25 * p_tristeza)) else 0.0
        gaze_desviada = 1.0 if (rng.rand() < (0.50 * p_fatiga + 0.40 * p_tristeza)) else 0.0

        # Causas Previas (% Probabilidad 0-100)
        # 1. Sobrecarga o desvelo: fuertemente correlacionado con fatiga
        prob_desvelo = np.clip(p_fatiga * 85 + p_estres * 20 + rng.normal(5, 4), 5, 96)
        
        # 2. Conflicto personal / decaimiento emocional: correlacionado con tristeza y estrés
        prob_conflicto = np.clip(p_tristeza * 88 + p_estres * 18 + rng.normal(4, 4), 5, 95)
        
        # 3. Presión académica por exámenes o entregas cercanas: correlacionado con estrés
        prob_presion = np.clip(p_estres * 86 + p_fatiga * 15 + rng.normal(5, 4), 5, 94)
        
        # 4. Descanso adecuado y preparación previa: correlacionado con concentración
        prob_descanso = np.clip(p_concentracion * 92 + rng.normal(4, 3), 4, 98)

        # Consecuencias Futuras (% Probabilidad 0-100)
        # Riesgo de desaprobar ("jalar") el examen parcial:
        # Alto si hay fatiga, distractor, estrés o tristeza; bajo si hay concentración alta
        riesgo_base = (
            p_fatiga * 0.45 +
            p_estres * 0.30 +
            p_tristeza * 0.35 +
            distractor * 0.35 +
            gaze_desviada * 0.20 -
            p_concentracion * 0.50
        )
        # Normalizar a 0 - 100
        score_riesgo = np.clip(riesgo_base * 75 + 30 + rng.normal(0, 3), 5, 98)
        
        prob_jalar_parcial = np.clip(score_riesgo * 0.95 + rng.normal(2, 3), 8, 96)
        prob_bloqueo_retencion = np.clip(score_riesgo * 0.88 + p_fatiga * 12 + rng.normal(0, 3), 10, 95)

        registros.append({
            "p_fatiga": p_fatiga,
            "p_estres": p_estres,
            "p_tristeza": p_tristeza,
            "p_concentracion": p_concentracion,
            "distractor": distractor,
            "gaze_desviada": gaze_desviada,
            "prob_desvelo": prob_desvelo,
            "prob_conflicto": prob_conflicto,
            "prob_presion": prob_presion,
            "prob_descanso": prob_descanso,
            "prob_jalar_parcial": prob_jalar_parcial,
            "prob_bloqueo_retencion": prob_bloqueo_retencion,
            "score_riesgo": score_riesgo
        })

    return pd.DataFrame(registros)
