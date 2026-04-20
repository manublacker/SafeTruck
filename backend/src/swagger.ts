/*******************************************************
 * swagger.ts
 *
 * Configuración de swagger-jsdoc para SafeTruck.
 * Genera el spec OpenAPI 3.0 completo de la API.
 *******************************************************/

import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "SafeTruck API",
      version: "1.0.0",
      description:
        "API de ruteo para camiones pesados. Calcula la ruta óptima entre dos puntos " +
        "respetando las restricciones físicas del vehículo (peso, altura, ancho, largo) " +
        "y las restricciones viales (peajes, corredores de tránsito pesado).",
      contact: {
        name: "Equipo SafeTruck",
        email: "sergio.lezama@utec.edu.pe",
      },
    },
    servers: [
      {
        url: "https://safetruck-backend.icysky-af60cdde.canadacentral.azurecontainerapps.io",
        description: "Servidor de producción (Azure)",
      },
      {
        url: "http://localhost:3000",
        description: "Servidor de desarrollo",
      },
    ],
    components: {
      schemas: {
        Coordinates: {
          type: "object",
          required: ["lat", "lon"],
          properties: {
            lat: { type: "number", example: -34.6037, description: "Latitud" },
            lon: { type: "number", example: -58.3816, description: "Longitud" },
          },
        },
        VehicleProfile: {
          type: "object",
          required: ["maxWeightKg", "maxHeightM", "maxWidthM", "maxLengthM"],
          properties: {
            maxWeightKg: { type: "number",  example: 12000, description: "Peso máximo en kilogramos" },
            maxHeightM:  { type: "number",  example: 4.1,   description: "Altura máxima en metros" },
            maxWidthM:   { type: "number",  example: 2.5,   description: "Ancho máximo en metros" },
            maxLengthM:  { type: "number",  example: 12,    description: "Largo máximo en metros" },
          },
        },
        RoutingOptions: {
          type: "object",
          properties: {
            avoidTolls:     { type: "boolean", example: true, description: "Evitar rutas con peaje" },
            preferHighways: { type: "boolean", example: true, description: "Preferir autopistas y corredores principales" },
          },
        },
        RouteNode: {
          type: "object",
          properties: {
            nodeId: { type: "string", example: "42" },
            lat:    { type: "number", example: -34.6022 },
            lon:    { type: "number", example: -58.5139 },
            label:  { type: "string", example: "Corredor Warnes" },
          },
        },
        RouteRequest: {
          type: "object",
          required: ["origin", "destination", "vehicle"],
          properties: {
            originLabel:      { type: "string", example: "Depósito Villa Devoto" },
            destinationLabel: { type: "string", example: "Centro logístico Chacarita" },
            origin:           { $ref: "#/components/schemas/Coordinates" },
            destination:      { $ref: "#/components/schemas/Coordinates" },
            vehicle:          { $ref: "#/components/schemas/VehicleProfile" },
            routingOptions:   { $ref: "#/components/schemas/RoutingOptions" },
          },
        },
        RouteResponse: {
          type: "object",
          properties: {
            found:            { type: "boolean", example: true },
            routeId:          { type: "string",  example: "route-1712345678901", nullable: true },
            originLabel:      { type: "string",  example: "Depósito Villa Devoto" },
            destinationLabel: { type: "string",  example: "Centro logístico Chacarita" },
            distanceM:        { type: "number",  example: 18450, description: "Distancia en metros" },
            estimatedDurationMin: { type: "integer", example: 34, description: "Duración estimada en minutos (a 30 km/h)" },
            routeSummary:     { type: "string",  example: "Ruta calculada correctamente." },
            path: { type: "array", items: { $ref: "#/components/schemas/RouteNode" } },
            warnings: { type: "array", items: { type: "string" }, example: [] },
          },
        },
        HealthResponse: {
          type: "object",
          properties: {
            status:  { type: "string", example: "ok" },
            service: { type: "string", example: "SafeTruck API" },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            found:            { type: "boolean",  example: false },
            routeId:          { type: "string",   nullable: true, example: null },
            originLabel:      { type: "string",   example: "" },
            destinationLabel: { type: "string",   example: "" },
            distanceM:        { type: "number",   example: 0 },
            estimatedDurationMin: { type: "integer", example: 0 },
            routeSummary:     { type: "string",   example: "Faltan campos obligatorios." },
            path:             { type: "array",    items: {}, example: [] },
            warnings: { type: "array", items: { type: "string" }, example: ["Enviá origin, destination y vehicle en el body."] },
          },
        },
        SearchResult: {
          type: "object",
          properties: {
            nombre:         { type: "string", example: "Av. Corrientes", description: "Nombre normalizado (sin tildes, capitalizado)" },
            nombreOriginal: { type: "string", example: "CORRIENTES", description: "Nombre original en la base de datos" },
            lat:            { type: "number", example: -34.6037, description: "Latitud del centroide de la calle" },
            lon:            { type: "number", example: -58.3816, description: "Longitud del centroide de la calle" },
            score:          { type: "string", example: "0.75", description: "Score de similitud (0-1). Mayor es mejor." },
          },
        },
        SearchResponse: {
          type: "object",
          properties: {
            results: {
              type: "array",
              items: { $ref: "#/components/schemas/SearchResult" },
              description: "Hasta 10 resultados ordenados por score descendente",
            },
          },
        },
        SearchError: {
          type: "object",
          properties: {
            results: { type: "array", items: {}, example: [] },
            error:   { type: "string", example: "Error interno al buscar." },
          },
        },
      },
    },
    paths: {
      "/health": {
        get: {
          tags: ["Sistema"],
          summary: "Health check",
          description: "Verifica que el servidor esté operativo.",
          responses: {
            200: {
              description: "Servidor operativo",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HealthResponse" } } },
            },
          },
        },
      },
      "/api/routes": {
        post: {
          tags: ["Ruteo"],
          summary: "Calcular ruta para camión",
          description:
            "Recibe coordenadas de origen y destino junto con el perfil del camión. " +
            "Ejecuta el algoritmo A* sobre el grafo vial para encontrar la ruta óptima " +
            "respetando las restricciones físicas del vehículo.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RouteRequest" },
                example: {
                  originLabel: "Depósito Villa Devoto",
                  destinationLabel: "Centro logístico Chacarita",
                  origin:      { lat: -34.6037, lon: -58.3816 },
                  destination: { lat: -34.5875, lon: -58.4370 },
                  vehicle: { maxWeightKg: 12000, maxHeightM: 4.1, maxWidthM: 2.5, maxLengthM: 12 },
                  routingOptions: { avoidTolls: true, preferHighways: true },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Ruta calculada (puede ser found: true o found: false)",
              content: { "application/json": { schema: { $ref: "#/components/schemas/RouteResponse" } } },
            },
            400: {
              description: "Faltan campos obligatorios",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            404: {
              description: "No se encontró nodo cercano a las coordenadas",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            500: {
              description: "Error interno del servidor",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/search": {
        get: {
          tags: ["Geocodificación"],
          summary: "Buscar calles por nombre",
          description:
            "Busca calles en la red vial usando similitud de trigramas (pg_trgm) sobre el " +
            "nombre normalizado. Devuelve hasta 10 resultados con coordenadas del centroide " +
            "de la calle, ordenados por score de similitud descendente. " +
            "Usado por el frontend para autocompletar origen y destino.",
          parameters: [
            {
              name: "q",
              in: "query",
              required: true,
              description: "Texto a buscar (mínimo 2 caracteres)",
              schema: { type: "string", minLength: 2, example: "Corrientes" },
            },
          ],
          responses: {
            200: {
              description: "Lista de calles encontradas (puede ser vacía)",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SearchResponse" },
                  examples: {
                    conResultados: {
                      summary: "Búsqueda con resultados",
                      value: {
                        results: [
                          { nombre: "Av. Corrientes", nombreOriginal: "CORRIENTES", lat: -34.6037, lon: -58.3816, score: "0.75" },
                          { nombre: "Corrientes",     nombreOriginal: "CORRIENTES", lat: -34.6045, lon: -58.4100, score: "0.60" },
                        ],
                      },
                    },
                    sinResultados: {
                      summary: "Búsqueda sin resultados",
                      value: { results: [] },
                    },
                  },
                },
              },
            },
            500: {
              description: "Error interno al consultar la base de datos",
              content: { "application/json": { schema: { $ref: "#/components/schemas/SearchError" } } },
            },
          },
        },
      },
    },
  },
  apis: [],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
