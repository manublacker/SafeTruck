-- =============================================================================
-- SafeTruck - 08_supabase_auth.sql
-- Migra users y trucks para usar Supabase Auth (UUID en vez de SERIAL).
-- Ejecutar con la tabla users vacía (no hay usuarios en producción aún).
-- =============================================================================

DROP TABLE IF EXISTS trucks;
DROP TABLE IF EXISTS users;

-- Perfil de usuario vinculado a auth.users de Supabase
CREATE TABLE users (
    id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email         TEXT NOT NULL,
    full_name     TEXT NOT NULL,
    company       TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX users_email_idx ON users (email);

-- Camiones vinculados por UUID
CREATE TABLE trucks (
    id               SERIAL PRIMARY KEY,
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    max_weight_kg    DOUBLE PRECISION NOT NULL,
    max_height_m     DOUBLE PRECISION NOT NULL,
    max_width_m      DOUBLE PRECISION NOT NULL,
    max_length_m     DOUBLE PRECISION NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX trucks_user_id_idx ON trucks (user_id);
