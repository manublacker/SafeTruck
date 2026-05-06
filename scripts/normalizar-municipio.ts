/*******************************************************
 * normalizar-municipio.ts
 *
 * Toma cualquier JSON de restricciones de un municipio
 * (en cualquier formato) y lo normaliza al formato
 * estándar de SafeTruck usando Claude.
 *
 * Uso:
 *   npx ts-node scripts/normalizar-municipio.ts \
 *     --input="ruta/al/archivo.json"
 *
 * Guarda el resultado en:
 *   database/data/restricciones/{partido_slug}.json
 *******************************************************/

import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";

const SALIDA_DIR = path.resolve("database/data/restricciones");

const FORMATO_ESTANDAR = {
  partido: "string — nombre del municipio",
  provincia: "string — siempre 'Buenos Aires'",
  fuente_legal: "string | null — ordenanza o decreto fuente",
  config: {
    limite_peso_kg: "number | null — límite de peso en kg",
    altura_max_m: "number | null — altura máxima estándar en metros",
    politica_ruteo: "string | null — política de ruteo",
  },
  vias_habilitadas: [
    {
      nombre: "string — nombre completo de la vía",
      desde: "string | null — calle o punto de inicio del tramo",
      hasta: "string | null — calle o punto de fin del tramo",
      jerarquia: "string | null — red_vial_principal | interconexion_industrial | secundaria | autopista | ruta_nacional | ruta_provincial",
      notas: "string | null — restricciones o notas adicionales",
    },
  ],
  alertas_altura: [
    {
      ubicacion: "string — descripción del punto de altura crítica",
      altura_max_m: "number — altura máxima permitida en metros",
    },
  ],
};

function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/^general_/, "");
}

function parsearArgs(): { input: string } {
  const args = process.argv.slice(2);
  const inputArg = args.find((a) => a.startsWith("--input="));
  if (!inputArg) {
    console.error("Uso: npx ts-node scripts/normalizar-municipio.ts --input=<ruta>");
    process.exit(1);
  }
  return { input: inputArg.replace("--input=", "").replace(/^"|"$/g, "") };
}

async function main(): Promise<void> {
  const { input } = parsearArgs();

  const rutaInput = path.resolve(input);
  if (!fs.existsSync(rutaInput)) {
    console.error(`❌ Archivo no encontrado: ${rutaInput}`);
    process.exit(1);
  }

  const contenido = fs.readFileSync(rutaInput, "utf-8");

  console.log(`Normalizando: ${path.basename(rutaInput)}`);
  console.log("Consultando Claude...");

  const client = new Anthropic();

  const mensaje = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Normalizá este JSON de restricciones de tránsito pesado al formato estándar de SafeTruck.

FORMATO ESTÁNDAR (esquema exacto a respetar):
${JSON.stringify(FORMATO_ESTANDAR, null, 2)}

REGLAS:
- Mantené todos los nombres de calles exactamente como aparecen en el input
- Todos los campos de texto van en español
- "provincia" siempre es "Buenos Aires"
- Si un campo no existe en el input, usá null
- Para "jerarquia" usá uno de: red_vial_principal, interconexion_industrial, secundaria, autopista, ruta_nacional, ruta_provincial — o null si no aplica
- Mapeos de campos en inglés: name→nombre, start→desde, end→hasta, location→ubicacion, max_height→altura_max_m

Devolvé ÚNICAMENTE el JSON resultante, sin explicaciones ni markdown.

INPUT:
${contenido}`,
      },
    ],
  });

  const textoRespuesta = mensaje.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  let normalizado: Record<string, unknown>;
  try {
    normalizado = JSON.parse(textoRespuesta);
  } catch {
    console.error("❌ Claude no devolvió JSON válido:");
    console.error(textoRespuesta.slice(0, 500));
    process.exit(1);
  }

  const partido = normalizado["partido"] as string;
  if (!partido) {
    console.error("❌ El JSON normalizado no tiene campo 'partido'");
    process.exit(1);
  }

  const slug = slugify(partido);
  fs.mkdirSync(SALIDA_DIR, { recursive: true });
  const rutaSalida = path.join(SALIDA_DIR, `${slug}.json`);
  fs.writeFileSync(rutaSalida, JSON.stringify(normalizado, null, 2), "utf-8");

  const vias = (normalizado["vias_habilitadas"] as unknown[])?.length ?? 0;
  const alertas = (normalizado["alertas_altura"] as unknown[])?.length ?? 0;

  console.log(`✓ Guardado: ${rutaSalida}`);
  console.log(`  ${vias} vías habilitadas, ${alertas} alertas de altura`);
  console.log(`\n  Siguiente paso:`);
  console.log(`  npx ts-node scripts/parsear-municipio.ts --municipio=${slug}`);
}

main();
