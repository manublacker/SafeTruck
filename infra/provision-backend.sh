#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# infra/provision-backend.sh
#
# Provisioning one-time del backend de SafeTruck en Azure Container Apps.
# Despliega el backend Node.js en el mismo environment que la BD,
# con ingress HTTP externo (accesible desde internet).
#
# Pre-requisitos:
#   - Haber corrido infra/provision.sh (la BD y el environment ya existen)
#   - az login
#   - docker en ejecución
#   - GitHub PAT con write:packages
#
# Uso:
#   chmod +x infra/provision-backend.sh
#   ./infra/provision-backend.sh
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuración (debe coincidir con provision.sh) ───────────────────────────

RESOURCE_GROUP="safetruck-rg"
LOCATION="canadacentral"
ACA_ENVIRONMENT="safetruck-env"
DB_APP_NAME="safetruck-db"
BACKEND_APP_NAME="safetruck-backend"

POSTGRES_USER="postgres"

# ── Colores ───────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
log() { echo -e "${BLUE}▶  $1${NC}"; }
ok()  { echo -e "${GREEN}   ✓ $1${NC}"; }

# ── Validaciones ──────────────────────────────────────────────────────────────

log "Verificando pre-requisitos..."
az account show > /dev/null 2>&1 || { echo "Ejecutá 'az login' primero."; exit 1; }
docker info    > /dev/null 2>&1 || { echo "Docker no está corriendo."; exit 1; }
ok "az CLI y Docker listos."

SUBSCRIPTION_ID=$(az account show --query id -o tsv)

echo ""
read -rp  "  Tu usuario de GitHub: " GITHUB_USER
read -rsp "  Tu GitHub PAT:        " GITHUB_PAT; echo
read -rsp "  PGPASSWORD (la que generó provision.sh): " POSTGRES_PASSWORD; echo

GITHUB_USER_LOWER=$(echo "$GITHUB_USER" | tr '[:upper:]' '[:lower:]')
GHCR_IMAGE="ghcr.io/${GITHUB_USER_LOWER}/safetruck-backend"

echo ""
echo "  Backend image : ${GHCR_IMAGE}:latest"
echo "  Container App : ${BACKEND_APP_NAME}"
echo "  Environment   : ${ACA_ENVIRONMENT}"
echo ""
read -rp "¿Continuar? (s/n) " -n 1 REPLY; echo
[[ $REPLY =~ ^[Ss]$ ]] || exit 0

# ── 1. Build y push de la imagen ──────────────────────────────────────────────

log "[1/3] Autenticando Docker en ghcr.io..."
echo "$GITHUB_PAT" | docker login ghcr.io -u "$GITHUB_USER_LOWER" --password-stdin
ok "Docker autenticado"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

log "[2/3] Build y push de safetruck-backend..."
docker build \
  -t "${GHCR_IMAGE}:latest" \
  -f "${REPO_ROOT}/backend/Dockerfile" \
  "${REPO_ROOT}/backend"
docker push "${GHCR_IMAGE}:latest"
ok "Imagen publicada en ghcr.io"

# ── 2. Crear Container App del backend ───────────────────────────────────────

log "[3/3] Creando Container App ${BACKEND_APP_NAME}..."

cat > "./safetruck-backend-arm.json" << EOF
{
  "location": "${LOCATION}",
  "properties": {
    "managedEnvironmentId": "$(az containerapp env show --name "$ACA_ENVIRONMENT" --resource-group "$RESOURCE_GROUP" --query id -o tsv)",
    "configuration": {
      "ingress": {
        "external": true,
        "targetPort": 3000,
        "transport": "http",
        "allowInsecure": false
      },
      "registries": [
        {
          "server": "ghcr.io",
          "username": "${GITHUB_USER_LOWER}",
          "passwordSecretRef": "ghcr-password"
        }
      ],
      "secrets": [
        { "name": "pgpassword",    "value": "${POSTGRES_PASSWORD}" },
        { "name": "ghcr-password", "value": "${GITHUB_PAT}" }
      ]
    },
    "template": {
      "containers": [
        {
          "name": "${BACKEND_APP_NAME}",
          "image": "${GHCR_IMAGE}:latest",
          "resources": { "cpu": 0.5, "memory": "1Gi" },
          "env": [
            { "name": "PGHOST",     "value": "${DB_APP_NAME}" },
            { "name": "PGPORT",     "value": "5432" },
            { "name": "PGDATABASE", "value": "safetruck" },
            { "name": "PGUSER",     "value": "${POSTGRES_USER}" },
            { "name": "PGPASSWORD", "secretRef": "pgpassword" },
            { "name": "PORT",       "value": "3000" }
          ]
        }
      ],
      "scale": { "minReplicas": 0, "maxReplicas": 2 }
    }
  }
}
EOF

az rest \
  --method PUT \
  --url "https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.App/containerApps/${BACKEND_APP_NAME}?api-version=2023-05-01" \
  --body @./safetruck-backend-arm.json \
  --output none

rm -f ./safetruck-backend-arm.json
ok "Container App ${BACKEND_APP_NAME} creado"

# ── Resumen ───────────────────────────────────────────────────────────────────

FQDN=$(az containerapp show \
  --name "$BACKEND_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.configuration.ingress.fqdn" -o tsv 2>/dev/null || echo "(obteniendo URL...)")

echo ""
echo "══════════════════════════════════════════════════════════════"
echo "  ✅ Backend deployado exitosamente"
echo "══════════════════════════════════════════════════════════════"
echo ""
echo "  URL pública : https://${FQDN}"
echo "  Health check: https://${FQDN}/health"
echo "  Swagger docs: https://${FQDN}/api/docs"
echo ""
echo "  La BD se conecta internamente via PGHOST=${DB_APP_NAME}"
echo ""
echo "  ── Secret adicional para GitHub Actions ─────────────────────"
echo "  BACKEND_APP_NAME  ← ${BACKEND_APP_NAME}"
echo "══════════════════════════════════════════════════════════════"
