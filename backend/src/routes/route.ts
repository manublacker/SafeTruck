import { Router, Request, Response } from "express";
import pool from "../db";

const router = Router();

const VELOCIDAD_MS = 30000 / 3600; // 30 km/h en m/s

async function snapToRoads(points: Array<{ lat: number; lon: number }>): Promise<Array<{ lat: number; lon: number }>> {
  const apiKey = process.env.GOOGLE_ROADS_API_KEY;
  if (!apiKey || points.length === 0) return points;

  const CHUNK_SIZE = 100;
  const snapped: Array<{ lat: number; lon: number }> = [];

  for (let i = 0; i < points.length; i += CHUNK_SIZE) {
    const chunk = points.slice(i, i + CHUNK_SIZE);
    const path = chunk.map((p) => `${p.lat},${p.lon}`).join("|");
    const url = `https://roads.googleapis.com/v1/snapToRoads?path=${encodeURIComponent(path)}&interpolate=true&key=${apiKey}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.snappedPoints) {
        snapped.push(...data.snappedPoints.map((p: any) => ({ lat: p.location.latitude, lon: p.location.longitude })));
      } else {
        snapped.push(...chunk);
      }
    } catch {
      snapped.push(...chunk);
    }
  }
  return snapped;
}

router.post("/", async (req: Request, res: Response) => {
  const { originLabel, destinationLabel, vehicle, origin, destination } = req.body;

  if (!origin || !destination || !vehicle) {
    res.status(400).json({
      found: false,
      routeId: null,
      originLabel: originLabel ?? "",
      destinationLabel: destinationLabel ?? "",
      distanceM: 0,
      estimatedDurationMin: 0,
      routeSummary: "Faltan campos obligatorios.",
      path: [],
      warnings: ["Enviá origin, destination y vehicle en el body."],
    });
    return;
  }

  try {
    // pgRouting A* en la base — un solo round-trip, sin cargar el grafo en memoria
    const resRuta = await pool.query(
      "SELECT route_truck($1, $2, $3, $4) AS result",
      [origin.lon, origin.lat, destination.lon, destination.lat]
    );

    const resultado = resRuta.rows[0].result;

    if (!resultado.found || !resultado.path) {
      res.status(200).json({
        found: false,
        routeId: null,
        originLabel: originLabel ?? "",
        destinationLabel: destinationLabel ?? "",
        distanceM: 0,
        estimatedDurationMin: 0,
        routeSummary: "No se encontró una ruta compatible con el perfil del camión.",
        path: [],
        warnings: ["Probá modificar restricciones o seleccionar otro destino."],
      });
      return;
    }

    const pathNodes: Array<{ seq: number; node: number; edge: number; cost: number; lat: number; lon: number }> =
      resultado.path;

    // Traer geometría y nombre de todas las aristas en un solo query
    const edgeIds = pathNodes.filter((p) => p.edge !== -1).map((p) => p.edge);

    const resEdges = await pool.query(
      `SELECT a.id, a.source, rv.nombre_buscable, ST_AsGeoJSON(a.geom) AS geom_json
       FROM aristas a
       LEFT JOIN red_vial rv ON rv.id = a.red_vial_id
       WHERE a.id = ANY($1)`,
      [edgeIds]
    );

    const edgeMap: Record<number, { source: number; nombre: string; coords: Array<{ lat: number; lon: number }> }> = {};
    for (const row of resEdges.rows) {
      const geoj = JSON.parse(row.geom_json);
      edgeMap[row.id] = {
        source: row.source,
        nombre: row.nombre_buscable ?? "",
        coords: geoj.coordinates.map(([lon, lat]: [number, number]) => ({ lat, lon })),
      };
    }

    // Armar path con geometría orientada en la dirección correcta
    const path = pathNodes.map((p) => {
      const edge = edgeMap[p.edge];
      let geometry: Array<{ lat: number; lon: number }> = [];
      if (edge) {
        geometry = edge.source === p.node ? edge.coords : [...edge.coords].reverse();
      }
      return {
        nodeId: String(p.node),
        lat: p.lat,
        lon: p.lon,
        label: edge?.nombre ?? "",
        geometry,
        aristaId: p.edge !== -1 ? p.edge : undefined,
      };
    });

    const distanciaRealM = pathNodes.reduce((sum, p) => sum + (p.cost ?? 0), 0);
    const aristaIds = pathNodes.filter((p) => p.edge !== -1).map((p) => p.edge);

    // Snap-to-road opcional
    const allPoints: Array<{ lat: number; lon: number }> = [];
    for (const p of path) {
      if (p.geometry.length > 0) allPoints.push(...p.geometry);
      else allPoints.push({ lat: p.lat, lon: p.lon });
    }
    const snappedPoints = await snapToRoads(allPoints);

    // Guardar viaje para el sistema cooperativo
    let tripId: number | null = null;
    try {
      const resTrip = await pool.query(
        `INSERT INTO trips (user_id, origin_lat, origin_lon, destination_lat, destination_lon, arista_ids, distance_m)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [req.user?.id ?? null, origin.lat, origin.lon, destination.lat, destination.lon, aristaIds, Math.round(distanciaRealM)]
      );
      tripId = resTrip.rows[0].id;
    } catch (err) {
      console.error("No se pudo guardar el viaje en trips:", err);
    }

    res.status(200).json({
      found: true,
      routeId: `route-${Date.now()}`,
      tripId,
      originLabel: originLabel ?? "",
      destinationLabel: destinationLabel ?? "",
      distanceM: Math.round(distanciaRealM),
      estimatedDurationMin: Math.round(distanciaRealM / VELOCIDAD_MS / 60),
      routeSummary: "Ruta calculada correctamente.",
      path,
      snappedPoints,
      alternativeRoute: null,
      warnings: [],
    });
  } catch (error) {
    console.error("Error en /api/routes:", error);
    res.status(500).json({
      found: false,
      routeId: null,
      originLabel: originLabel ?? "",
      destinationLabel: destinationLabel ?? "",
      distanceM: 0,
      estimatedDurationMin: 0,
      routeSummary: "Error interno del servidor.",
      path: [],
      warnings: ["Contactá al equipo de backend."],
    });
  }
});

export default router;
