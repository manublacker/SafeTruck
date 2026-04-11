const BACKEND_URL = "http://localhost:3000";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

function normalizeQuery(query) {
  return query.trim().replace(/\s+/g, " ");
}

// Busca en el backend propio (calles de CABA con trigram similarity)
async function searchBackend(query) {
  const url = new URL(`${BACKEND_URL}/api/search`);
  url.searchParams.set("q", query);
  const response = await fetch(url.toString());
  if (!response.ok) return [];
  const { results } = await response.json();
  return results.map((r) => ({
    label: r.nombre.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
    lat: r.lat,
    lon: r.lon,
    score: parseFloat(r.score),
    source: "backend",
  }));
}

// Busca en Nominatim (direcciones específicas y lugares)
async function searchNominatim(query) {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", `${query}, Buenos Aires, Argentina`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "ar");
  url.searchParams.set("viewbox", "-58.5312,-34.5270,-58.3351,-34.7058");
  url.searchParams.set("bounded", "1");

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return [];
  const raw = await response.json();
  return raw.map((r) => ({
    label: (() => {
      const parts = r.display_name.split(",").map(s => s.trim());
      // Si el primer elemento es un número, es una dirección — la reordeno
      if (/^\d+$/.test(parts[0]) && parts[1]) {
        return `${parts[1]} ${parts[0]}`;
      }
      return parts.slice(0, 2).join(", ");
    })(),
    lat: Number(r.lat),
    lon: Number(r.lon),
    score: 0,
    source: "nominatim",
  }));
}

export async function searchLocations(query) {
  const q = normalizeQuery(query);
  if (q.length < 3) return [];

  // Corro ambas búsquedas en paralelo para no agregar latencia
  const [backendResults, nominatimResults] = await Promise.all([
    searchBackend(q),
    searchNominatim(q),
  ]);

  // Si el backend tiene resultados con buen score (>= 0.4), los muestro primero
  // y agrego los de Nominatim al final para cubrir direcciones y lugares
  const buenos = backendResults.filter((r) => r.score >= 0.5);
  const mediocres = backendResults.filter((r) => r.score < 0.4);

  // Combino: buenos del backend → Nominatim → mediocres del backend
  const combinados = [...buenos, ...nominatimResults, ...mediocres];

  // Deduplico por label para no mostrar la misma calle dos veces
  const vistos = new Set();
  return combinados.filter((r) => {
    const key = r.label.toLowerCase();
    if (vistos.has(key)) return false;
    vistos.add(key);
    return true;
  });
}

export async function geocodeLocation(query) {
  const results = await searchLocations(query);
  if (!results.length) {
    throw new Error("No encontramos una ubicacion valida para ese texto.");
  }
  return results[0];
}