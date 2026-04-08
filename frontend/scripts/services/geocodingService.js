const GEOCODING_BASE_URL = "https://nominatim.openstreetmap.org/search";

function normalizeQuery(query) {
  return query.trim().replace(/\s+/g, " ");
}

export async function searchLocations(query) {
  const normalizedQuery = normalizeQuery(query);

  if (normalizedQuery.length < 3) {
    return [];
  }

  const url = new URL(GEOCODING_BASE_URL);
  url.searchParams.set("q", `${normalizedQuery}, Buenos Aires, Argentina`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "ar");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("No se pudieron obtener sugerencias de ubicaciones.");
  }

  const rawResults = await response.json();

  return rawResults.map((result) => ({
    label: result.display_name,
    lat: Number(result.lat),
    lon: Number(result.lon),
  }));
}

export async function geocodeLocation(query) {
  const results = await searchLocations(query);

  if (!results.length) {
    throw new Error("No encontramos una ubicacion valida para ese texto.");
  }

  return results[0];
}
