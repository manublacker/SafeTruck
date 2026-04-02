// Ruta simulada para poder diseñar y probar la interfaz antes de tener backend real.
const MOCK_ROUTE = {
  found: true,
  routeId: "mock-route-devoto-chacarita",
  distanceM: 18450,
  estimatedDurationMin: 34,
  routeSummary:
    "Ruta sugerida por corredores principales, evitando zonas no habilitadas para tránsito pesado en esta demo visual.",
  path: [
    { nodeId: "n-devoto", lat: -34.6022, lon: -58.5139, label: "Depósito Villa Devoto" },
    { nodeId: "n-san-martin", lat: -34.5987, lon: -58.4974, label: "Av. San Martín" },
    { nodeId: "n-paternal", lat: -34.5965, lon: -58.4733, label: "La Paternal" },
    { nodeId: "n-warnes", lat: -34.5937, lon: -58.4518, label: "Corredor Warnes" },
    { nodeId: "n-chacarita", lat: -34.5874, lon: -58.4551, label: "Centro logístico Chacarita" },
  ],
  warnings: [
    "Respuesta simulada: todavía no proviene de astar.ts ni de PostgreSQL.",
    "El endpoint final puede conservar este formato y reemplazar solo la fuente de datos.",
  ],
};

// Simula el comportamiento de un endpoint backend devolviendo una Promise con formato de response real.
export async function fetchMockTruckRoute(payload) {
  await wait(700);

  // Validación mínima para imitar una respuesta de error funcional.
  if (!payload.originLabel || !payload.destinationLabel) {
    return {
      found: false,
      routeId: null,
      distanceM: 0,
      estimatedDurationMin: 0,
      routeSummary: "Faltan datos de origen o destino.",
      path: [],
      warnings: ["Completá origen y destino para calcular una ruta."],
    };
  }

  return {
    ...MOCK_ROUTE,
    originLabel: payload.originLabel,
    destinationLabel: payload.destinationLabel,
    vehicle: payload.vehicle,
    routingOptions: payload.routingOptions,
  };
}

// Pequeña demora artificial para que la UI muestre estado de carga como si hubiera una request real.
function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}
