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
import routeRouter from "./routes/route";
import municipioParser from "./municipio-parser";
import searchRouter from "./routes/search";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.use("/api/routes", routeRouter);
app.use("/api/municipio", municipioParser);
app.use("/api/search", searchRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "SafeTruck API" });
});

app.use(express.static(path.join(__dirname, "../../frontend")));

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});