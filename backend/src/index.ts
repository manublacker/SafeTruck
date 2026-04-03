/*******************************************************
 * index.ts
 *
 * Punto de entrada del servidor Express de SafeTruck.
 * Registro las rutas disponibles y levanto el servidor
 * en el puerto indicado.
 *******************************************************/

import express from "express";
import cors from "cors";
import routeRouter from "./routes/route";

const app = express();
const PORT = 3000;

// Habilito CORS para que el frontend pueda hacer requests al backend desde otro puerto
app.use(cors());

// Indico a Express que los requests van a tener cuerpo en formato JSON
// Sin esto, req.body llega undefined
app.use(express.json());

// Registro el router de ruteo bajo el prefijo /api/routes
// Cualquier request a /api/routes va a ser manejado por route.ts
app.use("/api/routes", routeRouter);

// Endpoint de health check: sirve para verificar que el servidor está vivo
// El frontend o cualquier monitor puede llamarlo para saber si la API responde
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "SafeTruck API" });
});

// Levanto el servidor y quedo escuchando en el puerto definido
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});