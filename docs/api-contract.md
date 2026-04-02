# Contrato mínimo de API - SafeTruck

Este documento define el formato esperado entre frontend y backend para calcular rutas.

## Endpoint

```http
POST /api/routes
Content-Type: application/json
```

## Request

```json
{
  "originLabel": "Depósito Villa Devoto",
  "destinationLabel": "Centro logístico Chacarita",
  "vehicle": {
    "maxWeightKg": 12000,
    "maxHeightM": 4.1,
    "maxWidthM": 2.5,
    "maxLengthM": 12
  },
  "routingOptions": {
    "avoidTolls": true,
    "preferHighways": true
  }
}
```

## Response exitosa

```json
{
  "found": true,
  "routeId": "route-123",
  "originLabel": "Depósito Villa Devoto",
  "destinationLabel": "Centro logístico Chacarita",
  "distanceM": 18450,
  "estimatedDurationMin": 34,
  "routeSummary": "Ruta sugerida por corredores principales.",
  "path": [
    {
      "nodeId": "1",
      "lat": -34.6022,
      "lon": -58.5139,
      "label": "Depósito Villa Devoto"
    },
    {
      "nodeId": "2",
      "lat": -34.5937,
      "lon": -58.4518,
      "label": "Corredor Warnes"
    }
  ],
  "warnings": []
}
```

## Response sin ruta

```json
{
  "found": false,
  "routeId": null,
  "originLabel": "Depósito Villa Devoto",
  "destinationLabel": "Centro logístico Chacarita",
  "distanceM": 0,
  "estimatedDurationMin": 0,
  "routeSummary": "No se encontró una ruta compatible con el perfil del camión.",
  "path": [],
  "warnings": [
    "Probá modificar restricciones o seleccionar otro destino."
  ]
}
```

## Responsabilidad de cada lado

- Frontend: arma el request, llama al endpoint, renderiza mapa y resumen.
- Backend: valida datos, convierte origen/destino a nodos reales, llama al algoritmo de rutas, devuelve la respuesta en este formato.

## Nota importante

El contrato usa `originLabel` y `destinationLabel` como campos provisorios para la UI actual.
Cuando el backend tenga geocodificación o selección real sobre mapa, conviene extender el request con coordenadas:

```json
{
  "origin": { "lat": -34.6022, "lon": -58.5139 },
  "destination": { "lat": -34.5874, "lon": -58.4551 }
}
```
