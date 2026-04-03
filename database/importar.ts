/*******************************************************
 * importar.ts
 *
 * Script de importación de datos geoespaciales a PostgreSQL/PostGIS.
 * Carga tres fuentes en las tablas red_vial y red_camiones.
 *
 * Uso: npx ts-node importar.ts
 *
 * Orden de ejecución esperado:
 *   1. importar.ts        ← este script
 *   2. 02_topology.sql
 *   3. 03_restrictions.sql
 *   4. 04_backend_views.sql
 *******************************************************/

import fs from "fs";
import path from "path";
import { Client } from "pg";

// ---------------------------------------------------------------------------
// Configuración de conexión a la base de datos
// ---------------------------------------------------------------------------
const DB_CONFIG = {
  host: "localhost",
  port: 5432,
  database: "safetruck",
  user: "postgres",
  password: "postgres",
};

// ---------------------------------------------------------------------------
// Rutas a los archivos de datos
// ---------------------------------------------------------------------------
const DATA_DIR = path.join(__dirname, "data");

const ARCHIVOS = {
  redVialCABA: path.join(DATA_DIR, "base", "red-vial-CABA.geojson"),
  rutasNacionales: path.join(DATA_DIR, "base", "rutas-nacionales.geojson"),
  redCamiones: path.join(
    DATA_DIR,
    "restricciones",
    "CABA - Red de Tránsito Pesado.json"
  ),
};

// ---------------------------------------------------------------------------
// Tipos internos para las features GeoJSON
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Lee y parsea un archivo GeoJSON del disco
function leerGeoJSON(rutaArchivo: string): GeoJSONCollection {
  console.log(`Leyendo: ${rutaArchivo}`);
  const contenido = fs.readFileSync(rutaArchivo, "utf-8");
  return JSON.parse(contenido) as GeoJSONCollection;
}

// Convierte una geometría a WKT para insertar en PostGIS
// Si es MultiLineString, aplana cada línea en filas separadas
function geometriaALineStrings(
  geom: LineStringGeometry | MultiLineStringGeometry
): string[] {
  if (geom.type === "LineString") {
    const coords = geom.coordinates
      .map((c) => `${c[0]} ${c[1]}`)
      .join(", ");
    return [`LINESTRING(${coords})`];
  }

  // MultiLineString → una fila por cada sub-línea
  return geom.coordinates.map((linea) => {
    const coords = linea.map((c) => `${c[0]} ${c[1]}`).join(", ");
    return `LINESTRING(${coords})`;
  });
}

// Normaliza el valor de sentido al vocabulario del esquema
function normalizarSentido(raw: unknown): string {
  if (typeof raw !== "string") return "DOBLE MANO";
  const upper = raw.toUpperCase().trim();
  if (upper === "CRECIENTE") return "CRECIENTE";
  if (upper === "DECRECIENTE") return "DECRECIENTE";
  return "DOBLE MANO";
}

// Convierte un valor a string o null
function toTextOrNull(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  return String(val);
}

// ---------------------------------------------------------------------------
// Importación: red-vial-CABA.geojson → red_vial
// ---------------------------------------------------------------------------
async function importarRedVialCABA(client: Client): Promise<void> {
  console.log("\n[1/3] Importando red vial de CABA...");

  const geojson = leerGeoJSON(ARCHIVOS.redVialCABA);
  let insertados = 0;
  let omitidos = 0;

  for (const feature of geojson.features) {
    const p = feature.properties;

    // Campos obligatorios
    const featureId = toTextOrNull(p["id"]);
    const nombre = toTextOrNull(p["nomoficial"]);

    if (!featureId || !nombre || !feature.geometry) {
      omitidos++;
      continue;
    }

    const wktList = geometriaALineStrings(feature.geometry);

    for (const wkt of wktList) {
      await client.query(
        `
        INSERT INTO red_vial (
          dataset_origen, feature_id, codigo, nombre, nombre_alterno,
          tipo_via, longitud_m, sentido, jerarquia_vial, jurisdiccion,
          metadata, geom
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, ST_GeomFromText($12, 4326)
        )
        ON CONFLICT (dataset_origen, feature_id) DO NOTHING
        `,
        [
          "caba",                                   // dataset_origen
          featureId,                                // feature_id
          toTextOrNull(p["codigo"]),                // codigo
          nombre,                                   // nombre
          toTextOrNull(p["nom_mapa"]),              // nombre_alterno
          toTextOrNull(p["tipo_c"]),                // tipo_via
          typeof p["long"] === "number" ? p["long"] : null, // longitud_m
          normalizarSentido(p["sentido"]),          // sentido
          toTextOrNull(p["red_jerarq"]),            // jerarquia_vial
          "CABA",                                   // jurisdiccion
          JSON.stringify({                          // metadata
            barrio: p["barrio"],
            comuna: p["comuna"],
            bicisenda: p["bicisenda"],
            observa: p["observa"],
          }),
          wkt,                                      // geom
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
  console.log("\n[2/3] Importando rutas nacionales...");

  const geojson = leerGeoJSON(ARCHIVOS.rutasNacionales);
  let insertados = 0;
  let omitidos = 0;

  for (const feature of geojson.features) {
    const p = feature.properties;

    // El ID único de cada feature viene en feature.id (ej: "Rutas_Nacionales.fid-...")
    const featureId = toTextOrNull(feature.id ?? p["fid"] ?? p["id"]);
    const nombre =
      toTextOrNull(p["nombre"] ?? p["name"] ?? p["ruta"] ?? p["NAME"]) ??
      "SIN NOMBRE";

    if (!featureId || !feature.geometry) {
      omitidos++;
      continue;
    }

    const wktList = geometriaALineStrings(feature.geometry);

    // Las rutas nacionales no tienen sentido explícito → doble mano por defecto
    for (const wkt of wktList) {
      await client.query(
        `
        INSERT INTO red_vial (
          dataset_origen, feature_id, nombre, tipo_via, sentido,
          jerarquia_vial, jurisdiccion, metadata, geom
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, ST_GeomFromText($9, 4326)
        )
        ON CONFLICT (dataset_origen, feature_id) DO NOTHING
        `,
        [
          "rn",                         // dataset_origen
          featureId,                    // feature_id
          nombre,                       // nombre
          "RUTA",                       // tipo_via
          "DOBLE MANO",                 // sentido (default para rutas nacionales)
          "TRONCAL",                    // jerarquia_vial
          "Nacional",                   // jurisdiccion
          JSON.stringify(p),            // metadata: guardamos todo lo original
          wkt,                          // geom
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
async function importarRedCamiones(client: Client): Promise<void> {
  console.log("\n[3/3] Importando red de tránsito pesado de CABA...");

  const geojson = leerGeoJSON(ARCHIVOS.redCamiones);
  let insertados = 0;
  let omitidos = 0;

  for (const feature of geojson.features) {
    const p = feature.properties;

    if (!feature.geometry) {
      omitidos++;
      continue;
    }

    // El nombre viene en "name", la descripción en "description"
    const nombre = toTextOrNull(p["name"]) ?? "SIN NOMBRE";
    const descripcion = toTextOrNull(p["description"]);

    // Extraemos desde/hasta de la descripción si tiene formato "e/ X y Y" o "entre X y Y"
    let desdeCalle: string | null = null;
    let hastaCalle: string | null = null;

    if (descripcion) {
      // Intenta parsear "entre X y Y" o "e/ X y Y"
      const match = descripcion.match(/(?:entre|e\/)\s+(.+?)\s+y\s+(.+)/i);
      if (match) {
        desdeCalle = match[1].trim();
        hastaCalle = match[2].trim();
      }
    }

    const wktList = geometriaALineStrings(feature.geometry);

    for (const wkt of wktList) {
      await client.query(
        `
        INSERT INTO red_camiones (
          dataset_origen, nombre, desde_calle, hasta_calle,
          descripcion, metadata, geom
        ) VALUES (
          $1, $2, $3, $4, $5, $6, ST_GeomFromText($7, 4326)
        )
        `,
        [
          "caba",       // dataset_origen
          nombre,       // nombre
          desdeCalle,   // desde_calle
          hastaCalle,   // hasta_calle
          descripcion,  // descripcion
          JSON.stringify({
            stroke: p["stroke"],
            styleUrl: p["styleUrl"],
          }),           // metadata
          wkt,          // geom
        ]
      );
      insertados++;
    }
  }

  console.log(`  ✓ ${insertados} filas insertadas, ${omitidos} omitidas.`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const client = new Client(DB_CONFIG);

  try {
    await client.connect();
    console.log("Conectado a PostgreSQL.");

    // Ejecuta las tres importaciones en orden
    await importarRedVialCABA(client);
    await importarRutasNacionales(client);
    await importarRedCamiones(client);

    console.log("\n✅ Importación completa.");
    console.log(
      "   Siguiente paso: ejecutar 02_topology.sql en la base de datos."
    );
  } catch (error) {
    console.error("\n❌ Error durante la importación:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();