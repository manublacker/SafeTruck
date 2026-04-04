/*******************************************************
 * route.ts
 *
 * Define el endpoint POST /api/routes.
 * Recibe coordenadas de origen y destino junto con el
 * perfil del camión, calcula la ruta usando A* y devuelve
 * el resultado en el formato del contrato de API.
 *
 * Flujo de una request:
 *   1. Valido que lleguen los campos obligatorios
 *   2. Busco el nodo del grafo más cercano al origen
 *   3. Busco el nodo del grafo más cercano al destino
 *   4. Cargo el grafo completo desde la base de datos
 *   5. Ejecuto A* entre los dos nodos
 *   6. Armo y devuelvo la respuesta
 *******************************************************/

import { Router, Request, Response } from "express";
import { findTruckRoute } from "../algorithm/astar";
import pool from "../db";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const { originLabel, destinationLabel, vehicle, origin, destination } = req.body;

  // Valido que el request tenga los campos mínimos necesarios
  // origin y destination deben tener lat y lon; vehicle define las restricciones del camión
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
    // Busco el nodo del grafo más cercano a las coordenadas de origen
    // La función nearest_graph_node recibe (lon, lat) en ese orden porque PostGIS usa X, Y
    const resOrigen = await pool.query(
      "SELECT id, lat, lon FROM nearest_graph_node($1, $2)",
      [origin.lon, origin.lat]
    );

    // Hago lo mismo para el destino
    const resDestino = await pool.query(
      "SELECT id, lat, lon FROM nearest_graph_node($1, $2)",
      [destination.lon, destination.lat]
    );

    // Si alguno de los dos puntos no tiene un nodo cercano en el grafo, no puedo calcular la ruta
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

    // Cargo el grafo completo desde la base de datos en el formato que espera astar.ts
    // El FALSE indica que quiero todas las calles, no solo las habilitadas para camiones
    const resGrafo = await pool.query("SELECT export_graph_json(FALSE)");
    const grafo = resGrafo.rows[0]["export_graph_json"];

    // Ejecuto A* entre el nodo origen y el nodo destino con el perfil del camión
    // Los IDs de nodo se convierten a string porque así los maneja el algoritmo
    const resultado = findTruckRoute(
      grafo,
      String(nodoOrigen.id),
      String(nodoDestino.id),
      vehicle
    );

    // Si A* no encontró ningún camino válido, informo al cliente
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

    // Construyo el array de puntos de la ruta con las coordenadas reales de cada nodo
    // El frontend usa estos puntos para dibujar la ruta en el mapa
    const path = resultado.path.map((nodeId: string) => ({
      nodeId,
      lat: grafo.nodes[nodeId].lat,
      lon: grafo.nodes[nodeId].lon,
      label: "",
    }));

    // Estimo la duración asumiendo 30 km/h de velocidad promedio en ciudad
    // Es una aproximación simple válida para el MVP
    const velocidadMs = 30000 / 3600; // 30 km/h convertido a metros por segundo
    const estimatedDurationMin = Math.round(resultado.distance / velocidadMs / 60);

    // Devuelvo la ruta completa en el formato del contrato de API
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
    // Si ocurre un error inesperado, lo registro en consola y aviso al cliente
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