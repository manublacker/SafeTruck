// Elementos del panel inferior que se actualizan cuando llega una respuesta de ruta.
const routeTitle = document.querySelector("#route-title");
const routeSummary = document.querySelector("#route-summary");
const routeSteps = document.querySelector("#route-steps");

// Renderiza título, resumen y pasos del recorrido a partir de la respuesta de API/mock.
export function renderRouteSummary(routeResponse) {
  if (!routeResponse.found) {
    routeTitle.textContent = "No se encontró una ruta";
    routeSummary.textContent =
      routeResponse.routeSummary || "Probá cambiar origen, destino o restricciones del camión.";
    renderWarnings(routeResponse.warnings);
    return;
  }

  routeTitle.textContent = `${routeResponse.originLabel} → ${routeResponse.destinationLabel}`;
  routeSummary.textContent = `${routeResponse.routeSummary} Distancia estimada: ${formatDistance(
    routeResponse.distanceM
  )}. Tiempo estimado: ${routeResponse.estimatedDurationMin} min.`;

  // Se arma una lista HTML con cada punto del recorrido y sus coordenadas.
  routeSteps.innerHTML = routeResponse.path
    .map(
      (point, index) =>
        `<li><strong>${index + 1}.</strong> ${point.label} <small>(${point.lat.toFixed(
          4
        )}, ${point.lon.toFixed(4)})</small></li>`
    )
    .join("");

  if (routeResponse.warnings?.length) {
    routeSteps.innerHTML += routeResponse.warnings
      .map((warning) => `<li class="warning-item">${warning}</li>`)
      .join("");
  }
}

// Cambia el estado visual del botón mientras la ruta "se calcula".
export function setLoadingState(button, isLoading) {
  button.disabled = isLoading;
  button.textContent = isLoading ? "Calculando..." : "Calcular ruta";
}

function renderWarnings(warnings = []) {
  routeSteps.innerHTML = warnings.map((warning) => `<li>${warning}</li>`).join("");
}

function formatDistance(distanceM) {
  // Muestra metros o kilómetros según la magnitud de la distancia.
  if (distanceM >= 1000) {
    return `${(distanceM / 1000).toFixed(2)} km`;
  }

  return `${Math.round(distanceM)} m`;
}
