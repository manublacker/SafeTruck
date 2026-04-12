// Endpoint para convertir documentos municipales (PDF, texto, CSV) a JSON estructurado.
// Llama a la API de Anthropic desde el servidor para evitar problemas de CORS.
// Agregar a tu router de Express o directamente en el archivo principal.

import express, { Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router = express.Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Mapa de instrucciones según el tipo de formato que indica el cliente
const FORMAT_INSTRUCTIONS: Record<string, string> = {
  auto: "Analizá automáticamente el tipo de datos y extraé toda la información relevante.",
  coords:
    "El documento contiene coordenadas geográficas (latitud/longitud). Extraé cada punto o tramo como objetos con lat y lon.",
  streets:
    "El documento contiene nombres de calles habilitadas para camiones. Extraé cada calle con nombre, municipio si aparece, y cualquier restricción mencionada.",
  table:
    "El documento está en formato tabular. Extraé cada fila como un objeto JSON con las columnas como claves.",
  mixed:
    "El documento tiene tanto nombres de calles como coordenadas. Extraé ambos en secciones separadas del JSON.",
  custom: "Interpretá el formato según el contexto adicional provisto.",
};

// Construyo el system prompt con las reglas de extracción
function buildSystemPrompt(format: string, context: string): string {
  const instruction = FORMAT_INSTRUCTIONS[format] ?? FORMAT_INSTRUCTIONS.auto;
  return `Sos un parser experto en datos municipales de la Argentina (AMBA).
Tu tarea es convertir documentos de municipios a JSON estructurado para una app de ruteo de camiones.

Instrucciones de formato: ${instruction}
${context ? `\nContexto adicional del usuario: ${context}` : ""}

Reglas estrictas:
- Respondé ÚNICAMENTE con JSON válido, sin explicaciones, sin backticks, sin markdown.
- Si hay calles, incluí por cada una: nombre, municipio (si aparece), desde, hasta, restricciones (altura, peso, horarios).
- Si hay coordenadas, incluí: lat, lon, y cualquier atributo adicional presente.
- Si hay ambos tipos de datos, usá { "calles": [...], "coordenadas": [...] }.
- Normalizá nombres de calles: primera letra mayúscula, sin abreviaciones raras.
- Si el documento está vacío o es ilegible, devolvé: {"error": "No se pudo extraer información útil"}.`;
}

// POST /api/municipio/parse-text
// Body: { content: string, format: string, context: string }
router.post("/parse-text", async (req: Request, res: Response) => {
  const { content, format = "auto", context = "" } = req.body;

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return res.status(400).json({ error: "El campo 'content' es requerido." });
  }

  try {
    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      system: buildSystemPrompt(format, context),
      messages: [
        {
          role: "user",
          content: `Convertí este documento a JSON:\n\n${content}`,
        },
      ],
    });

    // Extraigo el texto de la respuesta
    const raw = message.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("")
      .trim();

    // Valido que sea JSON antes de devolver
    const parsed = JSON.parse(raw);
    return res.json({ ok: true, data: parsed });
  } catch (err) {
    if (err instanceof SyntaxError) {
      // La IA devolvió algo que no es JSON válido — lo devuelvo igual para que el cliente lo vea
      return res
        .status(422)
        .json({ error: "La IA devolvió un formato inesperado.", raw: err.message });
    }
    console.error("[municipio-parser] Error:", err);
    return res.status(500).json({ error: "Error interno al procesar el documento." });
  }
});

// POST /api/municipio/parse-pdf
// Body: { pdfBase64: string, format: string, context: string }
// Usa la capacidad nativa de Claude de leer PDFs como documentos
router.post("/parse-pdf", async (req: Request, res: Response) => {
  const { pdfBase64, format = "auto", context = "" } = req.body;

  if (!pdfBase64 || typeof pdfBase64 !== "string") {
    return res.status(400).json({ error: "El campo 'pdfBase64' es requerido." });
  }

  try {
    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      system: buildSystemPrompt(format, context),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64,
              },
            },
            {
              type: "text",
              text: "Convertí este documento a JSON siguiendo las instrucciones del sistema.",
            },
          ],
        },
      ],
    });

    const raw = message.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("")
      .trim();

    const parsed = JSON.parse(raw);
    return res.json({ ok: true, data: parsed });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return res
        .status(422)
        .json({ error: "La IA devolvió un formato inesperado.", raw: err.message });
    }
    console.error("[municipio-parser] Error:", err);
    return res.status(500).json({ error: "Error interno al procesar el PDF." });
  }
});

export default router;