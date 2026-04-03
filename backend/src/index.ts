/*******************************************************
 * index.ts
 *
 * Punto de entrada del servidor Express.
 * Levanta la API REST de SafeTruck.
 *******************************************************/

import express from "express";
import routeRouter from "./routes/route";

const app = express();
const PORT = 3000;

// Middleware para parsear JSON en los requests
app.use(express.json());

// Rutas
app.use("/api/routes", routeRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "SafeTruck API" });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});