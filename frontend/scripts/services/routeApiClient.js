import { fetchMockTruckRoute } from "./mockRouteService.js";

const API_BASE_URL = "http://192.168.1.18:3000";
// Mientras no exista backend real, dejamos activado el servicio simulado.
const USE_MOCK_API = false;

// Esta función es la puerta de salida del frontend hacia la API de rutas.
export async function requestTruckRoute(payload) {
  if (USE_MOCK_API) {
    return fetchMockTruckRoute(payload);
  }

  // Cuando USE_MOCK_API pase a false, este bloque enviará el request HTTP real al backend.
  const response = await fetch(`${API_BASE_URL}/api/routes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status}`);
  }

  // Convierte el JSON de respuesta en un objeto JavaScript usable por la UI.
  return response.json();
}
