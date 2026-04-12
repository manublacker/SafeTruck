import { requestTruckRoute } from "./services/routeApiClient.js";
import { geocodeLocation, searchLocations } from "./services/geocodingService.js";
import { focusRouteStart, initializeRouteMap, renderRouteMap, renderEmptyMap, startLocationTracking } from "./ui/mapRenderer.js";
import { renderRouteSummary, setLoadingState } from "./ui/routePanel.js";

// Referencias a elementos del DOM para poder leer inputs y cambiar estados visuales.
const form = document.querySelector("#route-form");
const submitButton = document.querySelector("#submit-button");
const mapStatus = document.querySelector("#map-status");
const originInput = document.querySelector("#origin-input");
const destinationInput = document.querySelector("#destination-input");
const originStatus = document.querySelector("#origin-status");
const destinationStatus = document.querySelector("#destination-status");
const originSuggestions = document.querySelector("#origin-suggestions");
const destinationSuggestions = document.querySelector("#destination-suggestions");
const focusStartButton = document.querySelector("#focus-start-button");

const locationFields = {
  origin: {
    input: originInput,
    status: originStatus,
    suggestions: originSuggestions,
    selectedLocation: null,
    debounceTimer: null,
  },
  destination: {
    input: destinationInput,
    status: destinationStatus,
    suggestions: destinationSuggestions,
    selectedLocation: null,
    debounceTimer: null,
  },
};

// Primero se inicializa Leaflet y después se deja el mapa en estado inicial sin ruta dibujada.
initializeRouteMap();
renderEmptyMap();
initializeGeocodingField("origin");
initializeGeocodingField("destination");
focusStartButton?.addEventListener("click", () => {
  focusRouteStart();
});

// Inicio el tracking de ubicación
startLocationTracking(({ lat, lon }) => {
  // Solo actualizo el input si el usuario no escribió nada todavía
  if (!locationFields.origin.selectedLocation) {
    locationFields.origin.selectedLocation = { lat, lon, label: "Mi ubicación" };
    originInput.value = "Mi ubicación";
    setFieldStatus(locationFields.origin, `Ubicación actual: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
  }
});

// Este listener intercepta el submit del formulario y dispara la búsqueda de ruta.
form.addEventListener("submit", async (event) => {
  // Evita que el navegador recargue la página al enviar el formulario.
  event.preventDefault();

  try {
    setLoadingState(submitButton, true);
    mapStatus.textContent = "Validando ubicaciones";

    const payload = await buildRouteRequestPayload();

    mapStatus.textContent = "Calculando ruta con API real";

    const routeResponse = await requestTruckRoute(payload);

    // Se actualiza el panel textual y el mapa con la respuesta recibida.
    renderRouteSummary(routeResponse);
    renderRouteMap(routeResponse);
    document.querySelector(".route-sheet").classList.add("visible");
    if (focusStartButton) {
      focusStartButton.disabled = !routeResponse.found;
    }

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
    if (focusStartButton) {
      focusStartButton.disabled = true;
    }
    mapStatus.textContent = "Error al renderizar la ruta";
  } finally {
    setLoadingState(submitButton, false);
  }
});

// Arma el objeto que representa el request de ruteo con la misma forma del contrato de API.
async function buildRouteRequestPayload() {
  const origin = await resolveLocation("origin");
  const destination = await resolveLocation("destination");

  return {
    originLabel: locationFields.origin.selectedLocation?.label ?? originInput.value.trim(),
    destinationLabel:
      locationFields.destination.selectedLocation?.label ?? destinationInput.value.trim(),
    origin: { lat: origin.lat, lon: origin.lon },
    destination: { lat: destination.lat, lon: destination.lon },
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

function initializeGeocodingField(fieldKey) {
  const field = locationFields[fieldKey];

  field.input.addEventListener("input", () => {
    field.selectedLocation = null;
    setFieldStatus(field, "Buscando sugerencias...");
    clearSuggestions(field);

    if (field.debounceTimer) {
      window.clearTimeout(field.debounceTimer);
    }

    const query = field.input.value.trim();
    if (query.length < 3) {
      setFieldStatus(field, "Escribí al menos 3 caracteres para buscar una ubicacion.");
      return;
    }

    field.debounceTimer = window.setTimeout(async () => {
      try {
        const suggestions = await searchLocations(query);

        if (!suggestions.length) {
          setFieldStatus(field, "No encontramos sugerencias para ese texto.");
          clearSuggestions(field);
          return;
        }

        renderSuggestions(field, suggestions);
        setFieldStatus(field, "Elegí una sugerencia para fijar coordenadas reales.");
      } catch (error) {
        clearSuggestions(field);
        setFieldStatus(field, error.message);
      }
    }, 350);
  });

  field.input.addEventListener("blur", () => {
    window.setTimeout(() => {
      clearSuggestions(field);
    }, 150);
  });
}

async function resolveLocation(fieldKey) {
  const field = locationFields[fieldKey];

  if (field.selectedLocation) {
    return field.selectedLocation;
  }

  setFieldStatus(field, "Resolviendo coordenadas...");
  const resolvedLocation = await geocodeLocation(field.input.value.trim());
  field.selectedLocation = resolvedLocation;
  field.input.value = resolvedLocation.label;
  setFieldStatus(field, formatConfirmedLocation(resolvedLocation));

  return resolvedLocation;
}

function renderSuggestions(field, suggestions) {
  field.suggestions.innerHTML = suggestions
    .map(
      (suggestion, index) =>
        `<li><button type="button" data-index="${index}">${suggestion.label}</button></li>`
    )
    .join("");
  field.suggestions.hidden = false;

  const buttons = field.suggestions.querySelectorAll("button");
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const suggestion = suggestions[Number(button.dataset.index)];
      field.selectedLocation = suggestion;
      field.input.value = suggestion.label;
      setFieldStatus(field, formatConfirmedLocation(suggestion));
      clearSuggestions(field);
      // Actualizo el trigger móvil si se seleccionó el destino
    });
  });
}

function clearSuggestions(field) {
  field.suggestions.innerHTML = "";
  field.suggestions.hidden = true;
}

function setFieldStatus(field, message) {
  field.status.textContent = message;
}

function formatConfirmedLocation(location) {
  return `Ubicacion confirmada: ${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}`;
}
