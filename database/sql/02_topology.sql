-- =============================================================================
-- SafeTruck - 02_topology.sql
-- Construye el grafo de routing a partir de red_vial.
-- Ejecutar DESPUÉS de que importar.ts haya cargado datos en red_vial.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Paso 1: Cargar aristas desde red_vial
--
-- Convención de costos:
--   CRECIENTE  → costo = longitud_m,  costo_reverso = -1
--   DECRECIENTE → costo = -1,         costo_reverso = longitud_m
--   cualquier otro (DOBLE MANO, NULL) → ambos = longitud_m
-- pgRouting ignora aristas con costo negativo al calcular rutas.
-- -----------------------------------------------------------------------------
INSERT INTO aristas (red_vial_id, costo, costo_reverso, camion_permitido, sentido, geom)
SELECT
    id,
    CASE
    WHEN UPPER(sentido) = 'DECRECIENTE' THEN -1
    ELSE COALESCE(longitud_m, ST_Length(geom::geography))
END AS costo,
CASE
    WHEN UPPER(sentido) = 'CRECIENTE' THEN -1
    ELSE COALESCE(longitud_m, ST_Length(geom::geography))
END AS costo_reverso,
    FALSE,
    sentido,
    geom
FROM red_vial
WHERE geom IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Paso 2: Extraer vértices únicos (intersecciones) y cargar en nodos
-- -----------------------------------------------------------------------------
INSERT INTO nodos (id, geom)
SELECT
    id,
    ST_SetSRID(geom, 4326)
FROM pgr_extractVertices(
    'SELECT id::BIGINT, geom FROM aristas WHERE geom IS NOT NULL'
);

-- Sincronizar la secuencia del BIGSERIAL con los IDs insertados
SELECT setval(
    pg_get_serial_sequence('nodos', 'id'),
    COALESCE(MAX(id), 1)
) FROM nodos;

-- -----------------------------------------------------------------------------
-- Paso 3: Asignar source y target a cada arista usando los nodos generados
-- -----------------------------------------------------------------------------
UPDATE aristas a
SET
    source = n_start.id,
    target = n_end.id
FROM nodos n_start, nodos n_end
WHERE ST_DWithin(ST_StartPoint(a.geom), n_start.geom, 0.000001)
  AND ST_DWithin(ST_EndPoint(a.geom),   n_end.geom,   0.000001);

-- -----------------------------------------------------------------------------
-- Paso 4: Índices adicionales post-carga para acelerar queries de routing
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS aristas_costo_idx         ON aristas (costo);
CREATE INDEX IF NOT EXISTS aristas_costo_reverso_idx ON aristas (costo_reverso);
