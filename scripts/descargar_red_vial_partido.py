"""
Descarga la red vial de un partido de Buenos Aires usando OSMnx
y la guarda como GeoJSON en database/data/base/.

Filtra por jerarquía: solo motorway, trunk, primary, secondary,
tertiary y residential. Excluye service, track, footway, etc.

Uso:
    python3 scripts/descargar_red_vial_partido.py --partido "La Matanza"
    python3 scripts/descargar_red_vial_partido.py --partido "Tigre" --output tigre

El nombre del archivo de salida se infiere del slug del partido si no se pasa --output.
"""

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

import osmnx as ox

# Jerarquías de calles que dejamos pasar para ruteo de camiones
HIGHWAY_FILTER = (
    '["highway"~"motorway|trunk|primary|secondary|tertiary|residential|'
    'motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|unclassified"]'
)


def slugify(texto: str) -> str:
    """la-matanza, tigre, lomas-de-zamora, etc."""
    sin_tildes = "".join(
        c for c in unicodedata.normalize("NFD", texto)
        if unicodedata.category(c) != "Mn"
    )
    return re.sub(r"[^a-z0-9]+", "-", sin_tildes.lower()).strip("-")


def descargar(partido: str, provincia: str, output_path: Path) -> None:
    consulta = f"Partido de {partido}, {provincia}, Argentina"
    print(f"Consultando OSM: {consulta}")

    grafo = ox.graph_from_place(
        consulta,
        custom_filter=HIGHWAY_FILTER,
        retain_all=False,
        simplify=True,
    )

    print(f"  Nodos:   {grafo.number_of_nodes()}")
    print(f"  Aristas: {grafo.number_of_edges()}")

    # Convierto el grafo a GeoDataFrame de aristas (lo que importar.ts espera)
    _, edges = ox.graph_to_gdfs(grafo, nodes=True, edges=True)

    # Reseteo el índice multinivel (u, v, key) a columnas para que aparezcan en properties
    edges = edges.reset_index()

    # Algunas columnas de OSMnx vienen como listas (osmid, name cuando hay multiples)
    # Las pasamos a string para que GeoJSON sea estable.
    for col in ("osmid", "name", "highway", "lanes", "maxspeed", "ref"):
        if col in edges.columns:
            edges[col] = edges[col].apply(
                lambda v: ", ".join(map(str, v)) if isinstance(v, list) else v
            )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    edges.to_file(output_path, driver="GeoJSON")
    print(f"  ✓ Guardado en: {output_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--partido", required=True, help='Ej: "La Matanza"')
    parser.add_argument("--provincia", default="Buenos Aires")
    parser.add_argument("--output", help="Slug del archivo (sin extensión).")
    args = parser.parse_args()

    slug = args.output or slugify(args.partido)
    base = Path(__file__).resolve().parents[1]
    output = base / "database" / "data" / "base" / f"red-vial-{slug}.geojson"

    try:
        descargar(args.partido, args.provincia, output)
    except Exception as e:
        print(f"\n❌ Error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
