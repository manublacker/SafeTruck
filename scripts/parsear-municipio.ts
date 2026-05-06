/*******************************************************
 * parsear-municipio.ts
 *
 * Lee un JSON estándar de red de tránsito pesado y lo
 * inserta en la tabla red_camiones de PostgreSQL buscando
 * la geometría en red_vial por nombre de calle.
 *
 * Uso (un municipio):
 *   npx ts-node scripts/parsear-municipio.ts --municipio=lomas_de_zamora
 *
 * Uso (todos los municipios en database/data/restricciones/):
 *   npx ts-node scripts/parsear-municipio.ts --all
 *
 * Después de correr este script ejecutar:
 *   psql -d safetruck -f database/sql/03_restrictions.sql
 *******************************************************/

import fs from "fs";
import path from "path";
import { Client } from "pg";
import "dotenv/config";

const DB_CONFIG = {
  host: "localhost",
  port: 5432,
  database: "safetruck",
  user: "postgres",
  password: "postgres",
};

const RESTRICCIONES_DIR = path.resolve("database/data/restricciones");

// ---------------------------------------------------------------------------
// Tipos del formato estándar
// ---------------------------------------------------------------------------
interface ViaHabilitada {
  nombre: string;
  desde: string | null;
  hasta: string | null;
  jerarquia: string | null;
  notas: string | null;
}

interface AlertaAltura {
  ubicacion: string;
  altura_max_m: number;
}

interface MunicipioJSON {
  partido: string;
  provincia: string;
  fuente_legal: string | null;
  config: {
    limite_peso_kg: number | null;
    altura_max_m: number | null;
    politica_ruteo: string | null;
  };
  vias_habilitadas: ViaHabilitada[];
  alertas_altura: AlertaAltura[];
}

// ---------------------------------------------------------------------------
// Parsea argumentos CLI
// ---------------------------------------------------------------------------
function parsearArgs(): { municipio: string | null; all: boolean } {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const municipioArg = args.find((a) => a.startsWith("--municipio="));
  return {
    all,
    municipio: municipioArg ? municipioArg.replace("--municipio=", "") : null,
  };
}

// ---------------------------------------------------------------------------
// Lee el JSON estándar del municipio
// ---------------------------------------------------------------------------
function leerJSON(municipio: string): MunicipioJSON {
  const ruta = path.join(RESTRICCIONES_DIR, `${municipio}.json`);
  if (!fs.existsSync(ruta)) {
    throw new Error(`No se encontró el archivo: ${ruta}`);
  }
  return JSON.parse(fs.readFileSync(ruta, "utf-8")) as MunicipioJSON;
}

// ---------------------------------------------------------------------------
// Busca la geometría de una calle en red_vial por nombre
// ---------------------------------------------------------------------------
async function buscarGeometria(
  dbClient: Client,
  nombre: string,
  dataset: string
): Promise<string | null> {
  const stopWords = [
    "avenida", "av", "general", "gral", "coronel", "cnel",
    "presidente", "pte", "doctor", "dr", "intendente", "presbítero",
    "santo", "santa", "camino", "ruta", "autopista",
  ];

  const palabras = nombre
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p.length > 3 && !stopWords.includes(p));

  if (palabras.length === 0) return null;

  const clave = palabras.sort((a, b) => b.length - a.length)[0];

  const result = await dbClient.query(
    `SELECT ST_AsText(ST_GeometryN(ST_LineMerge(ST_Collect(geom)), 1)) AS geom_wkt
     FROM red_vial
     WHERE dataset_origen = $1 AND nombre ILIKE $2
     LIMIT 1`,
    [dataset, `%${clave}%`]
  );

  if (result.rows.length === 0 || !result.rows[0].geom_wkt) return null;
  return result.rows[0].geom_wkt as string;
}

// ---------------------------------------------------------------------------
// Inserta las vías del municipio en red_camiones
// ---------------------------------------------------------------------------
async function procesarMunicipio(
  dbClient: Client,
  municipio: string
): Promise<void> {
  console.log(`\n── ${municipio} ──`);

  const datos = leerJSON(municipio);
  const dataset = municipio; // dataset_origen en red_vial = slug del municipio

  let insertados = 0;
  let sinGeometria = 0;

  for (const via of datos.vias_habilitadas) {
    const geomWkt = await buscarGeometria(dbClient, via.nombre, dataset);

    if (!geomWkt) {
      console.warn(`  ⚠ Sin geometría: ${via.nombre}`);
      sinGeometria++;
      continue;
    }

    await dbClient.query(
      `INSERT INTO red_camiones (
         dataset_origen, nombre, desde_calle, hasta_calle,
         descripcion, metadata, geom
       ) VALUES ($1, $2, $3, $4, $5, $6, ST_GeomFromText($7, 4326))
       ON CONFLICT DO NOTHING`,
      [
        dataset,
        via.nombre,
        via.desde,
        via.hasta,
        via.notas,
        JSON.stringify({
          jerarquia: via.jerarquia,
          limite_peso_kg: datos.config?.limite_peso_kg,
          altura_max_m: datos.config?.altura_max_m,
        }),
        geomWkt,
      ]
    );

    insertados++;
    console.log(`  ✓ ${via.nombre}`);
  }

  console.log(`  → Insertadas: ${insertados} | Sin geometría: ${sinGeometria}`);

  if (sinGeometria > 0) {
    console.log(
      `  Tip: las calles sin geometría no están en red_vial todavía.`
    );
    console.log(`  Verificá que red-vial-${dataset}.geojson esté importado.`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const { municipio, all } = parsearArgs();

  if (!all && !municipio) {
    console.error("Uso: --municipio=<slug> | --all");
    process.exit(1);
  }

  const dbClient = new Client(DB_CONFIG);

  try {
    await dbClient.connect();

    if (all) {
      const archivos = fs
        .readdirSync(RESTRICCIONES_DIR)
        .filter((f) => f.endsWith(".json") && !f.includes(" "))
        .map((f) => f.replace(".json", ""))
        .sort();

      console.log(`Procesando ${archivos.length} municipio(s)...`);

      for (const m of archivos) {
        try {
          await procesarMunicipio(dbClient, m);
        } catch (err) {
          console.error(`  ✗ Error en ${m}:`, err);
        }
      }
    } else {
      await procesarMunicipio(dbClient, municipio!);
    }

    console.log("\n✅ Listo.");
    console.log(
      "   Siguiente paso: psql -d safetruck -f database/sql/03_restrictions.sql"
    );
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  } finally {
    await dbClient.end();
  }
}

main();
