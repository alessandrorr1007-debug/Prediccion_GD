"""Transformaciones idénticas durante entrenamiento e inferencia de Predicción."""
from functools import lru_cache
from io import BytesIO
from math import gcd
import wave

import cv2
import numpy as np
from scipy.fft import dct, irfft, rfft
from scipy.signal import resample_poly

DIM_AUDIO_FASE7 = 57


class EntradaInvalida(ValueError):
    pass


class SenalInsuficiente(ValueError):
    pass


@lru_cache(maxsize=1)
def banco_mel():
    frecuencias = np.fft.rfftfreq(512, 1 / 16000)
    bordes = 700 * (10 ** (np.linspace(0, 2595 * np.log10(1 + 8000 / 700), 28) / 2595) - 1)
    izquierda, centro, derecha = bordes[:-2, None], bordes[1:-1, None], bordes[2:, None]
    return np.maximum(0, np.minimum((frecuencias - izquierda) / (centro - izquierda),
                                    (derecha - frecuencias) / (derecha - centro)))


def preparar_audio(contenido):
    try:
        with wave.open(BytesIO(contenido), "rb") as wav:
            canales, ancho, tasa, muestras, compresion, _ = wav.getparams()
            if ancho != 2 or canales not in (1, 2) or not 8000 <= tasa <= 48000 or compresion != "NONE":
                raise EntradaInvalida("Se requiere WAV PCM16 mono o estéreo de 8 a 48 kHz.")
            duracion = muestras / tasa
            if duracion > 8:
                raise EntradaInvalida("El fragmento WAV no puede superar 8 segundos.")
            pcm = wav.readframes(muestras)
    except (wave.Error, EOFError, OverflowError) as error:
        raise EntradaInvalida("Archivo WAV inválido.") from error
    if len(pcm) != muestras * canales * ancho:
        raise EntradaInvalida("Archivo WAV truncado.")
    if duracion < .5:
        raise SenalInsuficiente("El fragmento debe durar al menos 0.5 segundos.")

    mono = np.frombuffer(pcm, dtype="<i2").reshape(-1, canales).mean(axis=1) / 32768
    factor = gcd(tasa, 16000)
    voz = resample_poly(mono - mono.mean(), 16000 // factor, tasa // factor)
    ventanas = np.lib.stride_tricks.sliding_window_view(voz, 400)[::160]
    rms = np.sqrt(np.mean(ventanas**2, axis=1))
    activas = rms >= max(.003, .05 * float(rms.max()))
    if activas.sum() < 20:
        raise SenalInsuficiente("No hay suficiente señal por encima del umbral de energía.")
    calidad = {"duracion_segundos": duracion, "fraccion_segmentos_activos": float(activas.mean())}
    return (voz, ventanas, rms, activas), calidad


def extraer_audio(senal, *, ampliado=False):
    voz, ventanas, rms, activas = senal
    espectro = np.abs(rfft(ventanas * np.hanning(400), n=512, axis=1)) ** 2
    mfcc = dct(np.log(np.maximum(espectro @ banco_mel().T, 1e-10)), type=2, norm="ortho", axis=1)[:, :13]
    delta = np.gradient(mfcc, axis=0)
    centroides = espectro @ np.fft.rfftfreq(512, 1 / 16000) / np.maximum(espectro.sum(axis=1), 1e-10)
    datos = [mfcc[activas].mean(axis=0), mfcc[activas].std(axis=0),
             delta[activas].mean(axis=0), delta[activas].std(axis=0),
             [rms[activas].mean(), rms[activas].std(), centroides[activas].mean(),
              centroides[activas].std(), activas.mean()]]
    if ampliado:
        datos.extend(rasgos_temporales(voz, ventanas, activas, rms, espectro, mfcc, delta))
    return np.concatenate(datos)


def rasgos_audio(contenido, *, ampliado=False):
    senal, calidad = preparar_audio(contenido)
    return extraer_audio(senal, ampliado=ampliado), calidad


def rasgos_temporales(voz, ventanas, activas, rms, espectro, mfcc, delta):
    delta2 = np.gradient(delta, axis=0)[activas]
    cruces = ((ventanas[:, 1:] >= 0) != (ventanas[:, :-1] >= 0)).mean(axis=1)[activas]
    acumulado = espectro.cumsum(axis=1)
    rolloff = (acumulado >= .85 * acumulado[:, -1:]).argmax(axis=1)[activas] * (16000 / 512)

    ventanas_tono = np.lib.stride_tricks.sliding_window_view(voz, 640)[::160]
    activas_tono = activas[:len(ventanas_tono)]
    segmentos = ventanas_tono[activas_tono]
    centrados = segmentos - segmentos.mean(axis=1, keepdims=True)
    acf = irfft(np.abs(rfft(centrados, n=1024, axis=1)) ** 2, axis=1)
    normalizada = acf[:, 39:242] / np.maximum(acf[:, :1], 1e-10)
    centro = normalizada[:, 1:-1]
    picos = (centro > normalizada[:, :-2]) & (centro >= normalizada[:, 2:])
    altura = np.where(picos, centro, 0).max(axis=1, keepdims=True)
    candidatos = picos & (centro >= np.maximum(.35, .85 * altura))
    sonoros = candidatos.any(axis=1)
    f0 = np.log(16000 / (40 + candidatos[sonoros].argmax(axis=1)))
    tono = [*np.percentile(f0, [10, 50, 90]), f0.std()] if len(f0) else [0.0] * 4

    activas_mfcc = mfcc[activas, :5]
    tercios = [tramo.mean(axis=0) for tramo in np.array_split(activas_mfcc, 3)]
    energia = np.percentile(rms[activas], [10, 50, 90])
    return [delta2.mean(axis=0), delta2.std(axis=0),
            [cruces.mean(), cruces.std(), rolloff.mean(), rolloff.std(), *tono,
             sonoros.sum() / max(len(sonoros), 1), *energia],
            *tercios]


def rasgos_fer(imagen):
    gris = cv2.resize(imagen, (48, 48), interpolation=cv2.INTER_AREA)
    hog = cv2.HOGDescriptor((48, 48), (16, 16), (8, 8), (8, 8), 9)
    return hog.compute(gris).ravel()
