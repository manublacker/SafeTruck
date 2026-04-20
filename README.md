# SafeTruck

Sistema de ruteo para camiones pesados en Buenos Aires. Calcula la ruta óptima entre dos puntos respetando restricciones físicas del vehículo (peso, altura, ancho, largo) y restricciones viales (peajes, corredores de tránsito pesado).

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React + Vite + Leaflet)                          │
│  frontend-react/                                            │
│  Deploy: pendiente                                          │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Backend API (Node.js / Express + TypeScript)               │
│  backend/                                                   │
│  URL: https://safetruck-backend.icysky-af60cdde             │
│        .canadacentral.azurecontainerapps.io                 │
│  Endpoints: GET /health · POST /api/routes                  │
│             GET /api/search · GET /api/docs                 │
└────────────────────────┬────────────────────────────────────┘
                         │ TCP 5432 (interno)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Base de datos (PostgreSQL 15 + PostGIS + pgRouting)        │
│  database/                                                  │
│  Host interno: safetruck-db                                 │
│  Volumen persistente: Azure Files 32 GB                     │
└─────────────────────────────────────────────────────────────┘
```

Todo el backend corre en **Azure Container Apps** (región `canadacentral`).  
El CI/CD se gestiona con **GitHub Actions** + **GitHub Container Registry** (ghcr.io).

---

## Estructura del repositorio

```
SafeTruck/
├── backend/              Node.js/Express API + algoritmo A*
├── database/             PostgreSQL: Dockerfiles, SQLs, seed de GeoJSON
├── frontend-react/       Frontend React + Vite + Leaflet
├── frontend/             Frontend vanilla JS (legacy)
├── infra/                Scripts de provisioning Azure + documentación
│   ├── provision-database.sh
│   ├── provision-backend.sh
│   └── README.md         ← arquitectura, CI/CD, operaciones
├── .github/workflows/
│   ├── deploy-backend.yml
│   └── deploy-database.yml
└── docs/
    └── api-contract.md
```

---

## Entorno desplegado

| Componente | Recurso Azure | URL / Host |
|------------|---------------|------------|
| API Backend | Container App `safetruck-backend` | `https://safetruck-backend.icysky-af60cdde.canadacentral.azurecontainerapps.io` |
| Base de datos | Container App `safetruck-db` | `safetruck-db` (interno, TCP 5432) |
| Init job | Container Apps Job `safetruck-db-init` | Manual / CI-CD |
| Environment | `safetruck-env` | `canadacentral` |
| Storage | `sta375aa1c10` / share `safetruck-pgdata` | Azure Files 32 GB |
| Registry | GitHub Container Registry | `ghcr.io/sergioslo` |

Para instrucciones detalladas de operación e infraestructura, ver [`infra/README.md`](infra/README.md).

---

## Desarrollo local

### Pre-requisitos

- Docker + Docker Compose
- Node.js 22
- PostgreSQL con PostGIS (o usar el compose)

### Levantar todo localmente

```bash
docker compose -f docker-compose.dev.yml up
```

Esto levanta PostgreSQL con PostGIS en el puerto 5432 y corre el seed inicial.

### Backend

```bash
cd backend
npm install
npm run dev        # servidor en http://localhost:3000
```

### Frontend React

```bash
cd frontend-react
npm install
npm run dev        # http://localhost:5173
```

El proxy de Vite redirige `/api` → `http://localhost:3000` automáticamente en desarrollo.

---

## API

Documentación interactiva (Swagger UI):  
`https://safetruck-backend.icysky-af60cdde.canadacentral.azurecontainerapps.io/api/docs`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/routes` | Calcular ruta para camión |
| `GET` | `/api/search?q=<nombre>` | Buscar calles por nombre |

Contrato completo de la API: [`docs/api-contract.md`](docs/api-contract.md).

---

## Base de datos

Ver [`database/README.md`](database/README.md) para el esquema, la topología y el proceso de importación de datos.
