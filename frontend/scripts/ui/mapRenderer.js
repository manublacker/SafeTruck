const DEFAULT_CENTER = [-34.6037, -58.3816];
const DEFAULT_ZOOM = 11;

// Estado interno del mapa y de las capas/marcadores actualmente dibujados.
let map = null;
let routeLayer = null;
let originMarker = null;
let destinationMarker = null;

const truckIcon = createMarkerIcon("#16a34a");
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

  // Dibuja la ruta como una línea azul sobre el mapa.
  routeLayer = window.L.polyline(latLngs, {
    color: "#2563eb",
    weight: 7,
    opacity: 0.95,
  });
  routeLayer.addTo(map);

  // Marcador de origen.
  originMarker = window.L.marker([originPoint.lat, originPoint.lon], {
    icon: truckIcon,
    title: originPoint.label,
  })
    .addTo(map)
    .bindPopup(`<strong>Origen</strong><br><span class="route-popup">${originPoint.label}</span>`);

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
