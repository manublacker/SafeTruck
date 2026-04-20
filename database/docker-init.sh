#!/bin/sh
# ──────────────────────────────────────────────────────────────
# docker-init.sh
#
# Script de inicialización del contenedor db-init.
# Ejecuta los pasos 2–8 del setup de la base de datos SafeTruck.
# El paso 1 (01_schema.sql) ya lo ejecutó el contenedor db al arrancar.
#
# Orden:
#   1. 01_schema.sql                    ← ejecutado por el contenedor db
#   2. docker-seed.ts                   ← importa GeoJSON
#   3. 02_topology.sql                  ← genera topología pgRouting
#   4. 03_restrictions.sql              ← restricciones de camiones
#   5. 04_backend_views.sql             ← vistas y funciones del backend
#   6. 05_search.sql                    ← índices de búsqueda
#   7. 06_importar_red_camiones_kml.sql ← red de camiones KML
#   8. 07_users.sql                     ← tabla de usuarios
# ──────────────────────────────────────────────────────────────

set -e

PGHOST="${PGHOST:-db}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-safetruck}"
PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"

PSQL="psql -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDATABASE"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  SafeTruck — Inicialización de la BD     ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Esperar a que el schema esté listo ───────────────────────
echo "▶  [1/8] Esperando a que el schema esté listo..."
until $PSQL -tAc "SELECT 1 FROM information_schema.tables WHERE table_name='red_vial'" 2>/dev/null | grep -q 1; do
  echo "   ... schema no listo aún, reintentando en 3s..."
  sleep 3
done
echo "   ✓ Schema listo."

# ── Verificar si la inicialización ya está completa ───────────
VIAL_COUNT=$($PSQL -tAc "SELECT COUNT(*) FROM red_vial" 2>/dev/null | tr -d ' ' || echo "0")
NODOS_COUNT=$($PSQL -tAc "SELECT COUNT(*) FROM nodos" 2>/dev/null | tr -d ' ' || echo "0")

if [ "${VIAL_COUNT:-0}" -gt "0" ] && [ "${NODOS_COUNT:-0}" -gt "0" ] 2>/dev/null; then
  echo ""
  echo "  ✅ BD ya inicializada ($VIAL_COUNT calles, $NODOS_COUNT nodos)."
  echo "     Saltando importación de datos. Aplicando scripts idempotentes..."

  SEARCH_COL=$($PSQL -tAc "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='red_vial' AND column_name='nombre_buscable'" 2>/dev/null | tr -d ' ' || echo "0")
  if [ "${SEARCH_COL:-0}" -eq "0" ] 2>/dev/null; then
    echo "▶  Creando columna de búsqueda..."
    $PSQL -f /sql/05_search.sql
    echo "   ✓ Búsqueda habilitada."
  fi

  echo "▶  Aplicando red de camiones KML..."
  $PSQL -f /sql/06_importar_red_camiones_kml.sql
  echo "   ✓ Red de camiones KML aplicada."

  echo "▶  Aplicando tabla de usuarios..."
  $PSQL -f /sql/07_users.sql
  echo "   ✓ Tabla de usuarios aplicada."

  echo ""
  echo "══════════════════════════════════════════════"
  echo "  ✅ Base de datos lista para usar."
  echo "══════════════════════════════════════════════"
  exit 0
fi

# Si red_vial tiene datos pero nodos no → topología incompleta → limpiar.
if [ "${VIAL_COUNT:-0}" -gt "0" ] && [ "${NODOS_COUNT:-0}" -eq "0" ] 2>/dev/null; then
  echo ""
  echo "⚠️  red_vial tiene datos pero la topología está vacía."
  echo "   Limpiando tablas para reinicializar..."
  $PSQL -c "TRUNCATE red_vial, aristas, nodos RESTART IDENTITY CASCADE;" 2>/dev/null || true
  echo "   ✓ Tablas limpiadas."
fi

# ── Paso 2: Importar datos GeoJSON ───────────────────────────
echo ""
echo "▶  [2/8] Importando datos GeoJSON..."
DATA_DIR=/data npx ts-node --project /app/tsconfig.json /app/docker-seed.ts
echo "   ✓ Datos importados."

# ── Paso 3: Topología ─────────────────────────────────────────
echo ""
echo "▶  [3/8] Generando topología (pgRouting)..."
$PSQL -f /sql/02_topology.sql
echo "   ✓ Topología creada."

# ── Paso 4: Restricciones ─────────────────────────────────────
echo ""
echo "▶  [4/8] Aplicando restricciones para camiones..."
$PSQL -f /sql/03_restrictions.sql
echo "   ✓ Restricciones aplicadas."

# ── Paso 5: Vistas y funciones ────────────────────────────────
echo ""
echo "▶  [5/8] Creando vistas y funciones del backend..."
$PSQL -f /sql/04_backend_views.sql
echo "   ✓ Vistas y funciones creadas."

# ── Paso 6: Búsqueda de calles ────────────────────────────────
echo ""
echo "▶  [6/8] Habilitando búsqueda de calles..."
$PSQL -f /sql/05_search.sql
echo "   ✓ Búsqueda habilitada."

# ── Paso 7: Red de camiones KML ───────────────────────────────
echo ""
echo "▶  [7/8] Importando red de camiones KML..."
$PSQL -f /sql/06_importar_red_camiones_kml.sql
echo "   ✓ Red de camiones KML importada."

# ── Paso 8: Tabla de usuarios ─────────────────────────────────
echo ""
echo "▶  [8/8] Creando tabla de usuarios..."
$PSQL -f /sql/07_users.sql
echo "   ✓ Tabla de usuarios creada."

echo ""
echo "══════════════════════════════════════════════"
echo "  ✅ Base de datos lista para usar."
echo "══════════════════════════════════════════════"
