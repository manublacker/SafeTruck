/*******************************************************
 * search.ts
 *
 * Endpoint GET /api/search
 * Busca lugares (calles, comercios, intersecciones)
 * en la base de datos usando similitud de trigramas.
 *
 * Tolera:
 *   - Mayúsculas y minúsculas mezcladas
 *   - Tildes ausentes o incorrectas ("cordoba" → "Córdoba")
 *   - Errores tipográficos leves ("zeneise" → "Zeneize")
 *   - Búsqueda parcial por substring
 *
 * Flujo de una request:
 *   1. Recibo el parámetro ?q= con el texto a buscar
 *   2. Normalizo el texto (minúsculas + unaccent)
 *   3. Busco con similitud de trigramas en red_vial y
 *      en la tabla de lugares de OSM si existe
 *   4. Devuelvo los resultados ordenados por relevancia
 *******************************************************/

import { Router, Request, Response } from "express";
import pool from "../db";

const router = Router();

// Umbral mínimo de similitud para considerar un resultado válido.
// 0.1 es permisivo: acepta coincidencias parciales.
// Subir a 0.3 para resultados más estrictos.
const SIMILARITY_THRESHOLD = 0.1;

// Cantidad máxima de resultados a devolver
const MAX_RESULTS = 10;

router.get("/", async (req: Request, res: Response) => {
  const q = (req.query.q as string | undefined)?.trim();

  // Si no hay texto, devuelvo vacío en vez de explotar
  if (!q || q.length < 2) {
    res.json({ results: [] });
    return;
  }

  try {
    // Busco en red_vial (calles de CABA) combinando dos estrategias:
    //   1. ILIKE '%texto%' con unaccent → encuentra substrings exactos sin importar tildes/mayúsculas
    //   2. similarity() con pg_trgm    → encuentra resultados parecidos aunque haya errores tipográficos
    //
    // Uso UNION para combinar ambas estrategias y evitar duplicados.
    // El ORDER BY final prioriza los más similares al texto buscado.
    const result = await pool.query(
      `
      SELECT
        nombre,
        tipo,
        lat,
        lon,
        similarity(unaccent(lower(nombre)), unaccent(lower($1))) AS score
      FROM (

        -- Estrategia 1: substring exacto (sin importar tildes ni mayúsculas)
        -- Útil cuando el usuario escribe el inicio del nombre correctamente
        SELECT
          nombre,
          tipo,
          ST_Y(ST_Centroid(geom)) AS lat,
          ST_X(ST_Centroid(geom)) AS lon
        FROM vw_lugares
        WHERE unaccent(lower(nombre)) ILIKE '%' || unaccent(lower($1)) || '%'
        LIMIT 50

        UNION

        -- Estrategia 2: similitud de trigramas (tolera typos y nombres incompletos)
        -- Útil cuando el usuario escribe mal o el nombre está en otro orden
        SELECT
          nombre,
          tipo,
          ST_Y(ST_Centroid(geom)) AS lat,
          ST_X(ST_Centroid(geom)) AS lon
        FROM vw_lugares
        WHERE similarity(unaccent(lower(nombre)), unaccent(lower($1))) > $2
        LIMIT 50

      ) AS combinados
      ORDER BY score DESC
      LIMIT $3
      `,
      [q, SIMILARITY_THRESHOLD, MAX_RESULTS]
    );

    const results = result.rows.map((row) => ({
      nombre: row.nombre,
      tipo: row.tipo,
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