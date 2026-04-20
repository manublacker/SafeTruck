#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# infra/provision-database.sh
#
# Script de provisioning one-time para SafeTruck en Azure.
# Usa GitHub Container Registry (ghcr.io) como registry de imágenes
# en lugar de Azure Container Registry (que no está disponible en
# suscripciones Azure for Students).
#
# Ejecutar UNA SOLA VEZ desde tu máquina local.
# Después, el CI/CD (deploy-database.yml) se encarga de los updates.
#
# Pre-requisitos:
#   az login
#   docker (en ejecución)
#   Un GitHub Personal Access Token con scope: write:packages, read:packages
#   → Crearlo en: https://github.com/settings/tokens/new
#
# Uso:
#   chmod +x infra/provision-database.sh
#   ./infra/provision-database.sh
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuración Azure ───────────────────────────────────────────────────────

RESOURCE_GROUP="safetruck-rg"
LOCATION="canadacentral"
FILE_SHARE_NAME="safetruck-pgdata"
# Nombre único derivado del subscription ID (evita conflictos entre corridas)
_SUB_ID=$(az account show --query id -o tsv 2>/dev/null || echo "00000000")
STORAGE_ACCOUNT="st$(echo "$_SUB_ID" | tr -d '-' | cut -c1-10)"
ACA_ENVIRONMENT="safetruck-env"
DB_APP_NAME="safetruck-db"
DB_INIT_JOB_NAME="safetruck-db-init"

POSTGRES_USER="postgres"
POSTGRES_PASSWORD="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 32)"

# ── Colores ───────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${BLUE}▶  $1${NC}"; }
ok()   { echo -e "${GREEN}   ✓ $1${NC}"; }
warn() { echo -e "${YELLOW}   ⚠  $1${NC}"; }

# ── Validaciones previas ──────────────────────────────────────────────────────

log "Verificando pre-requisitos..."
az account show > /dev/null 2>&1 || { echo "Ejecutá 'az login' primero."; exit 1; }
docker info    > /dev/null 2>&1 || { echo "Docker no está corriendo."; exit 1; }
ok "az CLI y Docker listos."

SUBSCRIPTION_ID=$(az account show --query id -o tsv)

# ── Datos de GitHub ───────────────────────────────────────────────────────────

echo ""
echo "Necesitamos tu usuario de GitHub y un Personal Access Token."
echo "Creá el token en: https://github.com/settings/tokens/new"
echo "Scope requerido: write:packages  (marca también read:packages)"
echo ""
read -rp "  Tu usuario de GitHub: " GITHUB_USER
read -rp "  Tu GitHub PAT:        " GITHUB_PAT
echo ""

GHCR_REGISTRY="ghcr.io"
GITHUB_USER_LOWER=$(echo "$GITHUB_USER" | tr '[:upper:]' '[:lower:]')
GHCR_IMAGE_DB="${GHCR_REGISTRY}/${GITHUB_USER_LOWER}/safetruck-db"
GHCR_IMAGE_INIT="${GHCR_REGISTRY}/${GITHUB_USER_LOWER}/safetruck-db-init"

echo ""
echo "  Subscription  : $SUBSCRIPTION_ID"
echo "  Resource Group: $RESOURCE_GROUP ($LOCATION)"
echo "  Registry      : ghcr.io/${GITHUB_USER}/"
echo "  DB image      : ${GHCR_IMAGE_DB}:latest"
echo "  Init image    : ${GHCR_IMAGE_INIT}:latest"
echo ""
read -rp "¿Continuar? (s/n) " -n 1 REPLY; echo
[[ $REPLY =~ ^[Ss]$ ]] || exit 0

# ── 1. Resource Group ─────────────────────────────────────────────────────────

log "[1/8] Creando Resource Group..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none
ok "Resource Group: $RESOURCE_GROUP"

# ── 2. Storage Account + Azure Files ─────────────────────────────────────────

log "[2/8] Creando Storage Account para volumen de PostgreSQL..."
az storage account create \
  --name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --kind StorageV2 \
  --output none

STORAGE_KEY=$(az storage account keys list \
  --resource-group "$RESOURCE_GROUP" \
  --account-name "$STORAGE_ACCOUNT" \
  --query "[0].value" -o tsv)

az storage share create \
  --name "$FILE_SHARE_NAME" \
  --account-name "$STORAGE_ACCOUNT" \
  --account-key "$STORAGE_KEY" \
  --quota 32 \
  --output none
ok "Azure Files share: $FILE_SHARE_NAME (32 GB)"

# ── 3. Container Apps Environment ─────────────────────────────────────────────

log "[3/8] Creando Container Apps Environment..."
az containerapp env create \
  --name "$ACA_ENVIRONMENT" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none
ok "Container Apps Environment: $ACA_ENVIRONMENT"

# Montar el Azure Files share como volumen en el environment
az containerapp env storage set \
  --name "$ACA_ENVIRONMENT" \
  --resource-group "$RESOURCE_GROUP" \
  --storage-name "pgdata" \
  --azure-file-account-name "$STORAGE_ACCOUNT" \
  --azure-file-account-key "$STORAGE_KEY" \
  --azure-file-share-name "$FILE_SHARE_NAME" \
  --access-mode ReadWrite \
  --output none
ok "Azure Files montado en environment como 'pgdata'"

# ── 4. Login a ghcr.io y build de imágenes ───────────────────────────────────

log "[4/8] Autenticando Docker en ghcr.io..."
echo "$GITHUB_PAT" | docker login ghcr.io -u "$GITHUB_USER" --password-stdin
ok "Docker autenticado en ghcr.io"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

log "[5/8] Build y push de safetruck-db..."
docker build \
  -t "${GHCR_IMAGE_DB}:latest" \
  -f "${REPO_ROOT}/database/Dockerfile" \
  "${REPO_ROOT}/database"
docker push "${GHCR_IMAGE_DB}:latest"
ok "Imagen safetruck-db publicada en ghcr.io"

log "[6/8] Build y push de safetruck-db-init..."
docker build \
  -t "${GHCR_IMAGE_INIT}:latest" \
  -f "${REPO_ROOT}/database/Dockerfile.init" \
  "${REPO_ROOT}"
docker push "${GHCR_IMAGE_INIT}:latest"
ok "Imagen safetruck-db-init publicada en ghcr.io"

# ── 5. Container App: safetruck-db (via az rest + JSON para volume mounts) ────

log "[7/8] Creando Container App safetruck-db..."

ENV_ID=$(az containerapp env show \
  --name "$ACA_ENVIRONMENT" \
  --resource-group "$RESOURCE_GROUP" \
  --query id -o tsv)

# Escribir JSON en el directorio actual (ruta relativa, sin conversión de paths).
# Los paths de Linux dentro del JSON no serán convertidos por Git Bash
# porque están dentro del contenido del archivo, no como argumento CLI.
cat > "./safetruck-db-arm.json" << EOF
{
  "location": "${LOCATION}",
  "properties": {
    "managedEnvironmentId": "${ENV_ID}",
    "configuration": {
      "ingress": {
        "external": false,
        "targetPort": 5432,
        "transport": "tcp"
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
          "name": "${DB_APP_NAME}",
          "image": "${GHCR_IMAGE_DB}:latest",
          "resources": { "cpu": 0.5, "memory": "1Gi" },
          "env": [
            { "name": "POSTGRES_DB",       "value": "safetruck" },
            { "name": "POSTGRES_USER",     "value": "${POSTGRES_USER}" },
            { "name": "POSTGRES_PASSWORD", "secretRef": "pgpassword" }
          ],
          "volumeMounts": [
            { "volumeName": "pgdata", "mountPath": "/var/lib/postgresql/data" }
          ]
        }
      ],
      "volumes": [
        { "name": "pgdata", "storageType": "AzureFile", "storageName": "pgdata" }
      ],
      "scale": { "minReplicas": 1, "maxReplicas": 1 }
    }
  }
}
EOF

az rest \
  --method PUT \
  --url "https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.App/containerApps/${DB_APP_NAME}?api-version=2023-05-01" \
  --body @./safetruck-db-arm.json \
  --output none

rm -f ./safetruck-db-arm.json
ok "Container App safetruck-db creado"

# ── 6. Container Apps Job: safetruck-db-init ──────────────────────────────────

log "[8/8] Creando Container Apps Job safetruck-db-init..."

# El job no necesita volumen (solo conecta a la BD y corre scripts)
az containerapp job create \
  --name "$DB_INIT_JOB_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$ACA_ENVIRONMENT" \
  --image "${GHCR_IMAGE_INIT}:latest" \
  --registry-server "$GHCR_REGISTRY" \
  --registry-username "$GITHUB_USER_LOWER" \
  --registry-password "$GITHUB_PAT" \
  --trigger-type Manual \
  --replica-timeout 1800 \
  --replica-retry-limit 0 \
  --parallelism 1 \
  --replica-completion-count 1 \
  --cpu 1 \
  --memory 2Gi \
  --env-vars \
    "PGHOST=${DB_APP_NAME}" \
    "PGPORT=5432" \
    "PGDATABASE=safetruck" \
    "PGUSER=${POSTGRES_USER}" \
    "PGPASSWORD=secretref:pgpassword" \
  --secrets "pgpassword=${POSTGRES_PASSWORD}" \
  --output none
ok "Container Apps Job safetruck-db-init creado"

# Ejecutar el job de init por primera vez
log "Ejecutando init job por primera vez..."
az containerapp job start \
  --name "$DB_INIT_JOB_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --output none

# ── Resumen final ─────────────────────────────────────────────────────────────

echo ""
echo "══════════════════════════════════════════════════════════════"
echo "  ✅ Infraestructura creada exitosamente"
echo "══════════════════════════════════════════════════════════════"
echo ""
echo "  DB Container App : ${DB_APP_NAME}"
echo "  Init Job         : ${DB_INIT_JOB_NAME}"
echo "  Registry         : ghcr.io/${GITHUB_USER}/"
echo ""
echo "  POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}"
echo "  ⚠️  Guardá esta contraseña — no se puede recuperar después."
echo ""
echo "  ── Secrets para GitHub Actions ──────────────────────────────"
echo ""
echo "  Primero creá el service principal de Azure:"
echo ""
echo "  az ad sp create-for-rbac \\"
echo "    --name safetruck-github-actions \\"
echo "    --role Contributor \\"
echo "    --scopes /subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP} \\"
echo "    --sdk-auth"
echo ""
echo "  Luego cargá en GitHub → Settings → Secrets and variables → Actions:"
echo ""
echo "  ┌─ Secrets ──────────────────────────────────────────────────"
echo "  │  AZURE_CREDENTIALS    ← JSON del comando anterior"
echo "  │  PGPASSWORD           ← ${POSTGRES_PASSWORD}"
echo "  │  GHCR_PAT             ← tu GitHub PAT (write:packages)"
echo "  └────────────────────────────────────────────────────────────"
echo ""
echo "  ┌─ Variables ─────────────────────────────────────────────────"
echo "  │  AZURE_RESOURCE_GROUP ← ${RESOURCE_GROUP}"
echo "  │  ACA_ENVIRONMENT      ← ${ACA_ENVIRONMENT}"
echo "  │  DB_APP_NAME          ← ${DB_APP_NAME}"
echo "  │  DB_INIT_JOB_NAME     ← ${DB_INIT_JOB_NAME}"
echo "  └────────────────────────────────────────────────────────────"
echo ""
echo "  Seguí el init job con:"
echo "  az containerapp job execution list --name ${DB_INIT_JOB_NAME} --resource-group ${RESOURCE_GROUP} --output table"
echo ""
echo "══════════════════════════════════════════════════════════════"
