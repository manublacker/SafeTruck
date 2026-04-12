/*******************************************************
 * parsear-municipio.ts
 *
 * Lee un PDF de red de tránsito pesado de un municipio,
 * extrae las calles habilitadas usando la API de Anthropic,
 * y las inserta en la tabla red_camiones de PostgreSQL.
 *
 * Uso:
 *   npx ts-node scripts/parsear-municipio.ts \
 *     --pdf="database/data/restricciones/LANUS - Red de Transito Pesado.pdf" \
 *     --municipio=lanus
 *
 * Requisitos:
 *   - ANTHROPIC_API_KEY en el archivo .env de backend/
 *   - PostgreSQL corriendo con la base safetruck
 *   - Haber corrido importar.ts antes (para tener red_vial cargada)
 *
 * Después de correr este script, volver a ejecutar:
 *   psql -d safetruck -f database/sql/03_restrictions.sql
 *******************************************************/

import fs from "fs";
import path from "path";
import { Client } from "pg";
import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";

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
// Tipos esperados en la respuesta de la IA
// ---------------------------------------------------------------------------
interface CalleHabilitada {
  nombre: string;
  desde_calle: string | null;
  hasta_calle: string | null;
  tipo: string | null;           // "primaria" | "secundaria" | null
  restricciones: string | null;  // texto libre con restricciones adicionales
}

interface RespuestaIA {
  municipio: string;
  calles: CalleHabilitada[];
}

// ---------------------------------------------------------------------------
// Parsea los argumentos de línea de comandos
// Busca --pdf=... y --municipio=...
// ---------------------------------------------------------------------------
function parsearArgs(): { pdf: string; municipio: string } {
  const args = process.argv.slice(2);
  const pdfArg = args.find((a) => a.startsWith("--pdf="));
  const municipioArg = args.find((a) => a.startsWith("--municipio="));

  if (!pdfArg || !municipioArg) {
    console.error(
      "Uso: npx ts-node scripts/parsear-municipio.ts --pdf=<ruta> --municipio=<nombre>"
    );
    process.exit(1);
  }

  return {
    pdf: pdfArg.replace("--pdf=", "").replace(/^"|"$/g, ""),
    municipio: municipioArg.replace("--municipio=", "").toLowerCase(),
  };
}

// ---------------------------------------------------------------------------
// Llama a la API de Anthropic con el PDF y extrae las calles habilitadas
// ---------------------------------------------------------------------------
// Lee el JSON ya parseado en vez de llamar a la IA
function leerJSONParsado(municipio: string): RespuestaIA {
  const ruta = path.resolve(
    `database/data/restricciones/${municipio}-parsed.json`
  );
  const contenido = fs.readFileSync(ruta, "utf-8");
  return JSON.parse(contenido) as RespuestaIA;
}

// ---------------------------------------------------------------------------
// Busca la geometría de una calle en red_vial usando intersección espacial
// Devuelve la geometría WKT del tramo más representativo encontrado
// ---------------------------------------------------------------------------
async function buscarGeometria(
  dbClient: Client,
  nombre: string,
  municipio: string
): Promise<string | null> {
  // Extraigo las palabras significativas del nombre (saco "Avenida", "General", "Coronel", etc.)
  const stopWords = ["avenida", "av", "general", "gral", "coronel", "cnel",
    "presidente", "pte", "doctor", "dr", "intendente", "presbítero", "santo", "santa"];
  
  const palabras = nombre.toLowerCase().split(/\s+/)
    .filter(p => p.length > 3 && !stopWords.includes(p));

  if (palabras.length === 0) return null;

  // Busco con la palabra más distintiva (la más larga)
  const clave = palabras.sort((a, b) => b.length - a.length)[0];

  const result = await dbClient.query(
    `
    SELECT ST_AsText(ST_GeometryN(ST_LineMerge(ST_Collect(geom)), 1)) AS geom_wkt
    FROM red_vial
    WHERE dataset_origen = $1
      AND nombre ILIKE $2
    LIMIT 1
    `,
    [municipio, `%${clave}%`]
  );

  if (result.rows.length === 0 || !result.rows[0].geom_wkt) return null;
  return result.rows[0].geom_wkt as string;
}

// ---------------------------------------------------------------------------
// Inserta las calles extraídas en red_camiones
// ---------------------------------------------------------------------------
async function insertarEnRedCamiones(
  dbClient: Client,
  datos: RespuestaIA,
  municipio: string
): Promise<void> {
  console.log(`\nInsertando ${datos.calles.length} calles en red_camiones...`);

  let insertados = 0;
  let sinGeometria = 0;

  for (const calle of datos.calles) {
    // Busco la geometría en red_vial
    const geomWkt = await buscarGeometria(dbClient, calle.nombre, municipio);

    if (!geomWkt) {
      console.warn(`  ⚠ Sin geometría: ${calle.nombre}`);
      sinGeometria++;
      continue;
    }

    await dbClient.query(
      `
      INSERT INTO red_camiones (
        dataset_origen, nombre, desde_calle, hasta_calle,
        descripcion, metadata, geom
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        ST_GeomFromText($7, 4326)
      )
      `,
      [
        municipio,
        calle.nombre,
        calle.desde_calle,
        calle.hasta_calle,
        calle.restricciones,
        JSON.stringify({ tipo: calle.tipo }),
        geomWkt,
      ]
    );

    insertados++;
    console.log(`  ✓ ${calle.nombre}`);
  }

  console.log(`\n  Insertadas: ${insertados}`);
  console.log(`  Sin geometría en red_vial: ${sinGeometria}`);

  if (sinGeometria > 0) {
    console.log(
      `\n  Tip: las calles sin geometría no están en red_vial todavía.`
    );
    console.log(
      `  Verificá que el GeoJSON del municipio esté importado correctamente.`
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const { pdf, municipio } = parsearArgs();

  // Verifico que el PDF existe
  const rutaPdf = path.resolve(pdf);
  if (!fs.existsSync(rutaPdf)) {
    console.error(`❌ No se encontró el archivo: ${rutaPdf}`);
    process.exit(1);
  }

  console.log(`Municipio: ${municipio}`);
  console.log(`PDF: ${rutaPdf}`);

  // Extraigo las calles con IA
  let datos: RespuestaIA;
  try {
    datos = leerJSONParsado(municipio);
    console.log(`\n✓ IA extrajo ${datos.calles.length} calles.`);
  } catch (err) {
    console.error("❌ Error al procesar el PDF con la IA:", err);
    process.exit(1);
  }

  // Guardo el JSON intermedio para revisión
  const jsonSalida = path.resolve(
    `database/data/restricciones/${municipio}-parsed.json`
  );
  fs.writeFileSync(jsonSalida, JSON.stringify(datos, null, 2), "utf-8");
  console.log(`✓ JSON guardado en: ${jsonSalida}`);

  // Inserto en la base de datos
  const dbClient = new Client(DB_CONFIG);
  try {
    await dbClient.connect();
    await insertarEnRedCamiones(dbClient, datos, municipio);
    console.log("\n✅ Listo.");
    console.log(
      "   Siguiente paso: psql -d safetruck -f database/sql/03_restrictions.sql"
    );
  } catch (err) {
    console.error("❌ Error al insertar en la base de datos:", err);
    process.exit(1);
  } finally {
    await dbClient.end();
  }
}

main();