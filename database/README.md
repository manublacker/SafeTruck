# Base de datos SafeTruck

Esta carpeta ya tiene una base funcional para el MVP de ruteo de camiones y ahora tambien una capa SQL pensada para que el backend en TypeScript consuma el grafo sin tener que conocer detalles de PostGIS o pgRouting.

## Objetivo del modulo

La base de datos hace cuatro cosas:

1. Guarda la red vial base.
2. Construye el grafo de routing.
3. Marca que tramos estan habilitados para camiones.
4. Expone nodos, aristas y exportaciones JSON para el backend.

## Flujo recomendado

1. Crear la base:

```bash
createdb safetruck
psql -d safetruck -f database/sql/01_schema.sql
```

2. Importar GeoJSONs:

```bash
npx ts-node database/import/importar.ts --all
```

3. Construir topologia y restricciones:

```bash
psql -d safetruck -f database/sql/02_topology.sql
psql -d safetruck -f database/sql/03_restrictions.sql
psql -d safetruck -f database/sql/04_backend_views.sql
```

## Sumar un partido nuevo (conurbano)

Para incorporar un partido que todavía no está en `red_vial` (ej: La Matanza, Tigre, San Isidro), el flujo es:

```bash
# 1. Bajar la red vial OSM (filtrada por jerarquía: motorway, trunk, primary,
#    secondary, tertiary, residential). Genera database/data/base/red-vial-<slug>.geojson
./venv/bin/python scripts/descargar_red_vial_partido.py --partido "La Matanza"

# 2. Resolver tramos habilitados contra esa red OSM. Genera
#    database/data/restricciones/tramos-por-nombre-<slug>.json + reporte
./venv/bin/python scripts/geocodificar_municipio.py \
    --input database/data/restricciones/la_matanza_truck_network.json \
    --partido "La Matanza"

# 3. Cargar a la base (Supabase remota o local)
export DATABASE_URL="postgresql://postgres:...@db.xxx.supabase.co:5432/postgres"
npx ts-node database/import/importar.ts --partido la-matanza

# 4. Regenerar topología (incluye las aristas del partido nuevo)
psql "$DATABASE_URL" -f database/sql/02_topology.sql

# 5. Refrescar camion_permitido sólo para ese partido
psql "$DATABASE_URL" -v partido="'la_matanza'" -f database/sql/10_refresh_restricciones.sql
```

> Antes de ejecutar el paso 3, agregá el partido al diccionario `PARTIDOS_NUEVOS` en `database/import/importar.ts`.

> El paso 4 (`02_topology.sql`) **inserta sin truncar**. Si la tabla `aristas` ya tenía datos de CABA y Lanús, vas a duplicar. Para regenerar limpio:
> ```sql
> TRUNCATE aristas, nodos RESTART IDENTITY CASCADE;
> ```
> y después correr `02_topology.sql` + `03_restrictions.sql` + `06_importar_red_camiones_kml.sql` + `10_refresh_restricciones.sql` por cada partido.

### Estrategia de matching de tramos

A diferencia de Lanús (que usaba `georef.ar/intersecciones`, **endpoint deprecado en 2026**), los partidos nuevos resuelven la geometría de cada tramo directamente contra `red_vial`. El script `geocodificar_municipio.py` valida que cada tramo del JSON municipal tenga match en OSM y genera dos estrategias:

- **Match por `ref` OSM** (más confiable para rutas): `RN3`, `RP4`, `RP21`, etc. Detecta automáticamente "Ruta Nacional 3", "Ruta Provincial 21", o alias entre paréntesis como `(RP4)`.
- **Match por `nombre` con ILIKE**: usa todas las palabras distintivas del nombre en orden. Si no hay match estricto, cae a "primera palabra de 5+ letras" para tolerar typos (Riccheri vs Ricchieri).

Tramos sin match quedan en `database/data/restricciones/reporte-<slug>.txt` para revisión manual.

## Tablas principales

- `red_vial`: segmentos viales genericos del pais.
- `red_camiones`: corredores habilitados para transito pesado.
- `aristas`: tramos del grafo con `source`, `target`, `costo`, `costo_reverso`.
- `nodos`: intersecciones del grafo.

## Modelo de datos

La tabla `red_vial` ya no esta pensada solo para CABA.

Columnas nacionales:

- `dataset_origen`: de que fuente vino el tramo.
- `feature_id`: id original de esa fuente.
- `codigo`: codigo interno de la via si existe.
- `nombre`: nombre principal de la calle o ruta.
- `nombre_alterno`: otro nombre util para mostrar o buscar.
- `tipo_via`: calle, avenida, ruta, autopista, etc.
- `longitud_m`: longitud del tramo en metros.
- `sentido`: direccion de circulacion informada por la fuente.
- `jerarquia_vial`: importancia funcional de la via.
- `jurisdiccion`: provincia, CABA o nacional.
- `metadata`: JSONB con atributos especificos del dataset.

Ejemplo: comuna, barrio, numeracion, tipo de cruce ferroviario o cualquier otro campo que exista en CABA pero no necesariamente en todo el pais ahora viven en `metadata`.

## Contrato para backend TypeScript

Tus companeros pueden apoyarse en estas piezas:

- `backend_nodos`
  Devuelve `id`, `lat`, `lon`.

- `backend_aristas_dirigidas`
  Devuelve una fila por direccion realmente transitable.
  Si una calle es doble mano, aparecen dos filas.
  Si una calle es mano unica, aparece una sola fila.

- `nearest_graph_node(lon, lat)`
  Sirve para convertir una coordenada del mapa al nodo mas cercano del grafo.

- `export_graph_json(p_only_truck_allowed boolean)`
  Devuelve un JSONB con la misma forma que espera `Algorithm/astar.ts`.

## Consultas utiles

Nodo mas cercano a un punto:

```sql
SELECT *
FROM nearest_graph_node(-58.3816, -34.6037);
```

Aristas salientes de un nodo:

```sql
SELECT *
FROM backend_aristas_dirigidas
WHERE from_node = 123
ORDER BY length_m;
```

Exportar el grafo completo:

```sql
SELECT export_graph_json(FALSE);
```

Exportar solo la subred habilitada para camiones:

```sql
SELECT export_graph_json(TRUE);
```

## Recomendacion de arquitectura

Para el proyecto general de Argentina, conviene separar dos niveles:

1. `base geoespacial`
   Guarda calles, rutas nacionales, rutas provinciales, restricciones, puentes y limites fisicos.

2. `grafo de routing`
   Guarda nodos y aristas ya normalizados para A*.

Esta carpeta ya cubre bien el segundo nivel para el MVP. Si despues amplian fuera de CABA, el siguiente paso natural es normalizar todas las fuentes argentinas a una tabla comun antes de regenerar `aristas`.
