-- =============================================================================
-- SafeTruck - Esquema PostGIS para red vial de Argentina
-- Ejecutar como superusuario o con permisos para CREATE EXTENSION
-- =============================================================================
 
CREATE EXTENSION IF NOT EXISTS postgis; --guardar geometrias(mapas, calles, coordenadas).
CREATE EXTENSION IF NOT EXISTS pgrouting; -- extension de postgreSQL para hacer rutas

-- -----------------------------------------------------------------------------
-- 1. RED VIAL COMPLETA
--    Modelo GENERICO para cualquier fuente vial del pais. (caba, pba, rn, osm, etc.)
--    La idea es guardar en columnas solo lo comun entre datasets
--    y dejar lo especifico de cada fuente dentro de metadata.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS red_vial (
    id               BIGSERIAL PRIMARY KEY, -- BIGSERIAL: una columna entera de 64 bits que se autoincrementa sola al insertar filas nuevas.
    dataset_origen   TEXT NOT NULL,               -- caba | pba | rn | osm | etc.
    feature_id       TEXT NOT NULL,               -- ID original dentro de la fuente
    codigo           TEXT,                        -- codigo o referencia propia del dataset
    nombre           TEXT NOT NULL,               -- nombre principal de la via
    nombre_alterno   TEXT,                        -- nombre alternativo visible en mapa o historico
    tipo_via         TEXT,                        -- CALLE | AVENIDA | AUTOPISTA | RUTA | etc.
    longitud_m       DOUBLE PRECISION,
    sentido          TEXT,                        -- CRECIENTE | DECRECIENTE | DOBLE MANO | etc.
    jerarquia_vial   TEXT,                        -- troncal | local | distribuidora | etc.
    jurisdiccion     TEXT,                        -- CABA | Buenos Aires | Nacional | etc.
    metadata         JSONB NOT NULL DEFAULT '{}'::jsonb, -- columna para guardar datos adicionales específicos de cada dataset
    geom             GEOMETRY(LINESTRING, 4326) NOT NULL, -- geometría de la vía, con SRID 4326 (coord estandar mundial)
    CONSTRAINT red_vial_dataset_feature_unique UNIQUE (dataset_origen, feature_id) -- evita duplicados 
);

-- índice = atajo para encontrar filas rápido
CREATE INDEX IF NOT EXISTS red_vial_geom_idx  ON red_vial USING GIST (geom);
CREATE INDEX IF NOT EXISTS red_vial_codigo_idx ON red_vial (codigo);
CREATE INDEX IF NOT EXISTS red_vial_sentido_idx ON red_vial (sentido);
CREATE INDEX IF NOT EXISTS red_vial_dataset_idx ON red_vial (dataset_origen);
CREATE INDEX IF NOT EXISTS red_vial_jurisdiccion_idx ON red_vial (jurisdiccion);

-- -----------------------------------------------------------------------------
-- 2. RED DE TRÁNSITO PESADO (tramos habilitados para camiones)
--    Tabla generica para corredores o tramos habilitados a camiones.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS red_camiones (
    id          SERIAL PRIMARY KEY,
    dataset_origen TEXT NOT NULL,
    nombre TEXT NOT NULL,          -- avenida/calle principal habilitada
    desde_calle TEXT,              -- calle transversal de inicio
    hasta_calle TEXT,              -- calle transversal de fin
    descripcion TEXT,              -- texto original si querés conservarlo
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    geom GEOMETRY(LINESTRING, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS red_camiones_geom_idx ON red_camiones USING GIST (geom);
CREATE INDEX IF NOT EXISTS red_camiones_dataset_idx ON red_camiones (dataset_origen);

-- -----------------------------------------------------------------------------
-- 3. ARISTAS DEL GRAFO DE ROUTING --> los tramos por donde va a circular el algoritmo 
--    Generadas a partir de red_vial (excluyendo pasajes privados).
--    source/target son IDs de nodos de inicio y fin, populados por pgr_createTopology.
--
--    Convención de costos para pgRouting:
--      costo          = longitud_m en la dirección válida del tramo
--      costo_reverso  = longitud_m si es DOBLE mano, -1 si es mano única xq no se puede circular en ese sentido
--                       (pgRouting ignora aristas con costo negativo)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aristas (
    id               SERIAL PRIMARY KEY,
    red_vial_id      BIGINT REFERENCES red_vial(id),  -- vincula cada arista con la fila original de red_vial.
    source           INTEGER,   -- nodo origen  (populado por pgr_createTopology)
    target           INTEGER,   -- nodo destino (populado por pgr_createTopology)
    costo            DOUBLE PRECISION NOT NULL, -- costo para ir de source a target (ej: longitud_m)
    costo_reverso    DOUBLE PRECISION NOT NULL,
    camion_permitido BOOLEAN NOT NULL DEFAULT FALSE,
    sentido          TEXT,      -- CRECIENTE | DECRECIENTE | DOBLE MANO | etc. (copiado de red_vial para referencia rápida)
    geom             GEOMETRY(LINESTRING, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS aristas_geom_idx           ON aristas USING GIST (geom);
CREATE INDEX IF NOT EXISTS aristas_source_idx          ON aristas (source);
CREATE INDEX IF NOT EXISTS aristas_target_idx          ON aristas (target);
CREATE INDEX IF NOT EXISTS aristas_camion_idx          ON aristas (camion_permitido);
CREATE INDEX IF NOT EXISTS aristas_red_vial_id_idx    ON aristas (red_vial_id);

-- -----------------------------------------------------------------------------
-- 4. NODOS (intersecciones)
--    Tabla que guarda los puntos del grafo
--    Populados automáticamente por pgr_createTopology en el paso 03.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nodos (
    id   BIGSERIAL PRIMARY KEY,     -- identificacion del nodo
    geom GEOMETRY(POINT, 4326)      -- posicion geografica del nodo
);

CREATE INDEX IF NOT EXISTS nodos_geom_idx ON nodos USING GIST (geom);
