/*******************************************************
 * importar.ts
 *
 * Script de importación de datos geoespaciales a PostgreSQL/PostGIS.
 * Carga las fuentes en las tablas red_vial y red_camiones.
 *
 * Uso:
 *   # Local (defaults a localhost:5432/safetruck)
 *   npx ts-node database/import/importar.ts
 *
 *   # Supabase / Postgres remoto
 *   DATABASE_URL=postgresql://... npx ts-node database/import/importar.ts
 *
 *   # Solo un partido (requiere haber corrido scripts/descargar_red_vial_partido.py
 *   # y scripts/geocodificar_municipio.py para ese partido antes)
 *   npx ts-node database/import/importar.ts --partido la-matanza
 *
 *   # CABA + rutas nacionales + Lanús + nuevos partidos
 *   npx ts-node database/import/importar.ts --all
 *
 * Orden de ejecución esperado en una BD nueva:
 *   1. importar.ts        ← este script
 *   2. 02_topology.sql
 *   3. 03_restrictions.sql / 06_importar_red_camiones_kml.sql
 *   4. 10_refresh_restricciones.sql (por partido nuevo)
 *******************************************************/

import fs from "fs";
import path from "path";
import { Client, ClientConfig } from "pg";

// ---------------------------------------------------------------------------
// Conexión a la base
// ---------------------------------------------------------------------------
const DB_CONFIG: ClientConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    }
  : {
      host: process.env.PGHOST ?? "localhost",
      port: Number(process.env.PGPORT ?? 5432),
      database: process.env.PGDATABASE ?? "safetruck",
      user: process.env.PGUSER ?? "postgres",
      password: process.env.PGPASSWORD ?? "postgres",
    };

// ---------------------------------------------------------------------------
// Rutas a los archivos de datos
// ---------------------------------------------------------------------------
const DATA_DIR = path.join(process.cwd(), "database", "data");

const ARCHIVOS = {
  redVialCABA:    path.join(DATA_DIR, "base", "red-vial-CABA.geojson"),
  rutasNacionales: path.join(DATA_DIR, "base", "rutas-nacionales.geojson"),
  redCamiones:    path.join(DATA_DIR, "restricciones", "CABA - Red de Tránsito Pesado.json"),
  redVialLanus:   path.join(DATA_DIR, "base", "red-vial-lanus.geojson"),
};

// Para cada partido nuevo: GeoJSON OSM + JSON de tramos por nombre
function archivosPartido(slug: string) {
  return {
    redVial:        path.join(DATA_DIR, "base", `red-vial-${slug}.geojson`),
    tramosPorNombre: path.join(DATA_DIR, "restricciones", `tramos-por-nombre-${slug}.json`),
  };
}

// Partidos del conurbano que vamos a soportar (uno por uno).
// Slug → { nombre legible, jurisdiccion }
const PARTIDOS_NUEVOS: Record<string, { nombre: string; jurisdiccion: string }> = {
  "la-matanza": { nombre: "La Matanza", jurisdiccion: "Buenos Aires" },
};

// ---------------------------------------------------------------------------
// Tipos GeoJSON
// ---------------------------------------------------------------------------
interface LineStringGeometry {
  type: "LineString";
  coordinates: number[][];
}

interface MultiLineStringGeometry {
  type: "MultiLineString";
  coordinates: number[][][];
}

interface GeoJSONFeature {
  type: "Feature";
  id?: string;
  properties: Record<string, unknown>;
  geometry: LineStringGeometry | MultiLineStringGeometry;
}

interface GeoJSONCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

interface TramoPorNombre {
  calle: string;
  calle_normalizada: string;
  desde: string | null;
  hasta: string | null;
  tramo: string | null;
  jerarquia: string | null;
  notas: string | null;
  ilike_pattern: string;
  ref_buscar: string | null;
  cantidad_matches: number;
  match_ref: boolean;
}

interface ArchivoTramosPorNombre {
  partido: string;
  slug: string;
  tramos: TramoPorNombre[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function leerGeoJSON(rutaArchivo: string): GeoJSONCollection {
  console.log(`Leyendo: ${rutaArchivo}`);
  const contenido = fs.readFileSync(rutaArchivo, "utf-8");
  return JSON.parse(contenido) as GeoJSONCollection;
}

function geometriaALineStrings(
  geom: LineStringGeometry | MultiLineStringGeometry
): string[] {
  if (geom.type === "LineString") {
    const coords = geom.coordinates.map((c) => `${c[0]} ${c[1]}`).join(", ");
    return [`LINESTRING(${coords})`];
  }
  return geom.coordinates.map((linea) => {
    const coords = linea.map((c) => `${c[0]} ${c[1]}`).join(", ");
    return `LINESTRING(${coords})`;
  });
}

function normalizarSentido(raw: unknown): string {
  if (typeof raw !== "string") return "DOBLE MANO";
  const upper = raw.toUpperCase().trim();
  if (upper === "CRECIENTE") return "CRECIENTE";
  if (upper === "DECRECIENTE") return "DECRECIENTE";
  return "DOBLE MANO";
}

function toTextOrNull(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  return String(val);
}

function parseArgs(): { all: boolean; partido: string | null } {
  const args = process.argv.slice(2);
  const result = { all: false, partido: null as string | null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--all") result.all = true;
    if (args[i] === "--partido") result.partido = args[i + 1] ?? null;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Importación: red-vial-CABA.geojson → red_vial
// ---------------------------------------------------------------------------
async function importarRedVialCABA(client: Client): Promise<void> {
  console.log("\n[CABA] Importando red vial...");
  const geojson = leerGeoJSON(ARCHIVOS.redVialCABA);
  let insertados = 0;
  let omitidos = 0;

  for (const feature of geojson.features) {
    const p = feature.properties;
    const featureId = toTextOrNull(p["id"]);
    const nombre = toTextOrNull(p["nomoficial"]);
    if (!featureId || !nombre || !feature.geometry) {
      omitidos++;
      continue;
    }
    const wktList = geometriaALineStrings(feature.geometry);
    for (const wkt of wktList) {
      await client.query(
        `INSERT INTO red_vial (
          dataset_origen, feature_id, codigo, nombre, nombre_alterno,
          tipo_via, longitud_m, sentido, jerarquia_vial, jurisdiccion,
          metadata, geom
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,ST_GeomFromText($12,4326))
        ON CONFLICT (dataset_origen, feature_id) DO NOTHING`,
        [
          "caba", featureId, toTextOrNull(p["codigo"]), nombre,
          toTextOrNull(p["nom_mapa"]), toTextOrNull(p["tipo_c"]),
          typeof p["long"] === "number" ? p["long"] : null,
          normalizarSentido(p["sentido"]), toTextOrNull(p["red_jerarq"]),
          "CABA",
          JSON.stringify({
            barrio: p["barrio"], comuna: p["comuna"],
            bicisenda: p["bicisenda"], observa: p["observa"],
          }),
          wkt,
        ]
      );
      insertados++;
    }
  }
  console.log(`  ✓ ${insertados} filas insertadas, ${omitidos} omitidas.`);
}

// ---------------------------------------------------------------------------
// Importación: rutas-nacionales.geojson → red_vial
// ---------------------------------------------------------------------------
async function importarRutasNacionales(client: Client): Promise<void> {
  console.log("\n[RN] Importando rutas nacionales...");
  const geojson = leerGeoJSON(ARCHIVOS.rutasNacionales);
  let insertados = 0;
  let omitidos = 0;

  for (const feature of geojson.features) {
    const p = feature.properties;
    const featureId = toTextOrNull(feature.id ?? p["fid"] ?? p["id"]);
    const nombre =
      toTextOrNull(p["nombre"] ?? p["name"] ?? p["ruta"] ?? p["NAME"]) ??
      "SIN NOMBRE";
    if (!featureId || !feature.geometry) {
      omitidos++;
      continue;
    }
    const wktList = geometriaALineStrings(feature.geometry);
    for (const wkt of wktList) {
      await client.query(
        `INSERT INTO red_vial (
          dataset_origen, feature_id, nombre, tipo_via, sentido,
          jerarquia_vial, jurisdiccion, metadata, geom
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,ST_GeomFromText($9,4326))
        ON CONFLICT (dataset_origen, feature_id) DO NOTHING`,
        [
          "rn", featureId, nombre, "RUTA", "DOBLE MANO",
          "TRONCAL", "Nacional", JSON.stringify(p), wkt,
        ]
      );
      insertados++;
    }
  }
  console.log(`  ✓ ${insertados} filas insertadas, ${omitidos} omitidas.`);
}

// ---------------------------------------------------------------------------
// Importación: CABA - Red de Tránsito Pesado.json → red_camiones
// ---------------------------------------------------------------------------
async function importarRedCamionesCABA(client: Client): Promise<void> {
  console.log("\n[CABA] Importando red de tránsito pesado...");
  // Idempotente
  await client.query("DELETE FROM red_camiones WHERE dataset_origen = $1", ["caba"]);

  const geojson = leerGeoJSON(ARCHIVOS.redCamiones);
  let insertados = 0;
  let omitidos = 0;

  for (const feature of geojson.features) {
    const p = feature.properties;
    if (!feature.geometry) {
      omitidos++;
      continue;
    }
    const nombre = toTextOrNull(p["name"]) ?? "SIN NOMBRE";
    const descripcion = toTextOrNull(p["description"]);

    let desdeCalle: string | null = null;
    let hastaCalle: string | null = null;
    if (descripcion) {
      const match = descripcion.match(/(?:entre|e\/)\s+(.+?)\s+y\s+(.+)/i);
      if (match) {
        desdeCalle = match[1].trim();
        hastaCalle = match[2].trim();
      }
    }
    const wktList = geometriaALineStrings(feature.geometry);
    for (const wkt of wktList) {
      await client.query(
        `INSERT INTO red_camiones (
          dataset_origen, nombre, desde_calle, hasta_calle,
          descripcion, metadata, geom
        ) VALUES ($1,$2,$3,$4,$5,$6,ST_GeomFromText($7,4326))`,
        [
          "caba", nombre, desdeCalle, hastaCalle, descripcion,
          JSON.stringify({ stroke: p["stroke"], styleUrl: p["styleUrl"] }),
          wkt,
        ]
      );
      insertados++;
    }
  }
  console.log(`  ✓ ${insertados} filas insertadas, ${omitidos} omitidas.`);
}

// ---------------------------------------------------------------------------
// Importación genérica: GeoJSON descargado con OSMnx → red_vial
// ---------------------------------------------------------------------------
async function importarRedVialOSMnx(
  client: Client,
  rutaArchivo: string,
  dataset: string,
  jurisdiccion: string
): Promise<void> {
  console.log(`\n[${dataset}] Importando red vial OSMnx...`);
  const geojson = leerGeoJSON(rutaArchivo);
  let insertados = 0;
  let omitidos = 0;

  for (const feature of geojson.features) {
    const p = feature.properties;
    const featureId = `${p["osmid"]}_${p["u"]}_${p["v"]}`;
    const nombre = toTextOrNull(p["name"]);
    if (!nombre || !feature.geometry) {
      omitidos++;
      continue;
    }
    const sentido =
      p["oneway"] === true || p["oneway"] === "True" ? "CRECIENTE" : "DOBLE MANO";

    const wktList = geometriaALineStrings(feature.geometry);
    for (const wkt of wktList) {
      await client.query(
        `INSERT INTO red_vial (
          dataset_origen, feature_id, nombre,
          tipo_via, longitud_m, sentido,
          jerarquia_vial, jurisdiccion, metadata, geom
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,ST_GeomFromText($10,4326))
        ON CONFLICT (dataset_origen, feature_id) DO NOTHING`,
        [
          dataset, featureId, nombre,
          toTextOrNull(p["highway"]),
          typeof p["length"] === "number" ? p["length"] : null,
          sentido, toTextOrNull(p["highway"]), jurisdiccion,
          JSON.stringify({
            osmid: p["osmid"], lanes: p["lanes"], maxspeed: p["maxspeed"],
            ref: p["ref"], bridge: p["bridge"], junction: p["junction"],
          }),
          wkt,
        ]
      );
      insertados++;
    }
  }
  console.log(`  ✓ ${insertados} filas insertadas, ${omitidos} omitidas.`);
}

// ---------------------------------------------------------------------------
// Importación de tramos habilitados por NOMBRE/REF → red_camiones
// Para partidos donde no tenemos KML/GeoJSON con geometría, resolvemos
// la geometría desde red_vial (ya cargada con OSMnx) por nombre y ref.
// ---------------------------------------------------------------------------
async function importarTramosPorNombre(
  client: Client,
  slug: string
): Promise<void> {
  const { tramosPorNombre } = archivosPartido(slug);
  console.log(`\n[${slug}] Importando tramos habilitados por nombre/ref...`);

  if (!fs.existsSync(tramosPorNombre)) {
    console.log(`  ⚠ No existe ${tramosPorNombre}, omitiendo.`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(tramosPorNombre, "utf-8")) as ArchivoTramosPorNombre;

  // Idempotente: borro todo lo de este dataset antes de re-insertar
  await client.query("DELETE FROM red_camiones WHERE dataset_origen = $1", [slug]);

  let totalInsertados = 0;
  let tramosResueltos = 0;
  let tramosVacios = 0;

  for (const tramo of data.tramos) {
    // Match por ref (más confiable para rutas) OR por nombre ILIKE
    const params: (string | null)[] = [
      slug,                  // $1: dataset_origen para INSERT
      tramo.calle,           // $2: nombre que guardamos
      tramo.desde,           // $3
      tramo.hasta,           // $4
      JSON.stringify({       // $5: metadata
        jerarquia: tramo.jerarquia,
        notas:     tramo.notas,
        tramo:     tramo.tramo,
      }),
      slug,                  // $6: dataset_origen para SELECT (red_vial del partido)
      tramo.ilike_pattern,   // $7: ILIKE pattern
      tramo.ref_buscar,      // $8: ref a comparar (puede ser null)
    ];

    const result = await client.query(
      `INSERT INTO red_camiones (dataset_origen, nombre, desde_calle, hasta_calle, descripcion, metadata, geom)
       SELECT $1, $2, $3, $4, NULL, $5::jsonb, geom
       FROM red_vial
       WHERE dataset_origen = $6
         AND (
           ($7::text IS NOT NULL AND nombre ILIKE $7)
           OR ($8::text IS NOT NULL AND (metadata->>'ref') = $8)
         )`,
      params
    );

    const insertados = result.rowCount ?? 0;
    totalInsertados += insertados;

    if (insertados > 0) {
      tramosResueltos++;
      console.log(
        `  ✓ "${tramo.calle}" → ${insertados} aristas` +
        (tramo.ref_buscar ? ` (ref=${tramo.ref_buscar})` : "")
      );
    } else {
      tramosVacios++;
      console.log(
        `  ⚠ "${tramo.calle}" → 0 aristas` +
        ` (ILIKE='${tramo.ilike_pattern}', ref=${tramo.ref_buscar ?? "—"})`
      );
    }
  }

  console.log(
    `  Total: ${totalInsertados} aristas en red_camiones | ` +
    `${tramosResueltos}/${data.tramos.length} tramos resueltos | ` +
    `${tramosVacios} tramos sin aristas`
  );
}

// ---------------------------------------------------------------------------
// Orquestador por partido
// ---------------------------------------------------------------------------
async function importarPartido(client: Client, slug: string): Promise<void> {
  const config = PARTIDOS_NUEVOS[slug];
  if (!config) {
    throw new Error(
      `Partido "${slug}" no está en PARTIDOS_NUEVOS. ` +
      `Agregalo al diccionario en importar.ts.`
    );
  }
  const { redVial } = archivosPartido(slug);
  if (!fs.existsSync(redVial)) {
    throw new Error(
      `No existe ${redVial}. ` +
      `Corré primero: ./venv/bin/python scripts/descargar_red_vial_partido.py --partido "${config.nombre}"`
    );
  }
  await importarRedVialOSMnx(client, redVial, slug.replace(/-/g, "_"), config.jurisdiccion);
  await importarTramosPorNombre(client, slug);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const args = parseArgs();
  const client = new Client(DB_CONFIG);

  try {
    await client.connect();
    console.log(
      `Conectado: ${process.env.DATABASE_URL ? "DATABASE_URL (remoto)" : "localhost"}`
    );

    if (args.partido) {
      // Solo un partido nuevo
      await importarPartido(client, args.partido);
    } else if (args.all) {
      // Todo el flujo
      await importarRedVialCABA(client);
      await importarRutasNacionales(client);
      await importarRedCamionesCABA(client);
      await importarRedVialOSMnx(
        client, ARCHIVOS.redVialLanus, "lanus", "Buenos Aires"
      );
      for (const slug of Object.keys(PARTIDOS_NUEVOS)) {
        await importarPartido(client, slug);
      }
    } else {
      // Sin flags: comportamiento previo (CABA + RN + Lanús, sin partidos nuevos)
      await importarRedVialCABA(client);
      await importarRutasNacionales(client);
      await importarRedCamionesCABA(client);
      await importarRedVialOSMnx(
        client, ARCHIVOS.redVialLanus, "lanus", "Buenos Aires"
      );
    }

    console.log("\n✅ Importación completa.");
    console.log(
      "   Siguiente paso: 02_topology.sql (si hay aristas nuevas) + " +
      "10_refresh_restricciones.sql (por partido nuevo)."
    );
  } catch (error) {
    console.error("\n❌ Error durante la importación:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
