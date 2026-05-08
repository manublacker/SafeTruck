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
import reportsRouter from "./routes/reports";
import authRouter from "./routes/auth";
import usersRouter from "./routes/users";
import trucksRouter from "./routes/trucks";
import driversRouter from "./routes/drivers";
import truckDriversRouter from "./routes/truck-drivers";
import { authMiddleware } from "./middleware/authMiddleware";
import { notifyPendingTrips } from "./jobs/notifyTrips";
import incidentsRouter from "./routes/incidents";

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use("/api/incidents", incidentsRouter);

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
// app.use("/api", (req, res, next) => {
//   if (
//     req.path.startsWith("/auth") ||
//     req.path.startsWith("/docs")
//   ) {
//     return next();
//   }
//   return authMiddleware(req, res, next);
// });

// Rutas protegidas
app.use("/api/routes", routeRouter);
app.use("/api/municipio", municipioParser);
app.use("/api/search", searchRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/users", usersRouter);
app.use("/api/trucks",        authMiddleware, trucksRouter);
app.use("/api/drivers",       authMiddleware, driversRouter);
app.use("/api/truck-drivers", authMiddleware, truckDriversRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "SafeTruck API" });
});

app.use(express.static(path.join(__dirname, "../../frontend")));

// corro el job de notificaciones cada 6 horas
notifyPendingTrips(); // corre una vez al arrancar
setInterval(notifyPendingTrips, 6 * 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Swagger UI disponible en http://localhost:${PORT}/api/docs`);
});