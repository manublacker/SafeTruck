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

const DB_CONFIG = {
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

// ── Importaciones ────────────────────────────────────────────

async function importarRedVialCABA(client: Client) {
  console.log("\n[1/3] Importando red vial de CABA...");
  const geojson = leerGeoJSON(ARCHIVOS.redVialCABA);
  let insertados = 0, omitidos = 0;

  for (const feature of geojson.features) {
    const p = feature.properties;
    const featureId = toTextOrNull(p["id"]);
    const nombre    = toTextOrNull(p["nomoficial"]);
    if (!featureId || !nombre || !feature.geometry) { omitidos++; continue; }

    for (const wkt of geometriaALineStrings(feature.geometry)) {
      await client.query(
        `INSERT INTO red_vial (dataset_origen,feature_id,codigo,nombre,nombre_alterno,tipo_via,longitud_m,sentido,jerarquia_vial,jurisdiccion,metadata,geom)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,ST_GeomFromText($12,4326))
         ON CONFLICT (dataset_origen,feature_id) DO NOTHING`,
        ["caba", featureId, toTextOrNull(p["codigo"]), nombre, toTextOrNull(p["nom_mapa"]),
         toTextOrNull(p["tipo_c"]), typeof p["long"] === "number" ? p["long"] : null,
         normalizarSentido(p["sentido"]), toTextOrNull(p["red_jerarq"]), "CABA",
         JSON.stringify({ barrio: p["barrio"], comuna: p["comuna"] }), wkt]
      );
      insertados++;
    }
  }
  console.log(`  ✓ ${insertados} filas insertadas, ${omitidos} omitidas.`);
}

async function importarRutasNacionales(client: Client) {
  console.log("\n[2/3] Importando rutas nacionales...");
  const geojson = leerGeoJSON(ARCHIVOS.rutasNacionales);
  let insertados = 0, omitidos = 0;

  for (const feature of geojson.features) {
    const p = feature.properties;
    const featureId = toTextOrNull(feature.id ?? p["fid"] ?? p["id"]);
    const nombre    = toTextOrNull(p["nombre"] ?? p["name"] ?? p["ruta"] ?? p["NAME"]) ?? "SIN NOMBRE";
    if (!featureId || !feature.geometry) { omitidos++; continue; }

    for (const wkt of geometriaALineStrings(feature.geometry)) {
      await client.query(
        `INSERT INTO red_vial (dataset_origen,feature_id,nombre,tipo_via,sentido,jerarquia_vial,jurisdiccion,metadata,geom)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,ST_GeomFromText($9,4326))
         ON CONFLICT (dataset_origen,feature_id) DO NOTHING`,
        ["rn", featureId, nombre, "RUTA", "DOBLE MANO", "TRONCAL", "Nacional", JSON.stringify(p), wkt]
      );
      insertados++;
    }
  }
  console.log(`  ✓ ${insertados} filas insertadas, ${omitidos} omitidas.`);
}

async function importarRedCamiones(client: Client) {
  console.log("\n[3/3] Importando red de tránsito pesado de CABA...");
  const geojson = leerGeoJSON(ARCHIVOS.redCamiones);
  let insertados = 0, omitidos = 0;

  for (const feature of geojson.features) {
    const p = feature.properties;
    if (!feature.geometry) { omitidos++; continue; }

    const nombre     = toTextOrNull(p["name"]) ?? "SIN NOMBRE";
    const descripcion = toTextOrNull(p["description"]);
    let desdeCalle: string | null = null, hastaCalle: string | null = null;

    if (descripcion) {
      const match = descripcion.match(/(?:entre|e\/)\s+(.+?)\s+y\s+(.+)/i);
      if (match) { desdeCalle = match[1].trim(); hastaCalle = match[2].trim(); }
    }

    for (const wkt of geometriaALineStrings(feature.geometry)) {
      await client.query(
        `INSERT INTO red_camiones (dataset_origen,nombre,desde_calle,hasta_calle,descripcion,metadata,geom)
         VALUES ($1,$2,$3,$4,$5,$6,ST_GeomFromText($7,4326))`,
        ["caba", nombre, desdeCalle, hastaCalle, descripcion,
         JSON.stringify({ stroke: p["stroke"] }), wkt]
      );
      insertados++;
    }
  }
  console.log(`  ✓ ${insertados} filas insertadas, ${omitidos} omitidas.`);
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
