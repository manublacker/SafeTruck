const DEFAULT_CENTER = [-34.6037, -58.3816];
const DEFAULT_ZOOM = 11;

// Estado interno del mapa y de las capas/marcadores actualmente dibujados.
let map = null;
let routeLayer = null;
let originMarker = null;
let destinationMarker = null;
let currentRoute = null;

const destinationIcon = createMarkerIcon("#dc2626");

export function initializeRouteMap() {
  // window.L es el objeto global que expone Leaflet cuando se carga su script CDN en index.html.
  if (!window.L) {
    throw new Error("Leaflet no está disponible. Revisá que el script CDN cargue antes de app.js.");
  }

  if (map) {
    return;
  }

  // Crea el mapa dentro del div #route-map y lo centra inicialmente en CABA/Buenos Aires.
  map = window.L.map("route-map", {
    zoomControl: true,
    scrollWheelZoom: true,
  }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

  // Tile layer de OpenStreetMap: son las "baldosas" visuales del mapa base.
  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
}

export function renderEmptyMap() {
  if (!map) {
    return;
  }

  // Limpia cualquier ruta previa y vuelve al encuadre inicial.
  clearCurrentRoute();
  currentRoute = null;
  map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
}

export function renderRouteMap(routeResponse) {
  if (!map) {
    return;
  }

  clearCurrentRoute();

  if (!routeResponse.found || routeResponse.path.length === 0) {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    return;
  }

  // Leaflet espera coordenadas en formato [lat, lon] para dibujar líneas y marcadores.
  const latLngs = routeResponse.path.map((point) => [point.lat, point.lon]);
  const originPoint = routeResponse.path[0];
  const destinationPoint = routeResponse.path[routeResponse.path.length - 1];
  currentRoute = routeResponse;
  const routeHeading = getRouteHeading(routeResponse.path);

  // Dibuja la ruta como una línea azul sobre el mapa.
  routeLayer = window.L.polyline(latLngs, {
    color: "#2563eb",
    weight: 7,
    opacity: 0.95,
  });
  routeLayer.addTo(map);

  // Marcador de origen.
  originMarker = window.L.marker([originPoint.lat, originPoint.lon], {
    icon: createRouteStartIcon(routeHeading),
    title: originPoint.label,
  })
    .addTo(map)
    .bindPopup(
      `<strong>Inicio del trayecto</strong><br><span class="route-popup">${originPoint.label}</span>`
    );

  // Marcador de destino.
  destinationMarker = window.L.marker([destinationPoint.lat, destinationPoint.lon], {
    icon: destinationIcon,
    title: destinationPoint.label,
  })
    .addTo(map)
    .bindPopup(
      `<strong>Destino</strong><br><span class="route-popup">${destinationPoint.label}</span>`
    );

  // Ajusta el zoom/encuadre para que toda la ruta quede visible.
  map.fitBounds(routeLayer.getBounds(), {
    padding: [48, 48],
    maxZoom: 15,
  });
}

export function focusRouteStart() {
  if (!map || !currentRoute?.found || !currentRoute.path?.length) {
    return;
  }

  const originPoint = currentRoute.path[0];
  map.setView([originPoint.lat, originPoint.lon], 17.5, {
    animate: true,
    duration: 0.8,
  });

  if (originMarker) {
    originMarker.openPopup();
  }
}

function clearCurrentRoute() {
  // Si ya había una polyline o marcadores dibujados, se eliminan antes de renderizar la nueva ruta.
  if (routeLayer) {
    routeLayer.remove();
    routeLayer = null;
  }

  if (originMarker) {
    originMarker.remove();
    originMarker = null;
  }

  if (destinationMarker) {
    destinationMarker.remove();
    destinationMarker = null;
  }
}

function getRouteHeading(path) {
  if (!Array.isArray(path) || path.length < 2) {
    return 0;
  }

  const start = path[0];
  const next = path[1];
  const deltaX = next.lon - start.lon;
  const deltaY = next.lat - start.lat;

  return (Math.atan2(deltaY, deltaX) * 180) / Math.PI;
}

function createRouteStartIcon(angle) {
  return window.L.divIcon({
    className: "",
    html: `
      <div style="
        position: relative;
        width: 74px;
        height: 74px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          position: absolute;
          width: 74px;
          height: 74px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(31, 102, 73, 0.22) 0%, rgba(31, 102, 73, 0) 68%);
        "></div>
        <div style="
          position: absolute;
          width: 56px;
          height: 56px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.92);
          border: 2px solid rgba(31, 102, 73, 0.14);
          box-shadow: 0 14px 26px rgba(18, 34, 28, 0.18);
        "></div>
        <div style="
          position: absolute;
          position: relative;
          z-index: 2;
          width: 50px;
          height: 50px;
          transform: rotate(${angle}deg);
          border-radius: 18px;
          background: linear-gradient(135deg, #1f6649 0%, #2f8b67 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 24px;
          box-shadow: 0 14px 26px rgba(18, 34, 28, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.24);
        ">
          <div style="
            position: absolute;
            right: -10px;
            width: 0;
            height: 0;
            border-top: 11px solid transparent;
            border-bottom: 11px solid transparent;
            border-left: 17px solid #1f6649;
            filter: drop-shadow(0 6px 12px rgba(18, 34, 28, 0.18));
          "></div>
          <div style="transform: rotate(${-angle}deg); line-height: 1;">🚚</div>
        </div>
      </div>
    `,
    iconSize: [74, 74],
    iconAnchor: [37, 37],
  });
}

function createMarkerIcon(color) {
  // Crea un marcador circular simple usando HTML/CSS embebido dentro de un DivIcon de Leaflet.
  return window.L.divIcon({
    className: "",
    html: `
      <div style="
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: ${color};
        border: 4px solid white;
        box-shadow: 0 10px 20px rgba(15, 23, 42, 0.2);
      "></div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

let userLocationMarker = null;
let watchId = null;

export function startLocationTracking(onLocationUpdate) {
  if (!navigator.geolocation) {
    console.warn("El navegador no soporta geolocalización.");
    return;
  }

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude, heading } = position.coords;

      // Muevo o creo el marcador del camión en la ubicación actual
      if (userLocationMarker) {
        userLocationMarker.setLatLng([latitude, longitude]);
      } else {
        userLocationMarker = window.L.marker([latitude, longitude], {
          icon: createRouteStartIcon(heading ?? 0),
          zIndexOffset: 1000,
        }).addTo(map);
      }

      // Llamo al callback para que app.js actualice el input de origen
      if (onLocationUpdate) {
        onLocationUpdate({ lat: latitude, lon: longitude });
      }
    },
    (error) => {
      console.warn("Error de geolocalización:", error.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 10000,
    }
  );
}

export function stopLocationTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}