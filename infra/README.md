# SafeTruck — Infraestructura Azure

## Arquitectura desplegada

```
Azure Container Apps Environment: safetruck-env  (canadacentral)
│
├─ Container App: safetruck-db                    ← PostgreSQL 15 + PostGIS + pgRouting
│    Image:   ghcr.io/sergioslo/safetruck-db:latest
│    Ingress: interno TCP, exposedPort 5432
│    Storage: efímero (sin volumen persistente — ver nota abajo)
│    FQDN interno: safetruck-db.internal.icysky-af60cdde.canadacentral.azurecontainerapps.io
│
├─ Container Apps Job: safetruck-db-init          ← one-shot: importa GeoJSONs + corre SQLs
│    Image:   ghcr.io/sergioslo/safetruck-db-init:latest
│    Trigger: Manual / CI-CD
│    PGHOST:  safetruck-db
│
└─ Container App: safetruck-backend               ← API Node.js / Express + A*
     Image:   ghcr.io/sergioslo/safetruck-backend:latest
     Ingress: externo HTTPS, puerto 3000
     URL:     https://safetruck-backend.icysky-af60cdde.canadacentral.azurecontainerapps.io
     PGHOST:  safetruck-db (nombre corto interno)

Recursos de soporte:
  Registry:       GitHub Container Registry (ghcr.io/sergioslo)
  Resource Group: safetruck-rg  (canadacentral)

⚠️  Nota sobre persistencia de datos:
  Azure Files (SMB) no soporta chmod, que PostgreSQL requiere para initdb.
  Los datos de la DB viven en el storage efímero del container. Si el container
  es reemplazado por una nueva revisión (deploy o reinicio), hay que volver a
  correr el init job manualmente:
    az containerapp job start --name safetruck-db-init --resource-group safetruck-rg
```

> **Nota:** Se usa GitHub Container Registry en lugar de Azure Container Registry porque
> las suscripciones Azure for Students no tienen acceso a ACR.

---

## Scripts de provisioning

| Script | Descripción |
|--------|-------------|
| `provision-database.sh` | Crea toda la infra de BD: Storage, Environment, safetruck-db, safetruck-db-init |
| `provision-backend.sh`  | Crea el Container App del backend Node.js |

Ambos scripts son **one-time**: se ejecutan una sola vez para crear los recursos.
Las actualizaciones posteriores las maneja el CI/CD de GitHub Actions.

### Pre-requisitos

```bash
az login
az account set --subscription a375aa1c-10ab-491a-b5df-be6feb501c00

# Docker corriendo
docker info

# GitHub PAT con scopes: write:packages, read:packages
# https://github.com/settings/tokens/new
```

### 1. Provisionar la base de datos

```bash
chmod +x infra/provision-database.sh
./infra/provision-database.sh
```

### 2. Provisionar el backend

```bash
chmod +x infra/provision-backend.sh
./infra/provision-backend.sh
```

---

## CI/CD — GitHub Actions

### Secrets requeridos (Settings → Secrets and variables → Actions)

| Secret | Descripción |
|--------|-------------|
| `AZURE_CREDENTIALS` | JSON del service principal (ver comando abajo) |
| `GHCR_PAT` | GitHub Personal Access Token con `read:packages` (para que Azure pueda pullear imágenes de ghcr.io) |
| `PGPASSWORD` | Contraseña de PostgreSQL |

Para crear el service principal:
```bash
az ad sp create-for-rbac \
  --name safetruck-github-actions \
  --role Contributor \
  --scopes /subscriptions/a375aa1c-10ab-491a-b5df-be6feb501c00/resourceGroups/safetruck-rg \
  --sdk-auth
```
Copiar el JSON completo como valor del secret `AZURE_CREDENTIALS`.

### Variables requeridas

| Variable | Valor actual |
|----------|-------------|
| `AZURE_RESOURCE_GROUP` | `safetruck-rg` |
| `ACA_ENVIRONMENT` | `safetruck-env` |
| `DB_APP_NAME` | `safetruck-db` |
| `DB_INIT_JOB_NAME` | `safetruck-db-init` |
| `BACKEND_APP_NAME` | `safetruck-backend` |

### Workflows

| Workflow | Archivo | Trigger |
|----------|---------|---------|
| Deploy Database | `.github/workflows/deploy-database.yml` | Push a `main` con cambios en `database/**` |
| Deploy Backend  | `.github/workflows/deploy-backend.yml`  | Push a `main` con cambios en `backend/**` |

#### Qué dispara cada workflow

**deploy-database.yml:**

| Archivos modificados | Acción |
|----------------------|--------|
| `database/Dockerfile` · `sql/01_schema.sql` | Rebuild `safetruck-db` → redeploy Container App |
| `database/Dockerfile.init` · `docker-seed.ts` · `docker-init.sh` · `sql/02-06` | Rebuild `safetruck-db-init` → re-run Job |
| Ambos grupos | Ambas acciones en orden |

**deploy-backend.yml:**

| Archivos modificados | Acción |
|----------------------|--------|
| `backend/**` | Build imagen → push a ghcr.io → `az containerapp update` |

El job de init es **idempotente**: si la BD ya tiene datos, detecta las filas existentes y sale sin hacer nada.

---

## URLs y endpoints

| Recurso | URL |
|---------|-----|
| API backend (prod) | `https://safetruck-backend.icysky-af60cdde.canadacentral.azurecontainerapps.io` |
| Health check | `GET /health` |
| Calcular ruta | `POST /api/routes` |
| Buscar calle | `GET /api/search?q=<nombre>` |
| Swagger UI | `GET /api/docs` |

---

## Operaciones frecuentes

### Ver logs del backend
```bash
az containerapp logs show \
  --name safetruck-backend \
  --resource-group safetruck-rg \
  --type console --tail 50
```

### Ver logs del init job
```bash
az containerapp job execution list \
  --name safetruck-db-init \
  --resource-group safetruck-rg \
  --output table

az containerapp logs show \
  --name safetruck-db-init \
  --resource-group safetruck-rg \
  --type console --tail 100
```

### Lanzar el init job manualmente
```bash
az containerapp job start \
  --name safetruck-db-init \
  --resource-group safetruck-rg
```

### Forzar redeploy del backend
```bash
az containerapp update \
  --name safetruck-backend \
  --resource-group safetruck-rg \
  --set-env-vars PGHOST=safetruck-db PGPORT=5432 PGDATABASE=safetruck PGUSER=postgres
```

### Forzar re-inicialización completa de la BD
```bash
# ⚠️ DESTRUCTIVO: borra todos los datos
az containerapp exec \
  --name safetruck-db \
  --resource-group safetruck-rg \
  --command "psql -U postgres -d safetruck -c 'TRUNCATE red_vial, aristas, nodos RESTART IDENTITY CASCADE;'"

az containerapp job start --name safetruck-db-init --resource-group safetruck-rg
```

### Escalar recursos
```bash
# Backend
az containerapp update \
  --name safetruck-backend \
  --resource-group safetruck-rg \
  --cpu 1 --memory 2Gi

# Base de datos
az containerapp update \
  --name safetruck-db \
  --resource-group safetruck-rg \
  --cpu 1 --memory 2Gi
```

---

## Estimación de costos (canadacentral, Azure for Students)

| Recurso | Costo estimado / mes |
|---------|----------------------|
| Container App safetruck-db (0.5 CPU / 1 GB) | ~$15 |
| Container App safetruck-backend (0.5 CPU / 1 GB) | ~$15 |
| Container Apps Job safetruck-db-init (solo cuando corre) | < $1 |
| **Total estimado** | **~$30/mes** |
