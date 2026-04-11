/*******************************************************
 * search.ts
 *
 * Endpoint GET /api/search
 * Busca calles en la base de datos usando similitud de
 * trigramas sobre el nombre normalizado (nombre_buscable).
 *******************************************************/

import { Router, Request, Response } from "express";
import pool from "../db";

const router = Router();

const SIMILARITY_THRESHOLD = 0.2;
const MAX_RESULTS = 10;

router.get("/", async (req: Request, res: Response) => {
  const q = (req.query.q as string | undefined)?.trim();

  if (!q || q.length < 2) {
    res.json({ results: [] });
    return;
  }

  try {
    const result = await pool.query(
        `
        SELECT
          MIN(nombre) AS nombre,
          nombre_buscable,
          ST_Y(ST_Centroid(ST_Union(geom))) AS lat,
          ST_X(ST_Centroid(ST_Union(geom))) AS lon,
          GREATEST(
            MAX(similarity(unaccent_immutable(lower(nombre_buscable)), unaccent_immutable(lower($1)))),
            CASE WHEN unaccent_immutable(lower(MIN(nombre_buscable))) ILIKE '%' || unaccent_immutable(lower($1)) || '%' THEN 0.5 ELSE 0 END
          ) AS score
        FROM red_vial
        WHERE nombre_buscable IS NOT NULL
          AND (
            unaccent_immutable(lower(nombre_buscable)) ILIKE '%' || unaccent_immutable(lower($1)) || '%'
            OR similarity(unaccent_immutable(lower(nombre_buscable)), unaccent_immutable(lower($1))) > $2
          )
        GROUP BY nombre_buscable
        ORDER BY score DESC
        LIMIT $3
        `,
        [q, SIMILARITY_THRESHOLD, MAX_RESULTS]
      );

    const results = result.rows.map((row) => ({
      nombre: row.nombre_buscable,
      nombreOriginal: row.nombre,
      lat: parseFloat(row.lat),
      lon: parseFloat(row.lon),
      score: parseFloat(row.score).toFixed(2),
    }));

    res.json({ results });
  } catch (err) {
    console.error("Error en búsqueda:", err);
    res.status(500).json({ results: [], error: "Error interno al buscar." });
  }
});

export default router;