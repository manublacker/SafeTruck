/*******************************************************
 * route.ts
 *
 * Define el endpoint POST /api/routes.
 * Calcula la ruta usando pgr_aStar directamente en la DB
 * en vez de cargar el grafo completo en memoria.
 *
 * Flujo de una request:
 *   1. Valido que lleguen los campos obligatorios
 *   2. Llamo a route_truck() en Supabase (pgr_aStar)
 *   3. Armo el path con geometría y labels de calles
 *   4. Calculo distancia real y duración estimada
 *   5. Guardo el viaje en trips
 *   6. Devuelvo la respuesta
 *******************************************************/

import { Router, Request, Response } from "express";
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

async function buildPath(nodePath: Array<{ node: number; edge: number; lat: number; lon: number }>) {
  return Promise.all(nodePath.map(async (punto, index) => {
    let label = "";
    let geometry: Array<{lat: number, lon: number}> = [];
    let aristaId: number | undefined = undefined;

    if (index < nodePath.length - 1) {
      const siguienteNode = nodePath[index + 1].node;
      const resArista = await pool.query(
        `SELECT
            COALESCE(rv.nombre_buscable, '') AS nombre_buscable,
            ST_AsGeoJSON(a.geom) AS geom_json,
            a.source AS src,
            a.id AS arista_id
         FROM aristas a
         LEFT JOIN red_vial rv ON rv.id = a.red_vial_id
         WHERE (a.source = $1::integer AND a.target = $2::integer)
            OR (a.source = $2::integer AND a.target = $1::integer)
         ORDER BY a.costo ASC LIMIT 1`,
        [punto.node, siguienteNode]
      );

      if (resArista.rows.length > 0) {
        label = resArista.rows[0].nombre_buscable ?? "";
        aristaId = resArista.rows[0].arista_id ?? undefined;
        if (resArista.rows[0].geom_json) {
          const geoj = JSON.parse(resArista.rows[0].geom_json);
          const coords = geoj.coordinates.map(([lon, lat]: [number, number]) => ({ lat, lon }));
          const esInversa = resArista.rows[0].src !== punto.node;
          geometry = esInversa ? [...coords].reverse() : coords;
        }
      }
    }

    return {
      nodeId: String(punto.node),
      lat: punto.lat,
      lon: punto.lon,
      label,
      geometry,
      aristaId,
    };
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
    // calculo la ruta normal con pgr_aStar en la DB
    const resRuta = await pool.query(
      "SELECT route_truck($1::double precision, $2::double precision, $3::double precision, $4::double precision, 'normal')",
      [origin.lon, origin.lat, destination.lon, destination.lat]
    );

    const rutaData = resRuta.rows[0]["route_truck"];

    if (!rutaData?.found || !rutaData?.path) {
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

    const nodePath: Array<{ node: number; edge: number; lat: number; lon: number }> = rutaData.path;

    // calculo la ruta alternativa (evitando incidentes)
    const resRutaAlt = await pool.query(
      "SELECT route_truck($1::double precision, $2::double precision, $3::double precision, $4::double precision, 'alternative')",
      [origin.lon, origin.lat, destination.lon, destination.lat]
    );

    const rutaAltData = resRutaAlt.rows[0]["route_truck"];
    const nodePathAlt: Array<{ node: number; edge: number; lat: number; lon: number }> | null =
      rutaAltData?.found && rutaAltData?.path ? rutaAltData.path : null;

    const sonIguales = nodePathAlt &&
      nodePathAlt.map((p: any) => p.node).join(',') === nodePath.map((p: any) => p.node).join(',');

    // armo el path principal con geometría y labels
    const path = await buildPath(nodePath);

    // armo el path alternativo si es distinto al principal
    const pathAlternativo = nodePathAlt && !sonIguales
      ? await buildPath(nodePathAlt)
      : null;

    // calculo distancia real sumando costos de aristas (sin penalizaciones)
    let distanciaRealM = 0;
    for (let i = 0; i < nodePath.length - 1; i++) {
      const desde = nodePath[i].node;
      const hasta = nodePath[i + 1].node;
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

    // calculo distancia de la ruta alternativa
    let distanciaAlternativaM = 0;
    if (pathAlternativo && nodePathAlt) {
      for (let i = 0; i < nodePathAlt.length - 1; i++) {
        const desde = nodePathAlt[i].node;
        const hasta = nodePathAlt[i + 1].node;
        const resArista = await pool.query(
          `SELECT LEAST(costo, 10000) AS costo FROM aristas
           WHERE source = $1::integer AND target = $2::integer
           ORDER BY costo ASC LIMIT 1`,
          [desde, hasta]
        );
        if (resArista.rows.length > 0) {
          distanciaAlternativaM += resArista.rows[0].costo;
        }
      }
    }

    // junto todos los puntos de geometría para snap-to-road
    const allGeometryPoints: Array<{lat: number, lon: number}> = [];
    for (const point of path) {
      if (point.geometry && point.geometry.length > 0) {
        allGeometryPoints.push(...point.geometry);
      } else {
        allGeometryPoints.push({ lat: point.lat, lon: point.lon });
      }
    }

    // snap-to-road en chunks de 100 puntos
    const CHUNK_SIZE = 100;
    const snappedPoints: Array<{lat: number, lon: number}> = [];
    for (let i = 0; i < allGeometryPoints.length; i += CHUNK_SIZE) {
      const chunk = allGeometryPoints.slice(i, i + CHUNK_SIZE);
      const snapped = await snapToRoads(chunk);
      snappedPoints.push(...snapped);
    }

    // guardo el viaje en trips para el sistema cooperativo
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
      // si falla el guardado del viaje, no cortamos el flujo
      console.error("No se pudo guardar el viaje en trips:", err);
    }

    const velocidadMs = 30000 / 3600;

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
      alternativeRoute: pathAlternativo ? {
        path: pathAlternativo,
        distanceM: Math.round(distanciaAlternativaM),
        estimatedDurationMin: Math.round(distanciaAlternativaM / velocidadMs / 60),
      } : null,
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