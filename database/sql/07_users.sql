-- =============================================================================
-- SafeTruck - Tabla de usuarios y camiones
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. USUARIOS
--    Almacena credenciales y datos personales de cada usuario.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    full_name     TEXT NOT NULL,
    company       TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);

-- -----------------------------------------------------------------------------
-- 2. CAMIONES
--    Cada usuario puede tener uno o más camiones con sus dimensiones y peso.
--    Al eliminar un usuario se eliminan en cascada sus camiones.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trucks (
    id               SERIAL PRIMARY KEY,
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,                -- ej: "Volvo FH #1"
    max_weight_kg    DOUBLE PRECISION NOT NULL,    -- peso máximo en kg
    max_height_m     DOUBLE PRECISION NOT NULL,    -- altura máxima en metros
    max_width_m      DOUBLE PRECISION NOT NULL,    -- ancho máximo en metros
    max_length_m     DOUBLE PRECISION NOT NULL,    -- largo máximo en metros
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trucks_user_id_idx ON trucks (user_id);
