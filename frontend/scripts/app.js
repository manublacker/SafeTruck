import { requestTruckRoute } from "./services/routeApiClient.js";
import { initializeRouteMap, renderRouteMap, renderEmptyMap } from "./ui/mapRenderer.js";
import { renderRouteSummary, setLoadingState } from "./ui/routePanel.js";

// Referencias a elementos del DOM para poder leer inputs y cambiar estados visuales.
const form = document.querySelector("#route-form");
const submitButton = document.querySelector("#submit-button");
const mapStatus = document.querySelector("#map-status");

// Primero se inicializa Leaflet y después se deja el mapa en estado inicial sin ruta dibujada.
initializeRouteMap();
renderEmptyMap();

// Este listener intercepta el submit del formulario y dispara la búsqueda de ruta.
form.addEventListener("submit", async (event) => {
  // Evita que el navegador recargue la página al enviar el formulario.
  event.preventDefault();

  const payload = buildRouteRequestPayload();

  try {
    setLoadingState(submitButton, true);
    mapStatus.textContent = "Calculando ruta con servicio mock";

    // Hoy esta función usa mock; cuando exista backend real puede hacer POST /api/routes.
    const routeResponse = await requestTruckRoute(payload);

    // Se actualiza el panel textual y el mapa con la respuesta recibida.
    renderRouteSummary(routeResponse);
    renderRouteMap(routeResponse);

    mapStatus.textContent = routeResponse.found
      ? "Ruta encontrada"
      : "No se encontró una ruta compatible";
  } catch (error) {
    renderRouteSummary({
      found: false,
      distanceM: 0,
      estimatedDurationMin: 0,
      path: [],
      routeSummary: "Ocurrió un error al calcular la ruta.",
      warnings: [error.message],
    });

    renderEmptyMap();
    mapStatus.textContent = "Error al renderizar la ruta";
  } finally {
    setLoadingState(submitButton, false);
  }
});

// Arma el objeto que representa el request de ruteo con la misma forma del contrato de API.
function buildRouteRequestPayload() {
  return {
    originLabel: document.querySelector("#origin-input").value.trim(),
    destinationLabel: document.querySelector("#destination-input").value.trim(),
    // Coordenadas fijas de prueba hasta que haya geocodificación real
    origin: { lat: -34.6037, lon: -58.3816 },
    destination: { lat: -34.5875, lon: -58.4370 },
    vehicle: {
      maxWeightKg: Number(document.querySelector("#weight-input").value),
      maxHeightM: Number(document.querySelector("#height-input").value),
      maxWidthM: Number(document.querySelector("#width-input").value),
      maxLengthM: Number(document.querySelector("#length-input").value),
    },
    routingOptions: {
      avoidTolls: document.querySelector("#avoid-tolls-input").checked,
      preferHighways: document.querySelector("#prefer-highways-input").checked,
    },
  };
}
