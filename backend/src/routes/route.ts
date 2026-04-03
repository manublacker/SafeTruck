import { Router, Request, Response } from "express";
import { findTruckRoute } from "../../../Algorithm/astar";
import pool from "../db";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const { originLabel, destinationLabel, vehicle, origin, destination } = req.body;

  if (!origin || !destination || !vehicle) {
    res.status(400).json({
      found: false,
      routeId: null,
      originLabel: originLabel ?? "",
      destinationLabel: destinationLabel ?? "",
      distanceM: 0,
      estimatedDurationMin: 0,
      routeSummary: "Faltan campos obligatorios.",
      path: [],
      warnings: ["Enviá origin, destination y vehicle en el body."],
    });
    return;
  }

  try {
    const resOrigen = await pool.query(
      "SELECT id, lat, lon FROM nearest_graph_node($1, $2)",
      [origin.lon, origin.lat]
    );
    const resDestino = await pool.query(
      "SELECT id, lat, lon FROM nearest_graph_node($1, $2)",
      [destination.lon, destination.lat]
    );

    if (resOrigen.rows.length === 0 || resDestino.rows.length === 0) {
      res.status(404).json({
        found: false,
        routeId: null,
        originLabel: originLabel ?? "",
        destinationLabel: destinationLabel ?? "",
        distanceM: 0,
        estimatedDurationMin: 0,
        routeSummary: "No se encontró un nodo cercano.",
        path: [],
        warnings: ["Verificá que las coordenadas estén dentro del área cubierta."],
      });
      return;
    }

    const nodoOrigen = resOrigen.rows[0];
    const nodoDestino = resDestino.rows[0];

    const resGrafo = await pool.query("SELECT export_graph_json(FALSE)");
    const grafo = resGrafo.rows[0]["export_graph_json"];


    const resultado = findTruckRoute(
      grafo,
      String(nodoOrigen.id),
      String(nodoDestino.id),
      vehicle
    );

    if (!resultado.found) {
      res.status(200).json({
        found: false,
        routeId: null,
        originLabel: originLabel ?? "",
        destinationLabel: destinationLabel ?? "",
        distanceM: 0,
        estimatedDurationMin: 0,
        routeSummary: "No se encontró una ruta compatible con el perfil del camión.",
        path: [],
        warnings: ["Probá modificar restricciones o seleccionar otro destino."],
      });
      return;
    }

    const path = resultado.path.map((nodeId: string) => ({
      nodeId,
      lat: grafo.nodes[nodeId].lat,
      lon: grafo.nodes[nodeId].lon,
      label: "",
    }));

    const velocidadMs = 30000 / 3600;
    const estimatedDurationMin = Math.round(resultado.distance / velocidadMs / 60);

    res.status(200).json({
      found: true,
      routeId: `route-${Date.now()}`,
      originLabel: originLabel ?? "",
      destinationLabel: destinationLabel ?? "",
      distanceM: Math.round(resultado.distance),
      estimatedDurationMin,
      routeSummary: "Ruta calculada correctamente.",
      path,
      warnings: [],
    });

  } catch (error) {
    console.error("Error en /api/routes:", error);
    res.status(500).json({
      found: false,
      routeId: null,
      originLabel: originLabel ?? "",
      destinationLabel: destinationLabel ?? "",
      distanceM: 0,
      estimatedDurationMin: 0,
      routeSummary: "Error interno del servidor.",
      path: [],
      warnings: ["Contactá al equipo de backend."],
    });
  }
});

export default router;
