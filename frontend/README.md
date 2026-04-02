# Frontend SafeTruck

Esta carpeta contiene una primera versión visual de la app y una capa de API simulada.

## Qué incluye

- `index.html`: estructura de la pantalla.
- `styles/main.css`: estilos visuales.
- `scripts/app.js`: coordinación de formulario, API y render.
- `scripts/services/routeApiClient.js`: cliente de API.
- `scripts/services/mockRouteService.js`: respuesta simulada mientras no exista backend real.
- `scripts/ui/mapRenderer.js`: dibujo de la ruta sobre un canvas.
- `scripts/ui/routePanel.js`: render del resumen y pasos de la ruta.

## Cómo correrlo

Opción 1, con Python:

```bash
cd frontend
python3 -m http.server 5500
```

Después abrir:

```text
http://localhost:5500
```

Opción 2, con Node si tenés instalado un servidor estático:

```bash
npx serve frontend
```

## Dependencias

Para esta versión visual no hace falta instalar librerías de frontend.

Sí necesitás una de estas dos opciones para servir archivos estáticos:

- Python 3, usando `python3 -m http.server`
- Node.js, usando `npx serve frontend`

## Cómo conectar backend real más adelante

En `scripts/services/routeApiClient.js` cambiar:

```js
const USE_MOCK_API = true;
```

por:

```js
const USE_MOCK_API = false;
```

Y asegurarse de que exista un backend escuchando `POST /api/routes`.
