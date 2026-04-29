/*******************************************************
 * route.ts
 *
 * Define el endpoint POST /api/routes.
 * Recibe coordenadas de origen y destino junto con el
 * perfil del camión, calcula la ruta usando A* y devuelve
 * el resultado en el formato del contrato de API.
 *
 * Flujo de una request:
 *   1. Valido que lleguen los campos obligatorios
 *   2. Busco el nodo del grafo más cercano al origen
 *   3. Busco el nodo del grafo más cercano al destino
 *   4. Cargo el grafo completo desde la base de datos
 *   5. Ejecuto A* entre los dos nodos
 *   6. Armo y devuelvo la respuesta
 *******************************************************/

import { Router, Request, Response } from "express";
import { findTruckRoute } from "../algorithm/astar";
import pool from "../db";

const router = Router();

async function snapToRoads(points: Array<{lat: number, lon: number}>): Promise<Array<{lat: number, lon: number}>> {
  const apiKey = process.env.GOOGLE_ROADS_API_KEY;
  if (!apiKey || points.length === 0) return points;
  
  const path = points.map(p => `${p.lat},${p.lon}`).join('|');
  const url = `https://roads.googleapis.com/v1/snapToRoads?path=${encodeURIComponent(path)}&interpolate=true&key=${apiKey}`;
  
  const res = await fetch(url);
  const data = await res.json();
  
  if (!data.snappedPoints) return points;
  
  return data.snappedPoints.map((p: any) => ({
    lat: p.location.latitude,
    lon: p.location.longitude,
  }));
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
    const resOrigen = await pool.query(
      "SELECT id, lat, lon FROM nearest_graph_node($1, $2)",
      [origin.lon, origin.lat]
    );

    const resDestino = await pool.query(
      "SELECT id, lat, lon FROM nearest_graph_node($1, $2)",
      [destination.lon, destination.lat]
    );

    if (resOrigen.rows.length === 0 || resDestino.rows.length === 0) {
      res.status(404).json({
        found: false,
        routeId: null,
        originLabel: originLabel ?? "",
        destinationLabel: destinationLabel ?? "",
        distanceM: 0,
        estimatedDurationMin: 0,
        routeSummary: "No se encontró un nodo cercano.",
        path: [],
        warnings: ["Verificá que las coordenadas estén dentro del área cubierta."],
      });
      return;
    }

    const nodoOrigen = resOrigen.rows[0];
    const nodoDestino = resDestino.rows[0];

    const resGrafo = await pool.query("SELECT export_graph_json(FALSE)");
const grafo = resGrafo.rows[0]["export_graph_json"];

// cargo los scores cooperativos por separado (query liviana) y los aplico al grafo en memoria
const resScores = await pool.query(
  "SELECT arista_id, score, status FROM edge_trust_scores"
);
const scoreMap: Record<number, { score: number; status: string }> = {};
for (const row of resScores.rows) {
  scoreMap[row.arista_id] = { score: row.score, status: row.status };
}

// aplico trustScore y trustStatus a cada arista del grafo
for (const nodeId of Object.keys(grafo.adjacency)) {
  for (const edge of grafo.adjacency[nodeId]) {
    const s = scoreMap[edge.aristaId];
    if (s) {
      edge.trustScore = s.score;
      edge.trustStatus = s.status;
    }
  }
}

    const resultado = findTruckRoute(
      grafo,
      String(nodoOrigen.id),
      String(nodoDestino.id),
      vehicle
    );

    if (!resultado.found) {
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

    const path = await Promise.all(resultado.path.map(async (nodeId: string, index: number) => {
      let label = "";
      let geometry: Array<{lat: number, lon: number}> = [];
      let aristaId: number | undefined = undefined;
    
      if (index < resultado.path.length - 1) {
        const siguienteId = resultado.path[index + 1];
        const resArista = await pool.query(
          `SELECT rv.nombre_buscable,
              ST_AsGeoJSON(a.geom) AS geom_json,
              a.source AS src,
              a.id AS arista_id
           FROM aristas a
           JOIN red_vial rv ON rv.id = a.red_vial_id
           WHERE (a.source = $1::integer AND a.target = $2::integer)
              OR (a.source = $2::integer AND a.target = $1::integer)
           ORDER BY a.costo ASC LIMIT 1`,
          [nodeId, siguienteId]
        );
        if (resArista.rows.length > 0) {
          label = resArista.rows[0].nombre_buscable ?? "";
          aristaId = resArista.rows[0].arista_id ?? undefined;
          if (resArista.rows[0].geom_json) {
            const geoj = JSON.parse(resArista.rows[0].geom_json);
            const coords = geoj.coordinates.map(([lon, lat]: [number, number]) => ({ lat, lon }));
            const esInversa = resArista.rows[0].src !== Number(nodeId);
            geometry = esInversa ? coords.reverse() : coords;
          }
        }
      }
    
      return {
        nodeId,
        lat: grafo.nodes[nodeId].lat,
        lon: grafo.nodes[nodeId].lon,
        label,
        geometry,
        aristaId,      
      };
    }));

    let distanciaRealM = 0;
    for (let i = 0; i < resultado.path.length - 1; i++) {
      const desde = resultado.path[i];
      const hasta = resultado.path[i + 1];
      const resArista = await pool.query(
        `SELECT LEAST(costo, 10000) AS costo FROM aristas 
         WHERE source = $1::integer AND target = $2::integer 
         ORDER BY costo ASC LIMIT 1`,
        [desde, hasta]
      );
      if (resArista.rows.length > 0) {
        distanciaRealM += resArista.rows[0].costo;
      }
    }

    // Junto todos los puntos de geometría en un array plano para hacer snap-to-road
    const allGeometryPoints: Array<{lat: number, lon: number}> = [];
    for (const point of path) {
      if (point.geometry && point.geometry.length > 0) {
        allGeometryPoints.push(...point.geometry);
      } else {
        allGeometryPoints.push({ lat: point.lat, lon: point.lon });
      }
    }

    // Snap-to-road en chunks de 100 puntos (límite de la API)
    const CHUNK_SIZE = 100;
    const snappedPoints: Array<{lat: number, lon: number}> = [];
    for (let i = 0; i < allGeometryPoints.length; i += CHUNK_SIZE) {
      const chunk = allGeometryPoints.slice(i, i + CHUNK_SIZE);
      const snapped = await snapToRoads(chunk);
      snappedPoints.push(...snapped);
    }

    const velocidadMs = 30000 / 3600;

// guardo el viaje en la DB para el sistema cooperativo
// extraigo los arista_ids recorridos desde el path ya armado
const aristaIds: number[] = [];
for (const point of path) {
  if (point.aristaId !== undefined) {
    aristaIds.push(point.aristaId);
  }
}

let tripId: number | null = null;
try {
  const resTrip = await pool.query(
    `INSERT INTO trips 
      (user_id, origin_lat, origin_lon, destination_lat, destination_lon, arista_ids, distance_m)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      req.user?.id ?? null,
      origin.lat,
      origin.lon,
      destination.lat,
      destination.lon,
      aristaIds,
      Math.round(distanciaRealM),
    ]
  );
  tripId = resTrip.rows[0].id;
} catch (err) {
  // si falla el guardado del viaje, no cortamos el flujo — la ruta igual se devuelve
  console.error("No se pudo guardar el viaje en trips:", err);
}

res.status(200).json({
  found: true,
  routeId: `route-${Date.now()}`,
  tripId,
  originLabel: originLabel ?? "",
  destinationLabel: destinationLabel ?? "",
  distanceM: Math.round(distanciaRealM),
  estimatedDurationMin: Math.round(distanciaRealM / velocidadMs / 60),
  routeSummary: "Ruta calculada correctamente.",
  path,
  snappedPoints,
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