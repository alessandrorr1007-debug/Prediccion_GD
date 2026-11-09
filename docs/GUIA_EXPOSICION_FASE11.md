# Guía de exposición · AulaPredict

## Presentación

«AulaPredict es un prototipo académico para revisar evidencias de seguimiento. PREDICCIÓN recibe resultados de IMAGEN, VIDEO y AUDIO, comprueba sus referencias y ejecuta los modelos que corresponden. Una observación sin asociación verificada queda sin atribuir. El docente conserva la revisión de cualquier alerta».

Explica el recorrido **productor → contrato → validación → inferencia o reglas → panel**. Los adaptadores de IMAGEN y VIDEO normalizan objetos y eventos. AUDIO puede aportar un WAV o descriptores, y asistencia y participación se incorporan como registros normalizados. Las exportaciones autorizadas de los equipos siguen pendientes. [Contratos e integración](INTEGRACION_FASE11.md)

## Inteligencia artificial

| Componente | Entrenamiento y evaluación | Qué mostrar |
|---|---|---|
| Facial | HOG + SVM con CMU, separado por persona. 36.8 % de exactitud histórica y 0 % de cobertura | Probabilidades, abstención y límite del corpus |
| Vocal | Regresión logística con rasgos acústicos de RAVDESS, separado por actor. 42.5 % de exactitud y 4.6 % de cobertura histórica | Patrones expresivos actuados. CREMA-D obtuvo 16.7 % de exactitud externa |
| Académico | Regresión logística UCI con G1/G2, calibración separada. 88.8 % de exactitud histórica y ROC-AUC de 0.971 | Desenlace `G3 < 10/20` al corte posterior a G2. Las reglas de seguimiento se muestran aparte |
| Fusión | Regresión logística con audio y unidades de acción de RAVDESS, separada por actor. 67.5 % de exactitud, 40 % de cobertura y ECE de 0.150 | Solo pareja pública verificada y solicitud explícita |

La cobertura mide cuántos casos reciben una categoría. La abstención se activa cuando el máximo o el margen son insuficientes. Los umbrales se validaron fuera de la prueba histórica. La calibración relaciona puntajes con frecuencias observadas en el corpus y puede degradarse en otro dominio. [Resultados y matrices](ENTRENAMIENTO_FASE9.md)

## Demostración

1. Inicia con `iniciar_aulapredict.bat` y abre [el panel local](http://127.0.0.1:8001/) en Chrome.
2. En **Demostración integral**, pulsa **Verificar sistema**. Ejecuta A para mostrar notas, asistencia y probabilidad UCI.
3. Ejecuta B para contrastar un cero registrado con notas faltantes. Explica cómo se obtiene la prioridad por reglas.
4. Ejecuta C y señala la procedencia pública de la imagen y el WAV, las abstenciones y la ausencia de identidad atribuida. Si están disponibles los artefactos, activa la fusión para la pareja RAVDESS.
5. Ejecuta D para mostrar el motivo de exclusión. Pulsa **Reiniciar** y vuelve a ejecutar los cuatro casos si necesitas cerrar con una vista conjunta. [Prueba manual completa](PRUEBA_MANUAL_LOCAL.md)

## Preguntas del profesor

- **¿Qué datos y modelos usaron?** CMU para expresiones faciales, RAVDESS para audio y fusión, UCI para notas y CREMA-D como evaluación externa de voz. Se compararon alternativas ligeras adecuadas para CPU.
- **¿Cómo evitaron sobreajuste y cómo midieron precisión?** Se separaron personas o actores completos cuando existían identificadores. Se usaron particiones separadas para ajuste, selección y calibración. Las matrices y métricas corresponden a los conjuntos documentados, con referencia histórica ya expuesta en Fase 9.
- **¿Qué significa abstenerse?** El modelo informa probabilidades y retiene la categoría cuando el máximo o la distancia al segundo resultado son insuficientes.
- **¿Qué ocurre si falta AUDIO o VIDEO?** Las modalidades válidas siguen por su propia ruta. El panel muestra la ausencia y la fusión requiere la pareja verificada.
- **¿Cómo validan identidad?** Mediante una asociación explícita y referenciada del integrador, dentro de una sesión válida. Una asociación contradictoria o ausente deja la observación sin atribuir.
- **¿Cómo calculan el riesgo académico?** La prioridad de revisión usa reglas sobre contexto educativo. El modelo supervisado estima exclusivamente `G3 < 10/20` con G1 y G2. Las expresiones quedan fuera de ambos cálculos.
- **¿Cómo se integran los cuatro equipos?** Con contratos JSON y adaptadores de PREDICCIÓN. Hoy la verificación con productores se limita a fixtures y muestras públicas claramente identificadas.
- **¿Cuáles son las limitaciones y qué sigue?** Faltan exportaciones autorizadas, FER2013 y validación en población objetivo. El paso siguiente es revisar archivos reales con cada equipo y comprobar temporalidad, procedencia y campos antes de activar cualquier integración adicional.
