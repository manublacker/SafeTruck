-- =============================================================================
-- SafeTruck - 03_restrictions.sql
-- Marca qué aristas están habilitadas para camiones.
-- Ejecutar DESPUÉS de 02_topology.sql y de que importar.ts haya cargado
-- datos en red_camiones.
--
-- Método: intersección espacial con buffer de 15 metros.
-- NO se usa el nombre de la calle para evitar inconsistencias entre datasets
-- (ej: "AVENIDA RIVADAVIA" vs "RIVADAVIA, AV.").
-- =============================================================================

UPDATE aristas a
SET camion_permitido = TRUE
FROM red_camiones r
WHERE ST_Intersects(
    ST_Buffer(r.geom::geography, 15)::geometry,
    a.geom
);
