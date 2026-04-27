# AGENTS.md — SafeTruck

Guía para agentes de IA (Claude Code, Codex, Cursor, etc.) que trabajen en este repo. Está pensada para que un agente pueda orientarse, levantar la app y contribuir sin romper el flujo del equipo.

---

## Qué es SafeTruck

Sistema de ruteo para camiones pesados en Buenos Aires. Calcula la ruta óptima entre dos puntos respetando restricciones del vehículo (peso, altura, ancho, largo) y restricciones viales (peajes, corredores de tránsito pesado). Es un TP universitario de Ingeniería de Software.

Producción: backend en Azure Container Apps, frontend web en Vercel.

---

## Componentes y dónde vive cada uno

| Pieza | Path | Stack | Estado |
|---|---|---|---|
| **Backend API** | `backend/` | Node 22 · TS · Express 5 · JWT · Anthropic SDK | Activo. Deploy CI/CD a Azure. |
| **Base de datos** | `database/` | PostgreSQL 15 + PostGIS + pgRouting | Activa. Seed por GeoJSON. |
| **Frontend web** | `safesruck-frontend-dep/` | React 18 · Vite · TS · Leaflet | Activo. **Es un git submodule** apuntando a `https://github.com/SergioSLO/safesruck-frontend-dep.git`. |
| **Mobile** | `mobile/` | Expo SDK 54 · React Native · expo-router | En desarrollo activo (rama `redesign/mobile-visual-overhaul`). |
| **Frontend legacy** | `frontend/` | Vanilla JS | **Deprecated, no tocar.** Sin auth integrada. |
| **Infra** | `infra/` | Scripts de provisioning Azure + GitHub Actions | Estable. |

Endpoint productivo del backend:
`https://safetruck-backend.icysky-af60cdde.canadacentral.azurecontainerapps.io`

---

## Cómo se hablan las piezas

```
[ Web (Vercel) ]        [ Mobile (Expo) ]
        \                       /
         \                     /
          ▼                   ▼
   HTTP /api/...   HTTP /api/...
                  │
                  ▼
       [ Backend Express :3000 ]
                  │
                  ▼ TCP 5432
       [ PostgreSQL + PostGIS ]
```

Web y mobile son clientes **independientes** del backend. No comparten proceso ni código fuente.

---

## Setup rápido

### Backend
```bash
cd backend
npm install
# Necesita backend/.env con JWT_SECRET (en local cualquier string sirve)
npm run dev          # http://localhost:3000
```
- Swagger UI: `http://localhost:3000/api/docs`
- Spec: `http://localhost:3000/api/docs.json`

### Base de datos local
```bash
docker compose -f docker-compose.dev.yml up
```
Levanta Postgres+PostGIS en `localhost:5432`. Usuario/pass: `postgres` / `postgres`. DB: `safetruck`.

### Frontend web
El frontend vive como submódulo. Para clonar el repo con el submódulo:
```bash
git clone --recurse-submodules <repo>
# o si ya cloneaste:
git submodule update --init --recursive
```
Luego:
```bash
cd safesruck-frontend-dep/frontend-react
npm install
npm run dev          # http://localhost:5173
```
El `.env.development` ya apunta al backend de Azure. Para apuntar a backend local, crear `.env.local` con `VITE_API_URL=http://localhost:3000` (o dejar vacío y usar el proxy de Vite).

### Mobile
```bash
cd mobile
npm install
npx expo start
```

---

## Endpoints clave del backend

| Método | Ruta | Auth | Qué hace |
|---|---|---|---|
| `GET` | `/health` | — | Health check |
| `POST` | `/api/auth/register` | público | Registro (bcrypt + JWT 24h) |
| `POST` | `/api/auth/login` | público | Login |
| `POST` | `/api/routes` | JWT | Calcula ruta con A* |
| `GET` | `/api/search?q=<nombre>` | JWT | Autocomplete de calles (trigram, desde 3 caracteres) |
| `POST` | `/api/municipio/parse-text` | JWT | Parser con Anthropic SDK |
| `POST` | `/api/municipio/parse-pdf` | JWT | Parser con Anthropic SDK |

Contrato de `/api/routes` (no romper sin coordinar):
- **Request**: `originLabel`, `destinationLabel`, `origin {lat,lon}`, `destination {lat,lon}`, `vehicle {maxWeightKg, maxHeightM, maxWidthM, maxLengthM}`, `routingOptions {avoidTolls, preferHighways}`
- **Response**: `found`, `routeId`, `originLabel`, `destinationLabel`, `distanceM`, `estimatedDurationMin`, `routeSummary`, `path`, `warnings`

---

## Archivos clave del backend

- `backend/src/index.ts` — Express, monta rutas y aplica middleware JWT.
- `backend/src/routes/auth.ts` — register/login con bcrypt + JWT.
- `backend/src/middleware/authMiddleware.ts` — verifica `Authorization: Bearer <token>`.
- `backend/src/routes/route.ts` — POST /api/routes.
- `backend/src/routes/search.ts` — GET /api/search (trigram sobre `nombre_buscable`).
- `backend/src/algorithm/astar.ts` — A* con heap binario, restricciones físicas, haversine.
- `backend/src/municipio-parser.ts` — POST /api/municipio/parse-* (usa Claude API).
- `backend/src/swagger.ts` — spec OpenAPI 3.0 completo.

---

## Tablas y funciones SQL importantes

**Tablas**
- `red_vial` — red vial completa (`nombre_buscable` normalizada).
- `aristas` — grafo de routing, `camion_permitido BOOLEAN` (3893 aristas habilitadas).
- `nodos` — intersecciones del grafo.
- `red_camiones` — tramos habilitados para camiones.
- `users` — `id, email UNIQUE, password_hash, full_name, company`.
- `trucks` — `id, user_id (FK CASCADE), name, max_weight_kg, max_height_m, max_width_m, max_length_m`.

**Funciones / vistas**
- `nearest_graph_node(lon, lat)` — nodo más cercano a un punto.
- `export_graph_json(TRUE)` — exporta solo aristas con `camion_permitido=TRUE`.
- `unaccent_immutable(text)` — wrapper IMMUTABLE de unaccent.
- `normalizar_nombre(text)` — normaliza nombres de calles para búsqueda.

Scripts SQL (en orden): `01_schema.sql`, `02_topology.sql`, `03_restrictions.sql`, `04_backend_views.sql`, `05_search.sql`, `06_importar_red_camiones_kml.sql`, `07_users.sql`.

---

## Convenciones para agentes

1. **No modificar archivos del proyecto sin pedido explícito.** Es un trabajo grupal — cambios no coordinados rompen el flujo. Si ves algo mejorable (scripts, configs), proponelo en la conversación, no lo apliques.
2. **No romper el contrato de `/api/routes`.** Si necesitás cambiarlo, avisar y coordinar con frontend y mobile.
3. **No tocar `frontend/` (legacy).** Está deprecated.
4. **No tocar el submódulo `safesruck-frontend-dep/` sin antentar el repo upstream.** Cualquier cambio ahí requiere PR en `https://github.com/SergioSLO/safesruck-frontend-dep`.
5. **Mensajes de commit en inglés**, prefijos estilo `add:`, `fix:`, `feat:` (mirar `git log` para el estilo).
6. **Soluciones simples y defendibles.** Es un TP universitario — no over-engineer.
7. **No commitear secretos.** `JWT_SECRET`, llaves Anthropic, credenciales de Azure jamás van al repo.

---

## CI/CD

- Workflows en `.github/workflows/deploy-backend.yml` y `deploy-database.yml`.
- Push a `main` que toque `backend/` o `database/` redeploya a Azure (Container Apps + GHCR).
- El frontend web deploya solo en Vercel desde el repo de Sergio (no desde acá).

---

## Trampas conocidas

- `setup.md` y `docker-compose.yml` mencionan `safetruck-next/` que **no existe** — son restos del plan anterior antes de migrar a React/Vercel.
- El `Dockerfile` del backend NO copia `frontend/`, lo cual es correcto: el frontend vive en Vercel.
- `routingOptions` (`avoidTolls`, `preferHighways`) están definidos en A* pero **no integrados del todo**.
- Cuando se busca una calle sin número, el backend usa el centroide de la calle (comportamiento esperado, no es bug).
- El submódulo del frontend puede aparecer "vacío" si no se inicializó — siempre hacer `git submodule update --init` después de clonar.

---

## Documentación complementaria

- `README.md` — overview general del repo.
- `setup.md` — guía de Docker (algo desactualizada respecto a `safetruck-next/`).
- `infra/README.md` — arquitectura Azure y operaciones.
- `database/README.md` — esquema y proceso de importación.
- `docs/api-contract.md` — contrato detallado de la API.
