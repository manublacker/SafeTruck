-- =============================================================================
-- SafeTruck - 10_refresh_restricciones.sql
--
-- Refresca aristas.camion_permitido para UN partido específico, sin tocar
-- el resto (CABA, Lanús, otros partidos ya cargados).
--
-- Ejecutar DESPUÉS de:
--   1. importar.ts --partido <slug>     (carga red_vial + red_camiones del partido)
--   2. 02_topology.sql                   (regenera aristas — solo si red_vial cambió)
--
-- Uso (desde psql):
--   psql "$DATABASE_URL" -v partido="'la_matanza'" -f database/sql/10_refresh_restricciones.sql
--
-- IMPORTANTE: el partido se pasa como dataset_origen tal como quedó en red_vial.
-- Si bajaste La Matanza con slug "la-matanza", en red_vial queda como "la_matanza"
-- (importar.ts hace .replace(/-/g, "_")).
-- =============================================================================

-- 1) Reseteo solo aristas que pertenecen al partido. Preserva CABA + Lanús.
UPDATE aristas
SET camion_permitido = FALSE
WHERE red_vial_id IN (
    SELECT id FROM red_vial WHERE dataset_origen = :partido
);

-- 2) Marco como permitidas las aristas que cruzan red_camiones de ese partido,
--    con buffer de 15 metros (mismo criterio que 03_restrictions.sql).
UPDATE aristas a
SET camion_permitido = TRUE
FROM red_camiones r
WHERE r.dataset_origen = :partido
  AND a.red_vial_id IN (
      SELECT id FROM red_vial WHERE dataset_origen = :partido
  )
  AND ST_DWithin(a.geom::geography, r.geom::geography, 15);

-- 3) Reporte de la operación
SELECT
    rv.dataset_origen,
    COUNT(*)                                       AS total_aristas,
    COUNT(*) FILTER (WHERE a.camion_permitido)     AS habilitadas
FROM aristas a
JOIN red_vial rv ON rv.id = a.red_vial_id
WHERE rv.dataset_origen = :partido
GROUP BY rv.dataset_origen;
