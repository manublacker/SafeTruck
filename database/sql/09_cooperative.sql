-- =============================================================================
-- SafeTruck - 09_cooperative.sql
-- Sistema cooperativo de reportes de calles para camiones.
-- Ejecutar DESPUÉS de 07_users.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. HISTORIAL DE VIAJES
--    Guarda cada ruta calculada y aceptada por el usuario.
--    Es el prerequisito para notificaciones diferidas y reportes post-viaje.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trips (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    truck_id        INTEGER REFERENCES trucks(id) ON DELETE SET NULL,
    origin_lat      DOUBLE PRECISION NOT NULL,
    origin_lon      DOUBLE PRECISION NOT NULL,
    destination_lat DOUBLE PRECISION NOT NULL,
    destination_lon DOUBLE PRECISION NOT NULL,
    arista_ids      INTEGER[] NOT NULL DEFAULT '{}',  -- aristas recorridas en orden
    distance_m      DOUBLE PRECISION,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notification_sent_at TIMESTAMPTZ  -- cuando se mandó la notif diferida
);

CREATE INDEX IF NOT EXISTS trips_user_id_idx ON trips (user_id);
CREATE INDEX IF NOT EXISTS trips_started_at_idx ON trips (started_at);

-- -----------------------------------------------------------------------------
-- 2. REPORTES INDIVIDUALES DE USUARIOS
--    Cada fila es un reporte de "me multaron" o "pasé sin problemas".
--    El campo arista_id referencia la arista reportada.
--    El campo trip_id es opcional: si el usuario reporta desde el historial
--    de un viaje, lo vinculamos; si reporta manualmente, puede ser null.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS street_reports (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    trip_id         BIGINT REFERENCES trips(id) ON DELETE SET NULL,
    arista_id       INTEGER NOT NULL,  -- referencia a aristas.id
    report_type     TEXT NOT NULL CHECK (report_type IN ('multa', 'sin_problemas')),
    report_lat      DOUBLE PRECISION,  -- coordenada donde tocó el mapa
    report_lon      DOUBLE PRECISION,
    notes           TEXT,
    reported_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS street_reports_arista_id_idx ON street_reports (arista_id);
CREATE INDEX IF NOT EXISTS street_reports_user_id_idx   ON street_reports (user_id);
CREATE INDEX IF NOT EXISTS street_reports_reported_at_idx ON street_reports (reported_at);

-- -----------------------------------------------------------------------------
-- 3. SCORE DE CONFIANZA POR ARISTA
--    Una fila por arista con score acumulado.
--    Se actualiza cada vez que llega un nuevo reporte.
--
--    Lógica de score:
--      - Reporte 'multa'         → score -= 10
--      - Reporte 'sin_problemas' → score += 1
--
--    Estados derivados del score:
--      score < -5   → 'bloqueada'   (excluida del ruteo)
--      score > 10   → 'habilitada'  (tomada como permitida)
--      entre -5 y 10 → 'desconocida' (ruteo normal con advertencia si < 0)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS edge_trust_scores (
    arista_id       INTEGER PRIMARY KEY,  -- referencia a aristas.id
    score           DOUBLE PRECISION NOT NULL DEFAULT 0,
    multa_count     INTEGER NOT NULL DEFAULT 0,
    ok_count        INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'desconocida'
                        CHECK (status IN ('habilitada', 'bloqueada', 'desconocida')),
    last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 4. FUNCIÓN: registrar_reporte(arista_id, tipo)
--    Inserta o actualiza el score de una arista al llegar un reporte.
--    Usa UPSERT para crear la fila si no existía todavía.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION registrar_reporte(
    p_arista_id INTEGER,
    p_tipo      TEXT  -- 'multa' | 'sin_problemas'
)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
    v_delta      DOUBLE PRECISION;
    v_new_score  DOUBLE PRECISION;
BEGIN
    -- determino cuánto suma o resta este reporte
    v_delta := CASE p_tipo
        WHEN 'multa'          THEN -10.0
        WHEN 'sin_problemas'  THEN   1.0
        ELSE 0.0
    END;

    -- inserto la fila si no existe, o actualizo si ya existe (UPSERT)
    INSERT INTO edge_trust_scores (arista_id, score, multa_count, ok_count, status, last_updated)
    VALUES (
        p_arista_id,
        v_delta,
        CASE WHEN p_tipo = 'multa' THEN 1 ELSE 0 END,
        CASE WHEN p_tipo = 'sin_problemas' THEN 1 ELSE 0 END,
        CASE
            WHEN v_delta < -5  THEN 'bloqueada'
            WHEN v_delta > 10  THEN 'habilitada'
            ELSE 'desconocida'
        END,
        NOW()
    )
    ON CONFLICT (arista_id) DO UPDATE SET
        score        = edge_trust_scores.score + v_delta,
        multa_count  = edge_trust_scores.multa_count  + CASE WHEN p_tipo = 'multa'         THEN 1 ELSE 0 END,
        ok_count     = edge_trust_scores.ok_count     + CASE WHEN p_tipo = 'sin_problemas' THEN 1 ELSE 0 END,
        last_updated = NOW(),
        -- recalculo el status según el nuevo score acumulado
        status = CASE
            WHEN (edge_trust_scores.score + v_delta) < -5  THEN 'bloqueada'
            WHEN (edge_trust_scores.score + v_delta) > 10  THEN 'habilitada'
            ELSE 'desconocida'
        END;
END;
$$;
-- -----------------------------------------------------------------------------
-- 5. PUSH TOKEN por usuario
--    Guarda el token de Expo para mandar notificaciones push.
--    Se actualiza cada vez que el usuario abre la app.
-- -----------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token TEXT;