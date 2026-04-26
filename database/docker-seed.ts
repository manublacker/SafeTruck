/*******************************************************
 * docker-seed.ts
 *
 * Versión de importar.ts adaptada para el contenedor Docker.
 * Lee la configuración de conexión desde variables de entorno
 * en lugar de valores hardcodeados.
 *
 * Variables de entorno esperadas:
 *   PGHOST     (default: db)
 *   PGPORT     (default: 5432)
 *   PGDATABASE (default: safetruck)
 *   PGUSER     (default: postgres)
 *   PGPASSWORD (default: postgres)
 *
 * Orden de ejecución (orquestado por docker-init.sh):
 *   1. Esperar a que la BD esté lista
 *   2. docker-seed.ts  ← importa GeoJSON a red_vial y red_camiones
 *   3. 02_topology.sql
 *   4. 03_restrictions.sql
 *   5. 04_backend_views.sql
 *******************************************************/

import fs   from "fs";
import path from "path";
import { Client } from "pg";

const DB_CONFIG = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
  : {
      host:     process.env.PGHOST     ?? "db",
      port:     Number(process.env.PGPORT ?? 5432),
      database: process.env.PGDATABASE ?? "safetruck",
      user:     process.env.PGUSER     ?? "postgres",
      password: process.env.PGPASSWORD ?? "postgres",
    };

// En el contenedor los datos están en /data (copiados por Dockerfile.init)
const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, "data");

const ARCHIVOS = {
  redVialCABA:      path.join(DATA_DIR, "base", "red-vial-CABA.geojson"),
  rutasNacionales:  path.join(DATA_DIR, "base", "rutas-nacionales.geojson"),
  redCamiones:      path.join(DATA_DIR, "restricciones", "CABA - Red de Tránsito Pesado.json"),
};

// ── Tipos ────────────────────────────────────────────────────

interface LineStringGeometry    { type: "LineString";      coordinates: number[][]; }
interface MultiLineStringGeometry { type: "MultiLineString"; coordinates: number[][][]; }

interface GeoJSONFeature {
  type: "Feature"; id?: string;
  properties: Record<string, unknown>;
  geometry: LineStringGeometry | MultiLineStringGeometry;
}
interface GeoJSONCollection { type: "FeatureCollection"; features: GeoJSONFeature[]; }

// ── Helpers ──────────────────────────────────────────────────

function leerGeoJSON(ruta: string): GeoJSONCollection {
  console.log(`  Leyendo: ${ruta}`);
  return JSON.parse(fs.readFileSync(ruta, "utf-8")) as GeoJSONCollection;
}

function geometriaALineStrings(geom: LineStringGeometry | MultiLineStringGeometry): string[] {
  if (geom.type === "LineString") {
    return [`LINESTRING(${geom.coordinates.map((c) => `${c[0]} ${c[1]}`).join(", ")})`];
  }
  return geom.coordinates.map(
    (linea) => `LINESTRING(${linea.map((c) => `${c[0]} ${c[1]}`).join(", ")})`
  );
}

function normalizarSentido(raw: unknown): string {
  if (typeof raw !== "string") return "DOBLE MANO";
  const u = raw.toUpperCase().trim();
  if (u === "CRECIENTE" || u === "DECRECIENTE") return u;
  return "DOBLE MANO";
}

function toTextOrNull(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  return String(val);
}

// ── Helpers de batch ─────────────────────────────────────────

const BATCH_SIZE = 500;

async function insertarBatchRedVial(client: Client, rows: any[][]) {
  if (rows.length === 0) return;
  await client.query(
    `INSERT INTO red_vial (dataset_origen,feature_id,codigo,nombre,nombre_alterno,tipo_via,longitud_m,sentido,jerarquia_vial,jurisdiccion,metadata,geom)
     SELECT t.c1,t.c2,t.c3,t.c4,t.c5,t.c6,t.c7::float8,t.c8,t.c9,t.c10,t.c11::jsonb,ST_GeomFromText(t.c12,4326)
     FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],$9::text[],$10::text[],$11::text[],$12::text[])
     AS t(c1,c2,c3,c4,c5,c6,c7,c8,c9,c10,c11,c12)
     ON CONFLICT (dataset_origen,feature_id) DO NOTHING`,
    Array.from({ length: 12 }, (_, i) => rows.map(r => r[i] !== null && r[i] !== undefined ? String(r[i]) : null))
  );
}

async function insertarBatchRutasNacionales(client: Client, rows: any[][]) {
  if (rows.length === 0) return;
  await client.query(
    `INSERT INTO red_vial (dataset_origen,feature_id,nombre,tipo_via,sentido,jerarquia_vial,jurisdiccion,metadata,geom)
     SELECT t.c1,t.c2,t.c3,t.c4,t.c5,t.c6,t.c7,t.c8::jsonb,ST_GeomFromText(t.c9,4326)
     FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],$9::text[])
     AS t(c1,c2,c3,c4,c5,c6,c7,c8,c9)
     ON CONFLICT (dataset_origen,feature_id) DO NOTHING`,
    Array.from({ length: 9 }, (_, i) => rows.map(r => r[i] !== null && r[i] !== undefined ? String(r[i]) : null))
  );
}

async function insertarBatchRedCamiones(client: Client, rows: any[][]) {
  if (rows.length === 0) return;
  await client.query(
    `INSERT INTO red_camiones (dataset_origen,nombre,desde_calle,hasta_calle,descripcion,metadata,geom)
     SELECT t.c1,t.c2,t.c3,t.c4,t.c5,t.c6::jsonb,ST_GeomFromText(t.c7,4326)
     FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[])
     AS t(c1,c2,c3,c4,c5,c6,c7)`,
    Array.from({ length: 7 }, (_, i) => rows.map(r => r[i] !== null && r[i] !== undefined ? String(r[i]) : null))
  );
}

// ── Importaciones ────────────────────────────────────────────

async function importarRedVialCABA(client: Client) {
  console.log("\n[1/3] Importando red vial de CABA...");
  const geojson = leerGeoJSON(ARCHIVOS.redVialCABA);
  const rows: any[][] = [];
  let omitidos = 0;

  for (const feature of geojson.features) {
    const p = feature.properties;
    const featureId = toTextOrNull(p["id"]);
    const nombre    = toTextOrNull(p["nomoficial"]);
    if (!featureId || !nombre || !feature.geometry) { omitidos++; continue; }

    for (const wkt of geometriaALineStrings(feature.geometry)) {
      rows.push(["caba", featureId, toTextOrNull(p["codigo"]), nombre, toTextOrNull(p["nom_mapa"]),
        toTextOrNull(p["tipo_c"]), typeof p["long"] === "number" ? p["long"] : null,
        normalizarSentido(p["sentido"]), toTextOrNull(p["red_jerarq"]), "CABA",
        JSON.stringify({ barrio: p["barrio"], comuna: p["comuna"] }), wkt]);
    }
  }

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await insertarBatchRedVial(client, rows.slice(i, i + BATCH_SIZE));
    process.stdout.write(`\r  ... ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
  }
  console.log(`\n  ✓ ${rows.length} filas insertadas, ${omitidos} omitidas.`);
}

async function importarRutasNacionales(client: Client) {
  console.log("\n[2/3] Importando rutas nacionales...");
  const geojson = leerGeoJSON(ARCHIVOS.rutasNacionales);
  const rows: any[][] = [];
  let omitidos = 0;

  for (const feature of geojson.features) {
    const p = feature.properties;
    const featureId = toTextOrNull(feature.id ?? p["fid"] ?? p["id"]);
    const nombre    = toTextOrNull(p["nombre"] ?? p["name"] ?? p["ruta"] ?? p["NAME"]) ?? "SIN NOMBRE";
    if (!featureId || !feature.geometry) { omitidos++; continue; }

    for (const wkt of geometriaALineStrings(feature.geometry)) {
      rows.push(["rn", featureId, nombre, "RUTA", "DOBLE MANO", "TRONCAL", "Nacional", JSON.stringify(p), wkt]);
    }
  }

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await insertarBatchRutasNacionales(client, rows.slice(i, i + BATCH_SIZE));
    process.stdout.write(`\r  ... ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
  }
  console.log(`\n  ✓ ${rows.length} filas insertadas, ${omitidos} omitidas.`);
}

async function importarRedCamiones(client: Client) {
  console.log("\n[3/3] Importando red de tránsito pesado de CABA...");
  const geojson = leerGeoJSON(ARCHIVOS.redCamiones);
  const rows: any[][] = [];
  let omitidos = 0;

  for (const feature of geojson.features) {
    const p = feature.properties;
    if (!feature.geometry) { omitidos++; continue; }

    const nombre      = toTextOrNull(p["name"]) ?? "SIN NOMBRE";
    const descripcion = toTextOrNull(p["description"]);
    let desdeCalle: string | null = null, hastaCalle: string | null = null;

    if (descripcion) {
      const match = descripcion.match(/(?:entre|e\/)\s+(.+?)\s+y\s+(.+)/i);
      if (match) { desdeCalle = match[1].trim(); hastaCalle = match[2].trim(); }
    }

    for (const wkt of geometriaALineStrings(feature.geometry)) {
      rows.push(["caba", nombre, desdeCalle, hastaCalle, descripcion, JSON.stringify({ stroke: p["stroke"] }), wkt]);
    }
  }

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await insertarBatchRedCamiones(client, rows.slice(i, i + BATCH_SIZE));
    process.stdout.write(`\r  ... ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
  }
  console.log(`\n  ✓ ${rows.length} filas insertadas, ${omitidos} omitidas.`);
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  const client = new Client(DB_CONFIG);
  try {
    await client.connect();
    console.log(`✓ Conectado a PostgreSQL en ${DB_CONFIG.host}:${DB_CONFIG.port}`);
    await importarRedVialCABA(client);
    await importarRutasNacionales(client);
    await importarRedCamiones(client);
    console.log("\n✅ Importación de datos completa.");
  } catch (err) {
    console.error("\n❌ Error durante la importación:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
