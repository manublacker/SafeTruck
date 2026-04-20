/*******************************************************
 * index.ts
 *
 * Punto de entrada del servidor Express de SafeTruck.
 * Registro las rutas disponibles y levanto el servidor
 * en el puerto indicado.
 *******************************************************/
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./swagger";
import routeRouter from "./routes/route";
import municipioParser from "./municipio-parser";
import searchRouter from "./routes/search";
import authRouter from "./routes/auth";
import { authMiddleware } from "./middleware/authMiddleware";

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Swagger UI: documentación interactiva en /api/docs
app.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: "SafeTruck API Docs",
    swaggerOptions: { persistAuthorization: true },
  })
);

// Spec en JSON (importable desde Postman, Insomnia, etc.)
app.get("/api/docs.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// Rutas públicas — sin token requerido
app.use("/api/auth", authRouter);

// Guard JWT: protege todas las rutas /api/* excepto /api/auth y /api/docs
app.use("/api", (req, res, next) => {
  if (
    req.path.startsWith("/auth") ||
    req.path.startsWith("/docs")
  ) {
    return next();
  }
  return authMiddleware(req, res, next);
});

// Rutas protegidas
app.use("/api/routes", routeRouter);
app.use("/api/municipio", municipioParser);
app.use("/api/search", searchRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "SafeTruck API" });
});

app.use(express.static(path.join(__dirname, "../../frontend")));

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Swagger UI disponible en http://localhost:${PORT}/api/docs`);
});