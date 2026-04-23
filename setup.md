# SafeTruck — Guía de setup con Docker

## Requisitos previos

| Herramienta | Versión mínima |
|-------------|---------------|
| Docker      | 24+           |
| Docker Compose | v2 (`docker compose`) |

---

## Estructura relevante

```
SafeTruck/
├── docker-compose.yml        ← orquesta los 3 servicios
├── database/
│   ├── Dockerfile            ← imagen PostgreSQL + PostGIS
│   ├── Dockerfile.init       ← contenedor de inicialización (corre una sola vez)
│   ├── docker-init.sh        ← script que ejecuta los pasos 2–5 del setup
│   ├── docker-seed.ts        ← importa los GeoJSON a la BD
│   ├── sql/
│   │   ├── 01_schema.sql     ← tablas e índices (corre automático al crear el contenedor db)
│   │   ├── 02_topology.sql   ← topología pgRouting
│   │   ├── 03_restrictions.sql
│   │   └── 04_backend_views.sql
│   └── data/                 ← archivos GeoJSON
└── safetruck-next/
    ├── Dockerfile            ← imagen Next.js (multi-stage, standalone)
    └── ...
```

---

## Primer arranque

```bash
# Desde la raíz de SafeTruck/
docker compose up --build
```

Este comando:
1. **Construye** las imágenes `safetruck-db`, `safetruck-db-init` y `safetruck-app`.
2. **Arranca `db`** (PostgreSQL + PostGIS). Espera hasta que el healthcheck responda OK.
3. **Arranca `db-init`**, que carga los datos GeoJSON y ejecuta los scripts SQL 02–04. Luego sale con código 0.
4. **Arranca `app`** (Next.js) una vez que `db-init` terminó con éxito.

La primera vez puede tardar **5–10 minutos** dependiendo del tamaño de los GeoJSON y la velocidad de la máquina.

Una vez iniciado, la app estará disponible en:

| URL | Descripción |
|-----|-------------|
| `http://localhost:3000/planner` | Planificador de rutas |
| `http://localhost:3000/health-status` | Estado del servidor |
| `http://localhost:3000/api/docs` | Swagger UI |
| `http://localhost:3000/api/docs.json` | Spec OpenAPI (JSON) |
| `http://localhost:3000/api/health` | Health check JSON |

---

## Arranques posteriores

Cuando el volumen de la BD ya tiene datos cargados no hace falta re-inicializar. Se puede omitir el servicio `db-init`:

```bash
docker compose up --build --scale db-init=0
```

O simplemente:

```bash
docker compose up
```

Docker Compose no vuelve a correr `db-init` si el contenedor ya completó exitosamente en el mismo volumen (el volumen `safetruck-pgdata` persiste entre reinicios).

---

## Comandos útiles

```bash
# Ver logs de todos los servicios en tiempo real
docker compose logs -f

# Ver logs solo de la app Next.js
docker compose logs -f app

# Ver logs del proceso de inicialización
docker compose logs db-init

# Detener todos los servicios (preserva datos)
docker compose down

# Detener y BORRAR el volumen de la BD (reset completo)
docker compose down -v

# Reconstruir solo la imagen de la app (útil tras cambios de código)
docker compose build app
docker compose up app

# Conectarse a la BD con psql desde la terminal
docker exec -it safetruck-db psql -U postgres -d safetruck
```

---

## Variables de entorno

Todas las variables tienen valores por defecto que funcionan con el `docker-compose.yml` incluido. Para cambiarlas, editá el archivo `docker-compose.yml` o usá un archivo `.env` en la raíz.

| Variable | Default | Usado por |
|----------|---------|-----------|
| `DB_HOST` | `db` | app (Next.js) |
| `DB_PORT` | `5432` | app (Next.js) |
| `DB_NAME` | `safetruck` | app (Next.js) |
| `DB_USER` | `postgres` | app (Next.js) |
| `DB_PASSWORD` | `postgres` | app (Next.js) |
| `PGHOST` | `db` | db-init |
| `PGDATABASE` | `safetruck` | db-init |
| `PGUSER` | `postgres` | db-init |
| `PGPASSWORD` | `postgres` | db-init |
| `PORT` | `3000` | app (Next.js) |

---

## Puertos expuestos

| Puerto | Servicio | Descripción |
|--------|----------|-------------|
| `3000` | app | Next.js (frontend + API) |
| `5432` | db | PostgreSQL (acceso local para herramientas como DBeaver) |

---

## Orden de inicialización de la BD

El proceso de setup de la base de datos está dividido en 5 pasos para respetar las dependencias entre ellos:

```
01_schema.sql         ← crea tablas, índices y extensiones PostGIS/pgRouting
      ↓
docker-seed.ts        ← importa GeoJSON a red_vial y red_camiones
      ↓
02_topology.sql       ← genera nodos y aristas con pgr_createTopology
      ↓
03_restrictions.sql   ← marca las aristas habilitadas para camiones
      ↓
04_backend_views.sql  ← crea nearest_graph_node() y export_graph_json()
```

El paso 1 lo ejecuta el contenedor `db` automáticamente. Los pasos 2–5 los ejecuta el contenedor `db-init`.

---

## Troubleshooting

**La app arranca pero dice "Error interno del servidor" al calcular una ruta:**
La BD puede no haber terminado de inicializarse. Revisá los logs de `db-init`:
```bash
docker compose logs db-init
```

**El contenedor `db-init` falla con error de conexión:**
Probablemente el contenedor `db` aún no está listo. El `healthcheck` debería manejarlo, pero si persiste podés aumentar los valores de `start_period` en el `docker-compose.yml`.

**Quiero resetear todo y empezar desde cero:**
```bash
docker compose down -v   # borra contenedores + volumen de datos
docker compose up --build
```
