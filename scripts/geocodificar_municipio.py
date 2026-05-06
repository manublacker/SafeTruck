"""
Normaliza los tramos de una red de tránsito pesado de un partido para
cargarlos en red_camiones via SELECT contra red_vial.

NOTA: la versión anterior usaba georef.ar/intersecciones (igual que el
script de Lanús), pero ese endpoint fue deprecado por datos.gob.ar y
hoy responde 404. Pivoteamos a resolver por nombre contra red_vial
(ya cargado desde OSMnx por partido, así que la geometría está cortada
al polígono del partido).

Flujo:
  1. Lee el JSON del partido (3 esquemas posibles).
  2. Limpia nombres: quita alias entre paréntesis, expande abreviaturas,
     genera variantes para matching ILIKE.
  3. Verifica que cada nombre exista en el GeoJSON OSM del partido
     (database/data/base/red-vial-<slug>.geojson). Marca matches y
     fallos para revisión.
  4. Genera tramos-por-nombre-<slug>.json que importar.ts consume:
        INSERT INTO red_camiones (...)
        SELECT ... FROM red_vial WHERE dataset_origen = '<slug>'
                                  AND nombre ILIKE '<patron>'

Soporta los 3 esquemas:
  - allowed_streets       → name, start, end
  - calles_habilitadas    → nombre, desde, hasta, jerarquia
  - vias_habilitadas      → nombre, desde, hasta o "tramo": "Toda..."

Uso:
  ./venv/bin/python scripts/geocodificar_municipio.py \\
    --input database/data/restricciones/la_matanza_truck_network.json \\
    --partido "La Matanza"
"""

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path


def slugify(texto: str) -> str:
    sin = "".join(
        c for c in unicodedata.normalize("NFD", texto)
        if unicodedata.category(c) != "Mn"
    )
    return re.sub(r"[^a-z0-9]+", "-", sin.lower()).strip("-")


def normalizar_para_matching(nombre: str) -> str:
    """Sin tildes, en minúsculas, sin paréntesis, sin abreviaturas, normalizado."""
    if not nombre:
        return ""
    # Quitar alias entre paréntesis
    n = re.sub(r"\s*\(.*?\)\s*", " ", nombre)
    # Sin tildes
    n = "".join(
        c for c in unicodedata.normalize("NFD", n)
        if unicodedata.category(c) != "Mn"
    )
    n = n.lower().strip()
    # Expandir abreviaturas (con espacio o punto)
    reemplazos = [
        (r"\bav\.?\b",     "avenida"),
        (r"\bcnel\.?\b",   "coronel"),
        (r"\bgral\.?\b",   "general"),
        (r"\bpte\.?\b",    "presidente"),
        (r"\bcno\.?\b",    "camino"),
        (r"\bdr\.?\b",     "doctor"),
        (r"\bpres\.?\b",   "presidente"),
        (r"\brn\b",        "ruta nacional"),
        (r"\brp\b",        "ruta provincial"),
    ]
    for patron, completo in reemplazos:
        n = re.sub(patron, completo, n)
    return re.sub(r"\s+", " ", n).strip()


def extraer_ref(nombre: str) -> str | None:
    """Detecta si el nombre refiere a una ruta y devuelve su ref OSM (RN3, RP4...)."""
    if not nombre:
        return None
    # 1. Ref explícita en paréntesis: "Camino de Cintura (RP4)" → RP4
    m = re.search(r"\(([RA][NP]A?\s*\d+)\)", nombre, re.IGNORECASE)
    if m:
        return re.sub(r"\s+", "", m.group(1)).upper()
    # 2. Variantes textuales: "Ruta Nacional 3", "Ruta Provincial 21"
    n = normalizar_para_matching(nombre)
    m = re.search(r"ruta\s+nacional\s+(\d+)", n)
    if m:
        return f"RN{m.group(1)}"
    m = re.search(r"ruta\s+provincial\s+(\d+)", n)
    if m:
        return f"RP{m.group(1)}"
    return None


def palabras_distintivas(nombre: str) -> list[str]:
    """Extrae las palabras significativas (no genéricas) del nombre."""
    n = normalizar_para_matching(nombre)
    n = re.sub(r"\b(avenida|calle|ruta|nacional|provincial|de|la|el|los|las|del|y)\b", "", n)
    return [p for p in n.split() if len(p) > 2]


def patron_ilike(nombre: str) -> str:
    """Patrón ILIKE para columna nombre en red_vial (todas las palabras en orden)."""
    palabras = palabras_distintivas(nombre)
    if not palabras:
        return f"%{normalizar_para_matching(nombre)}%"
    # Concatena las palabras con %: "%juan%manuel%rosas%" (mucho más selectivo)
    return "%" + "%".join(palabras) + "%"


def cargar_tramos(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    for key in ("allowed_streets", "calles_habilitadas", "vias_habilitadas"):
        if key in data:
            tramos = []
            for t in data[key]:
                tramos.append({
                    "calle":     t.get("name") or t.get("nombre"),
                    "desde":     t.get("start") or t.get("desde"),
                    "hasta":     t.get("end") or t.get("hasta"),
                    "tramo":     t.get("tramo"),
                    "jerarquia": t.get("jerarquia"),
                    "notas":     t.get("notes") or t.get("notas"),
                })
            return tramos
    raise ValueError(f"No encontré allowed_streets / calles_habilitadas / vias_habilitadas en {path}")


def cargar_osm(geojson_path: Path) -> tuple[set[str], set[str]]:
    """Devuelve (nombres normalizados, refs) del GeoJSON OSM."""
    if not geojson_path.exists():
        print(f"⚠ No existe {geojson_path}, no puedo validar matches.")
        return set(), set()
    data = json.loads(geojson_path.read_text(encoding="utf-8"))
    nombres = set()
    refs = set()
    for feat in data.get("features", []):
        p = feat.get("properties", {})
        name = p.get("name")
        if name:
            nombres.add(normalizar_para_matching(name))
        ref = p.get("ref")
        if ref:
            # ref puede venir como "RP21;070-03" → desarmar
            for r in re.split(r"[;,]", str(ref)):
                refs.add(r.strip())
    return nombres, refs


def buscar_matches_por_nombre(nombre_buscado: str, nombres_osm: set[str]) -> tuple[list[str], str]:
    """
    Devuelve (matches, patrón_usado).
    Estrategia:
      1. Estricto: todas las palabras distintivas en orden.
      2. Fallback tolerante a typos: prefijo de 5 chars (o palabra completa
         si es más corta) de CADA palabra distintiva, en orden. Esto
         tolera errores tipo Riccheri/Ricchieri sin volverse demasiado
         laxo (no usa una sola palabra suelta).
    """
    if not nombres_osm:
        return [], ""
    palabras = palabras_distintivas(nombre_buscado)
    if not palabras:
        n = normalizar_para_matching(nombre_buscado)
        return [o for o in nombres_osm if n in o], f"%{n}%"

    def matches_secuenciales(prefijos: list[str]) -> list[str]:
        out = []
        for o in nombres_osm:
            pos = 0
            ok = True
            for p in prefijos:
                idx = o.find(p, pos)
                if idx < 0:
                    ok = False
                    break
                pos = idx + len(p)
            if ok:
                out.append(o)
        return out

    # 1. Estricto
    estrictos = matches_secuenciales(palabras)
    if estrictos:
        return estrictos, "%" + "%".join(palabras) + "%"

    # 2. Fallback: prefijo de 5 chars de cada palabra (tolera typos)
    prefijos = [p[:5] if len(p) >= 5 else p for p in palabras]
    flojos = matches_secuenciales(prefijos)
    patron_flojo = "%" + "%".join(prefijos) + "%"
    return flojos, patron_flojo


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="JSON del partido")
    parser.add_argument("--partido", required=True, help='Ej: "La Matanza"')
    parser.add_argument("--provincia", default="Buenos Aires")
    parser.add_argument("--output-slug", help="Slug para los archivos de salida")
    args = parser.parse_args()

    base = Path(__file__).resolve().parents[1]
    input_path = Path(args.input) if Path(args.input).is_absolute() else base / args.input
    slug = args.output_slug or slugify(args.partido)

    osm_path = base / "database" / "data" / "base" / f"red-vial-{slug}.geojson"
    out_dir = base / "database" / "data" / "restricciones"
    out_por_nombre = out_dir / f"tramos-por-nombre-{slug}.json"
    out_reporte = out_dir / f"reporte-{slug}.txt"

    print(f"Leyendo tramos:    {input_path}")
    print(f"Validando contra:  {osm_path}\n")

    tramos = cargar_tramos(input_path)
    nombres_osm, refs_osm = cargar_osm(osm_path)
    print(f"  {len(tramos)} tramos en JSON")
    print(f"  {len(nombres_osm)} nombres únicos en OSM, {len(refs_osm)} refs\n")

    salida = []
    sin_match = []
    sin_calle = []

    for i, t in enumerate(tramos, 1):
        if not t["calle"]:
            sin_calle.append(t)
            print(f"[{i}/{len(tramos)}] ✗ Sin nombre, omitido")
            continue

        ref = extraer_ref(t["calle"])
        matches_nombre, patron_usado = buscar_matches_por_nombre(t["calle"], nombres_osm)
        matches_ref = ref in refs_osm if ref else False

        ilike_final = patron_usado or patron_ilike(t["calle"])
        # Si la ruta ya matchea por ref, anulamos el ILIKE para no sumar
        # falsos positivos vía el OR del SQL (ej: "Camino de Cintura" → ref RP4
        # alcanza; el ILIKE caería sobre "caminito" y otros).
        if matches_ref and ref:
            ilike_final = None

        entrada = {
            "calle":              t["calle"],
            "calle_normalizada":  normalizar_para_matching(t["calle"]),
            "desde":              t["desde"],
            "hasta":              t["hasta"],
            "tramo":              t["tramo"],
            "jerarquia":          t["jerarquia"],
            "notas":              t["notas"],
            "ilike_pattern":      ilike_final,
            "ref_buscar":         ref,
            "matches_en_osm":     matches_nombre[:5],
            "cantidad_matches":   len(matches_nombre),
            "match_ref":          matches_ref,
        }
        salida.append(entrada)

        ok = bool(matches_nombre) or matches_ref
        if ok:
            estrategias = []
            if matches_ref:
                estrategias.append(f"ref={ref}")
            if matches_nombre:
                estrategias.append(
                    f"ILIKE '{patron_usado}' ({len(matches_nombre)} matches)"
                )
            print(f"[{i}/{len(tramos)}] ✓ {t['calle']}  →  {' | '.join(estrategias)}")
        else:
            sin_match.append(entrada)
            print(
                f"[{i}/{len(tramos)}] ⚠ {t['calle']}  →  ref={ref}, "
                f"ILIKE '{patron_usado}'  (SIN match)"
            )

    out_dir.mkdir(parents=True, exist_ok=True)
    out_por_nombre.write_text(
        json.dumps(
            {"partido": args.partido, "slug": slug, "tramos": salida},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    reporte = [
        f"Partido: {args.partido}",
        f"Slug: {slug}",
        f"Tramos en JSON: {len(tramos)}",
        f"Tramos con match en OSM: {len(salida) - len(sin_match)}",
        f"Tramos SIN match en OSM: {len(sin_match)}",
        f"Tramos sin nombre (omitidos): {len(sin_calle)}",
        "",
        "=== Tramos sin match (revisar a mano) ===",
    ]
    for s in sin_match:
        reporte.append(f"  - {s['calle']}  →  patrón '{s['ilike_pattern']}'")
    out_reporte.write_text("\n".join(reporte) + "\n", encoding="utf-8")

    print("\n" + "=" * 60)
    print(f"✓ Tramos por nombre: {out_por_nombre}")
    print(f"✓ Reporte:           {out_reporte}")
    print(
        f"\nResumen: {len(salida) - len(sin_match)} con match | "
        f"{len(sin_match)} sin match | {len(sin_calle)} sin calle"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
