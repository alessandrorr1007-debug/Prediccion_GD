# AulaPredict · Frontend

Interfaz estática para probar la integración de IMAGEN, VIDEO y PREDICCIÓN mediante JSON.

## Conexión

- Servida por el backend en el puerto `8001`, usa rutas `/api` del mismo origen.
- Abierta localmente desde otro servidor, usa `http://127.0.0.1:8001`.
- Desplegada en Render, usa `https://prediccion-backend-dwq9.onrender.com`.

El backend debe incluir el dominio del sitio en `FRONTEND_ORIGINS`. El valor predeterminado ya permite `https://prediccion-frontend.onrender.com`.

## Render

Crear un **Static Site** con la rama `main`, sin comando de compilación y con `.` como directorio público.
