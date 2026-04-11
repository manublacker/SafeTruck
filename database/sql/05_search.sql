-- =======================================================
-- 05_search.sql
--
-- Habilito extensiones para búsqueda tolerante a errores.
-- Agrego columna nombre_buscable a red_vial con el nombre
-- normalizado (sin comas, sin abreviaciones, sin tildes).
-- Creo índices de trigramas sobre esa columna.
-- =======================================================

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- -------------------------------------------------------
-- Columna de nombre normalizado
--
-- El dataset de CABA tiene nombres en varios formatos:
--   "CHAVEZ, JORGE"        → quiero "JORGE CHAVEZ"
--   "PAZ, GRAL. AV."       → quiero "AVENIDA GENERAL PAZ"
--   "LUGONES, LEOPOLDO AV."→ quiero "LEOPOLDO LUGONES AVENIDA"
--
-- La normalizo una sola vez al importar/migrar para no
-- recalcularla en cada búsqueda.
-- -------------------------------------------------------
ALTER TABLE red_vial
  ADD COLUMN IF NOT EXISTS nombre_buscable TEXT;

-- Función que convierte un nombre del dataset al formato
-- natural que un usuario escribiría en el buscador.
CREATE OR REPLACE FUNCTION normalizar_nombre(nombre TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  resultado TEXT;
  partes    TEXT[];
  apellido  TEXT;
  resto     TEXT;
BEGIN
  IF nombre IS NULL OR nombre = '' THEN
    RETURN NULL;
  END IF;

  resultado := nombre;

  -- Expando abreviaciones comunes antes de cualquier otra transformación
  resultado := regexp_replace(resultado, '\mAV\.\s*',    'AVENIDA ',   'gi');
  resultado := regexp_replace(resultado, '\mGRAL\.\s*',  'GENERAL ',   'gi');
  resultado := regexp_replace(resultado, '\mINT\.\s*',   'INTENDENTE ','gi');
  resultado := regexp_replace(resultado, '\mDR\.\s*',    'DOCTOR ',    'gi');
  resultado := regexp_replace(resultado, '\mPTE\.\s*',   'PRESIDENTE ','gi');
  resultado := regexp_replace(resultado, '\mCNEL\.\s*',  'CORONEL ',   'gi');
  resultado := regexp_replace(resultado, '\mSTA\.\s*',   'SANTA ',     'gi');
  resultado := regexp_replace(resultado, '\mSTO\.\s*',   'SANTO ',     'gi');

  -- Si tiene coma, asumo formato "APELLIDO, NOMBRE" y lo invierto
  IF resultado LIKE '%,%' THEN
    partes   := string_to_array(resultado, ',');
    apellido := trim(partes[1]);
    -- El resto es todo lo que sigue a la primera coma
    resto    := trim(array_to_string(partes[2:], ' '));
    resultado := resto || ' ' || apellido;
  END IF;

  -- Saco paréntesis y su contenido (ej: "(NO OFICIAL)")
  resultado := regexp_replace(resultado, '\([^)]*\)', '', 'g');

  -- Colapso espacios múltiples que pueden quedar
  resultado := trim(regexp_replace(resultado, '\s+', ' ', 'g'));

  RETURN resultado;
END;
$$;

-- Aplico la función a toda la tabla
UPDATE red_vial
SET nombre_buscable = normalizar_nombre(nombre)
WHERE nombre IS NOT NULL;

-- -------------------------------------------------------
-- Índice de trigramas sobre nombre_buscable
-- -------------------------------------------------------
DROP INDEX IF EXISTS idx_red_vial_nombre_trgm;
CREATE INDEX idx_red_vial_nombre_trgm
  ON red_vial
  USING GIN (unaccent(lower(nombre_buscable)) gin_trgm_ops);

-- -------------------------------------------------------
-- Vista de lugares buscables
-- -------------------------------------------------------
CREATE OR REPLACE VIEW vw_lugares AS
  SELECT
    nombre,
    nombre_buscable,
    'calle' AS tipo,
    geom
  FROM red_vial
  WHERE nombre_buscable IS NOT NULL
    AND nombre_buscable <> '';

-- -------------------------------------------------------
-- Verificación: probá estos casos después de correr el script
--
--   SELECT nombre, nombre_buscable FROM red_vial
--   WHERE nombre LIKE '%,%' LIMIT 10;
--
--   SELECT nombre_buscable,
--          similarity(unaccent(lower(nombre_buscable)), 'general paz') AS score
--   FROM red_vial
--   WHERE similarity(unaccent(lower(nombre_buscable)), 'general paz') > 0.1
--   ORDER BY score DESC LIMIT 5;
-- -------------------------------------------------------