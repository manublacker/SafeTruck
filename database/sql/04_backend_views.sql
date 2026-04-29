-- =============================================================================
-- SafeTruck - 04_backend_views.sql
-- Vistas y funciones que consume el backend TypeScript.
-- Ejecutar DESPUÉS de 03_restrictions.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Vista: backend_nodos
-- Expone los nodos del grafo con lat/lon listos para el frontend.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW backend_nodos AS
SELECT
    id,
    ST_Y(geom) AS lat,
    ST_X(geom) AS lon
FROM nodos;

-- -----------------------------------------------------------------------------
-- Vista: backend_aristas_dirigidas
-- Una fila por dirección realmente transitable.
-- Si una calle es doble mano → dos filas.
-- Si es mano única         → una sola fila.
-- pgRouting ignora costos negativos, acá hacemos lo mismo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW backend_aristas_dirigidas AS
-- Dirección source → target
SELECT
    a.id          AS arista_id,
    a.source      AS from_node,
    a.target      AS to_node,
    a.costo       AS length_m,
    a.camion_permitido AS truck_allowed
FROM aristas a
WHERE a.source IS NOT NULL
  AND a.target IS NOT NULL
  AND a.costo  > 0

UNION ALL

-- Dirección target → source (solo si costo_reverso es válido)
SELECT
    a.id               AS arista_id,
    a.target           AS from_node,
    a.source           AS to_node,
    a.costo_reverso    AS length_m,
    a.camion_permitido AS truck_allowed
FROM aristas a
WHERE a.source IS NOT NULL
  AND a.target IS NOT NULL
  AND a.costo_reverso > 0;

-- -----------------------------------------------------------------------------
-- Función: nearest_graph_node(lon, lat)
-- Dado un punto geográfico devuelve el nodo del grafo más cercano.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nearest_graph_node(
    p_lon DOUBLE PRECISION,
    p_lat DOUBLE PRECISION
)
RETURNS TABLE (
    id          BIGINT,
    lat         DOUBLE PRECISION,
    lon         DOUBLE PRECISION,
    distancia_m DOUBLE PRECISION
)
LANGUAGE sql STABLE AS $$
    SELECT
        n.id,
        ST_Y(n.geom)                        AS lat,
        ST_X(n.geom)                        AS lon,
        ST_Distance(
            n.geom::geography,
            ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography  
        )                                   AS distancia_m
    FROM nodos n
    ORDER BY n.geom <-> ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)
    LIMIT 1;
$$;

-- -----------------------------------------------------------------------------
-- Función: export_graph_json(p_only_truck_allowed)
-- Devuelve el grafo como JSONB en el formato exacto que espera astar.ts.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION export_graph_json(
    p_only_truck_allowed BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object(
        'nodes',
        (
            SELECT jsonb_object_agg(
                id::TEXT,
                jsonb_build_object(
                    'id',  id::TEXT,
                    'lat', lat,
                    'lon', lon
                )
            )
            FROM backend_nodos
        ),
        'adjacency',
        (
            SELECT jsonb_object_agg(from_node::TEXT, edges)
            FROM (
                SELECT
                    from_node,
                    jsonb_agg(
                        jsonb_build_object(
                            'to',           to_node::TEXT,
                            'lengthM',      length_m,
                            'truckAllowed', truck_allowed,
                            'aristaId',     arista_id
                        )
                    ) AS edges
                FROM backend_aristas_dirigidas
                WHERE NOT p_only_truck_allowed OR truck_allowed = TRUE
                GROUP BY from_node
            ) sub
        )
    );
$$;