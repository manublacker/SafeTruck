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

  // Agrupo nodos consecutivos por nombre de calle para generar instrucciones
  const instrucciones = [];
  let calleActual = null;
  let distanciaActual = 0;

  for (let i = 0; i < routeResponse.path.length - 1; i++) {
    const punto = routeResponse.path[i];
    const siguiente = routeResponse.path[i + 1];
    const calle = punto.label || "Calle sin nombre";

    const dLat = (siguiente.lat - punto.lat) * Math.PI / 180;
    const dLon = (siguiente.lon - punto.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(punto.lat * Math.PI/180) * Math.cos(siguiente.lat * Math.PI/180) * Math.sin(dLon/2)**2;
    const distM = 6371000 * 2 * Math.asin(Math.sqrt(a));

    if (calle === calleActual) {
      distanciaActual += distM;
    } else {
      if (calleActual !== null) {
        instrucciones.push({ calle: calleActual, distanciaM: distanciaActual });
      }
      calleActual = calle;
      distanciaActual = distM;
    }
  }
  if (calleActual) instrucciones.push({ calle: calleActual, distanciaM: distanciaActual });

  routeSteps.innerHTML = instrucciones
  .filter(inst => inst.calle !== "Calle sin nombre")
  .map((inst, index) => {
    const dist = inst.distanciaM >= 1000
      ? `${(inst.distanciaM / 1000).toFixed(1)} km`
      : `${Math.round(inst.distanciaM)} m`;
    const accion = index === 0 ? "Salir por" : "Continuar por";
    return `<li><strong>${accion}</strong> ${toTitleCase(inst.calle)} <small>${dist}</small></li>`;
  })
  .join("");

  if (routeResponse.warnings?.length) {
    routeSteps.innerHTML += routeResponse.warnings
      .map((warning) => `<li class="warning-item">${warning}</li>`)
      .join("");
  }
} 
function toTitleCase(str) {
  const minusculas = new Set(["de", "del", "la", "las", "el", "los", "y", "en", "a", "al"]);
  return str
    .toLowerCase()
    .replace(/\b\w+/g, (word, offset) => {
      if (offset === 0) return word.charAt(0).toUpperCase() + word.slice(1);
      return minusculas.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1);
    });
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
  if (distanceM >= 1000) {
    return `${(distanceM / 1000).toFixed(2)} km`;
  }
  return `${Math.round(distanceM)} m`;
}