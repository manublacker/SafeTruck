# ──────────────────────────────────────────────────────────────────────────────
# Dockerfile — safetruck-backend
#
# Build multi-stage:
#   1. builder  → instala dependencias y compila TypeScript a /dist
#   2. runner   → imagen final solo con las dependencias de producción y /dist
#
# Variables de entorno requeridas en producción:
#   PGHOST      (default: safetruck-db)
#   PGPORT      (default: 5432)
#   PGDATABASE  (default: safetruck)
#   PGUSER      (default: postgres)
#   PGPASSWORD  ← obligatorio en producción
#   PORT        (default: 3000)
# ──────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Instalar dependencias (incluyendo devDependencies para compilar TS)
COPY package*.json ./
RUN sed -i 's/\r//' package.json 2>/dev/null || true
RUN npm install

# Copiar fuentes y compilar TypeScript → dist/
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build 2>/dev/null || npx tsc

# ── Stage 2: Runner ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Solo dependencias de producción
COPY package*.json ./
RUN sed -i 's/\r//' package.json 2>/dev/null || true
RUN npm install --omit=dev

# Copiar el código compilado desde el stage anterior
COPY --from=builder /app/dist ./dist

# Puerto que expone el servidor Express
EXPOSE 3000

# Healthcheck para que Container Apps sepa si el proceso está vivo
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
