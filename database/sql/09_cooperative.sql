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
            WHEN v_delta < -25  THEN 'bloqueada'
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
            WHEN (edge_trust_scores.score + v_delta) < -25  THEN 'bloqueada'
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
-- -----------------------------------------------------------------------------
-- 6. INCIDENTES EN VÍA (eventos temporales estilo Waze)
--    Accidentes, tráfico, obras, controles, objetos, cortes.
--    Se vencen automáticamente después de expires_at.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incidents (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    arista_id       INTEGER NOT NULL,
    incident_type   TEXT NOT NULL CHECK (incident_type IN (
                        'accidente',
                        'trafico',
                        'obra',
                        'control_policial',
                        'objeto_en_via',
                        'corte'
                    )),
    lat             DOUBLE PRECISION NOT NULL,
    lon             DOUBLE PRECISION NOT NULL,
    notes           TEXT,
    reported_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,  -- calculado al insertar según el tipo
    confirmed_count INTEGER NOT NULL DEFAULT 1,  -- otros usuarios que confirmaron
    active          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS incidents_arista_id_idx  ON incidents (arista_id);
CREATE INDEX IF NOT EXISTS incidents_active_idx     ON incidents (active);
CREATE INDEX IF NOT EXISTS incidents_expires_at_idx ON incidents (expires_at);

-- -----------------------------------------------------------------------------
-- 7. FUNCIÓN: reportar_incidente(arista_id, tipo, lat, lon)
--    Inserta un incidente y calcula su expiración según el tipo.
--
--    Tiempos de expiración por tipo:
--      accidente        → 3 horas
--      trafico          → 1 hora
--      obra             → 24 horas
--      control_policial → 2 horas
--      objeto_en_via    → 2 horas
--      corte            → 6 horas
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reportar_incidente(
    p_arista_id     INTEGER,
    p_tipo          TEXT,
    p_lat           DOUBLE PRECISION,
    p_lon           DOUBLE PRECISION,
    p_user_id       UUID DEFAULT NULL,
    p_notes         TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    v_duracion INTERVAL;
    v_id       BIGINT;
BEGIN
    v_duracion := CASE p_tipo
        WHEN 'accidente'        THEN INTERVAL '3 hours'
        WHEN 'trafico'          THEN INTERVAL '1 hour'
        WHEN 'obra'             THEN INTERVAL '24 hours'
        WHEN 'control_policial' THEN INTERVAL '2 hours'
        WHEN 'objeto_en_via'    THEN INTERVAL '2 hours'
        WHEN 'corte'            THEN INTERVAL '6 hours'
        ELSE                         INTERVAL '2 hours'
    END;

    INSERT INTO incidents (user_id, arista_id, incident_type, lat, lon, notes, expires_at)
    VALUES (p_user_id, p_arista_id, p_tipo, p_lat, p_lon, p_notes, NOW() + v_duracion)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. FUNCIÓN: get_active_incidents()
--    Devuelve todos los incidentes activos y no vencidos.
--    El backend la llama al cargar el grafo para aplicar penalizaciones.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_active_incidents()
RETURNS TABLE (
    id              BIGINT,
    arista_id       INTEGER,
    incident_type   TEXT,
    lat             DOUBLE PRECISION,
    lon             DOUBLE PRECISION,
    expires_at      TIMESTAMPTZ,
    confirmed_count INTEGER
)
LANGUAGE sql STABLE AS $$
    SELECT id, arista_id, incident_type, lat, lon, expires_at, confirmed_count
    FROM incidents
    WHERE active = TRUE
      AND expires_at > NOW();
$$;