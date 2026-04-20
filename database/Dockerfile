# ──────────────────────────────────────────────────────────────
# Dockerfile — safetruck-db
#
# Base: postgis/postgis  →  PostgreSQL 15 + PostGIS + pgRouting
#
# Solo crea el esquema (01_schema.sql) en el primer arranque.
# La carga de datos GeoJSON y los pasos 02–04 los ejecuta el
# servicio db-init (ver Dockerfile.init y docker-compose.yml).
# ──────────────────────────────────────────────────────────────

FROM postgis/postgis:15-3.4

# pgRouting no viene incluido en la imagen postgis/postgis.
# Lo instalamos vía apt para tener PostgreSQL 15 + PostGIS + pgRouting.
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-15-pgrouting \
    && rm -rf /var/lib/apt/lists/*

# Copia el script de esquema al directorio de inicialización de
# PostgreSQL. Los archivos aquí se ejecutan en orden alfabético
# la primera vez que el volumen de datos está vacío.
COPY sql/01_schema.sql /docker-entrypoint-initdb.d/01_schema.sql

# Puerto estándar de PostgreSQL
EXPOSE 5432
