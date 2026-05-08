-- =============================================================================
-- SafeTruck - Gestión de flota: extiende trucks, agrega drivers y truck_drivers
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TRUCKS — campos operacionales adicionales
-- -----------------------------------------------------------------------------
ALTER TABLE trucks
  ADD COLUMN IF NOT EXISTS patente         TEXT,
  ADD COLUMN IF NOT EXISTS modelo          TEXT,
  ADD COLUMN IF NOT EXISTS anio            INTEGER,
  ADD COLUMN IF NOT EXISTS km_actual       INTEGER,
  ADD COLUMN IF NOT EXISTS fecha_service   DATE,
  ADD COLUMN IF NOT EXISTS proximo_service DATE,
  ADD COLUMN IF NOT EXISTS estado          TEXT NOT NULL DEFAULT 'Activo',
  ADD COLUMN IF NOT EXISTS is_active       BOOLEAN NOT NULL DEFAULT true;

-- -----------------------------------------------------------------------------
-- 2. DRIVERS — conductores asociados a un usuario (empresa)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drivers (
  id                    SERIAL PRIMARY KEY,
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nombre                TEXT NOT NULL,
  telefono              TEXT,
  licencia              TEXT,
  categoria_licencia    TEXT,
  vencimiento_licencia  DATE,
  estado                TEXT NOT NULL DEFAULT 'Activo',
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS drivers_user_id_idx ON drivers (user_id);

-- -----------------------------------------------------------------------------
-- 3. TRUCK_DRIVERS — asignación N:M (en práctica 1:1 vía UNIQUE truck_id)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS truck_drivers (
  id         SERIAL PRIMARY KEY,
  truck_id   INTEGER NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  driver_id  INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (truck_id, driver_id)
);

CREATE INDEX IF NOT EXISTS truck_drivers_truck_id_idx  ON truck_drivers (truck_id);
CREATE INDEX IF NOT EXISTS truck_drivers_driver_id_idx ON truck_drivers (driver_id);
