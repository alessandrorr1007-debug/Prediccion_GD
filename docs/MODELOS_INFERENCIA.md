# Modelos de inferencia

## Configurar los modelos reproducibles

Instala primero el perfil base con Python 3.11.15, scikit-learn 1.9.1, Joblib y OpenCV. En Windows, desde la raíz del clon, descarga los archivos originales de [CMU Face Images](https://archive.ics.uci.edu/dataset/124/cmu+face+images), [Student Performance](https://archive.ics.uci.edu/dataset/320/student+performance) y [RAVDESS](https://zenodo.org/records/1188976). RAVDESS de Steven R. Livingstone y Frank A. Russo se ofrece bajo CC BY-NC-SA 4.0. Para uso comercial, consulta la licencia que ofrecen sus titulares.

```powershell
New-Item -ItemType Directory -Force _archivo/datos | Out-Null
curl.exe -fL 'https://archive.ics.uci.edu/static/public/124/cmu%2Bface%2Bimages.zip' -o _archivo/datos/cmu.zip
curl.exe -fL 'https://archive.ics.uci.edu/static/public/320/student+performance.zip' -o _archivo/datos/uci.zip
curl.exe -fL 'https://zenodo.org/api/records/1188976/files/Audio_Speech_Actors_01-24.zip/content' -o _archivo/datos/ravdess.zip
$python = './backend/.venv/Scripts/python.exe'
& $python -m backend.entrenamiento_prediccion.entrenar_fase7 academico _archivo/datos/uci.zip --salida _archivo/fase7/modelos
& $python -m backend.entrenamiento_prediccion.entrenar_cmu_fase8 _archivo/datos/cmu.zip --salida _archivo/fase8/modelos --sin-cnn
& $python -m backend.entrenamiento_prediccion.entrenar_audio_fase8 _archivo/datos/ravdess.zip --salida _archivo/fase8/modelos
$env:AULAPREDICT_MODELOS_FASE7 = (Resolve-Path _archivo/fase7/modelos).Path
$env:AULAPREDICT_MODELOS_FASE8 = (Resolve-Path _archivo/fase8/modelos).Path
& $python -m uvicorn backend.app:app --host 127.0.0.1 --port 8001 --no-proxy-headers
```

En Linux, usa `backend/.venv/bin/python` y exporta las dos variables con las rutas absolutas. Comprueba la presencia con `GET /api/prediccion/modelos-investigacion` y la inferencia con una entrada válida de la [guía HTTP](GUIA_INTEGRACION_PREDICCION.md). La presencia en disco y la carga compatible se comprueban por separado. El motor selecciona Fase 8 para cara y voz cuando está configurada y es compatible. La proyección académica usa Fase 7.

## Pesos YOLO opcionales

Instala `backend/requirements-yolo.txt` en un entorno separado. Para usar `best.pt`, obtén del proveedor una copia autorizada con procedencia, condiciones de uso y suma SHA-256. Para pose está disponible [el peso oficial YOLO11n-pose](https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n-pose.pt). Revisa las obligaciones de [Ultralytics](https://www.ultralytics.com/license) para tu despliegue. Configura `AULAPREDICT_YOLO_DIR` con el directorio de pesos y reinicia el servidor. `AULAPREDICT_DETECTOR_OBJETOS=off` deshabilita el detector local de objetos en el análisis experimental. Las exportaciones IMAGEN/VIDEO pueden aportar detecciones mediante la API.

Solo carga archivos de confianza. Pickle, Joblib y los checkpoints PyTorch pueden ejecutar código durante la deserialización. Verifica la huella con `Get-FileHash -Algorithm SHA256 <archivo>` o `sha256sum <archivo>`.

## Inventario auditado

Las huellas corresponden a los binarios inspeccionados. Una regeneración con otro entorno o versiones transitivas puede producir bytes distintos. Los dos modelos sintéticos históricos están en `backend/entrenamiento_prediccion/`. Los modelos de investigación y los pesos YOLO se instalan o regeneran localmente. El mayor modelo del inventario ocupa aproximadamente 32 MiB. [Límite por archivo en GitHub](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github).

Las licencias de los datasets y de Ultralytics se aplican a sus respectivos materiales. El repositorio AulaPredict carece de una licencia general declarada. Para redistribuir el código o los artefactos sintéticos históricos, consulta al titular del proyecto.

- **Facial CMU, Fase 8.** `facial.joblib`, 392636 bytes. SHA-256 `affa025e60567aec2eaf050552ead3f7bf4c1a771e92c1d4fcc3468773a67595`. HOG + SVM. Reentrenamiento local con CMU Face Images de Tom Mitchell, DOI `10.24432/C5JC79`, CC BY 4.0.
- **Acústico RAVDESS, Fase 8.** `audio.joblib`, 11097 bytes. SHA-256 `8714f3e562aef841b06e90a60e6160da7c30d258cdd14d0e6fabfcd31fa40a3a`. Reentrenamiento local bajo las condiciones de RAVDESS.
- **Acústico RAVDESS, Fase 7.** `audio.joblib`, 1117623 bytes. SHA-256 `69d4a0d59b2a7da75c69e5b19325a3c2cf014cb64a0f551d5c44d1e44ccca248`. Respaldo reproducible con [Fase 7](ENTRENAMIENTO_FASE7.md).
- **Académico UCI, Fase 7.** `academico.joblib`, 1284 bytes. SHA-256 `01ee2da2f81ab4222b174f86ed5c2475a18d9439adafc0b89dfeaf8a84a9a5dc`. Reentrenamiento local con Student Performance de Paulo Cortez, DOI `10.24432/C5TG7T`, CC BY 4.0.
- **Facial histórico.** `modelo_emociones_facial.pkl`, 3112921 bytes. SHA-256 `de3492b5cc3a849709e3b377b2f9153d29370572aca1a193c97b251378889485`. Artefacto sintético ya versionado. Respaldo experimental sin calibración en rostros reales.
- **Académico histórico.** `modelo_sucesos_academicos.pkl`, 33326682 bytes. SHA-256 `619d5f77cc55498e6aadc69d127bd0a32d1fb867b907dd4a8c57172d5fed24e3`. Artefacto sintético ya versionado, independiente de UCI.
- **Detector YOLOv8n.** `best.pt`, 6252394 bytes. SHA-256 `1422b2478dafd6744739b576dced7a462d7ba0679d15f347d385664bee6d7565`. El ID de blob Git coincide con el de [SistemaSupervisionExamenes, revisión ee0a1ab](https://github.com/cesarcabanillas1921-bit/SistemaSupervisionExamenes/blob/ee0a1ab28e5311d2204915b8ef0681d5f80fdde1/modelo_ia/best.pt). El repositorio productor no declara licencia. Sigue pendiente acreditar el corpus de entrenamiento y el permiso de redistribución del peso.
- **Detector de pose YOLO11n.** `yolo11n-pose.pt`, 6255593 bytes. SHA-256 `869e83fcdffdc7371fa4e34cd8e51c838cc729571d1635e5141e3075e9319dc0`, verificado contra la descarga oficial v8.3.0.
- **Fusión acústica y unidades de acción faciales, Fase 9.** `fusion.joblib`, 26093 bytes. SHA-256 `2741a68c08e680303c4a2ab0f81eb1e130f2006a5ffd2cb89949b528d54728f1`. Generación local con pares RAVDESS y Facial Landmark Tracking. Sigue [Fase 9](ENTRENAMIENTO_FASE9.md).
