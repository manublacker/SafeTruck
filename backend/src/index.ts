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

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Indico a Express que los requests van a tener cuerpo en formato JSON
// Sin esto, req.body llega undefined
app.use(express.json());

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

// Registro el router de ruteo bajo el prefijo /api/routes
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