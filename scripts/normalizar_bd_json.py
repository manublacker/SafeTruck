"""
Normaliza todos los JSONs de restricciones de BD_JSON al formato estándar
y los copia a database/data/restricciones/.

Uso:
    python3 scripts/normalizar_bd_json.py

Skippea archivos GeoJSON (CABA, San Martín) — esos se importan directamente.
"""

import json
import os
import unicodedata

BD_JSON_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "BD_JSON")
SALIDA_DIR = os.path.join(os.path.dirname(__file__), "..", "database", "data", "restricciones")


def slugify(texto: str) -> str:
    """Convierte 'General San Martín' → 'san_martin'"""
    s = unicodedata.normalize("NFD", texto)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower().replace(" ", "_")
    if s.startswith("general_"):
        s = s[len("general_"):]
    return s


def normalizar_via(entry: dict) -> dict:
    """Mapea cualquier formato de via al formato estándar."""
    return {
        "nombre": entry.get("nombre") or entry.get("name"),
        "desde":  entry.get("desde")  or entry.get("start"),
        "hasta":  entry.get("hasta")  or entry.get("end"),
        "jerarquia": entry.get("jerarquia") or entry.get("tipo") or entry.get("type"),
        "notas": entry.get("notas") or entry.get("notes") or entry.get("restricciones"),
    }


def normalizar_alerta(entry: dict) -> dict:
    return {
        "ubicacion":   entry.get("ubicacion") or entry.get("location"),
        "altura_max_m": entry.get("altura_max_m") or entry.get("max_height"),
    }


def normalizar(raw: dict) -> dict | None:
    """Convierte cualquier formato conocido al estándar. Devuelve None si es GeoJSON."""
    if "features" in raw:
        return None  # GeoJSON — se importa por otra vía

    config_raw = raw.get("config", {})

    config = {
        "limite_peso_kg": (
            config_raw.get("limite_peso_general_kg")
            or config_raw.get("peso_max_local_kg")
            or config_raw.get("global_weight_limit_kg")
        ),
        "altura_max_m": (
            config_raw.get("altura_estandar_m")
            or config_raw.get("max_standard_height_m")
        ),
        "politica_ruteo": (
            config_raw.get("politica_ruteo")
            or config_raw.get("routing_policy")
        ),
    }

    vias_raw = (
        raw.get("vias_habilitadas")
        or raw.get("calles_habilitadas")
        or raw.get("allowed_streets")
        or []
    )

    alertas_raw = (
        raw.get("alertas_altura")
        or raw.get("alertas_altura_critica")
        or raw.get("hazards_height_limit")
        or []
    )

    return {
        "partido":      raw.get("partido", ""),
        "provincia":    "Buenos Aires",
        "fuente_legal": raw.get("fuente_legal"),
        "config":       config,
        "vias_habilitadas": [normalizar_via(v) for v in vias_raw],
        "alertas_altura":   [normalizar_alerta(a) for a in alertas_raw],
    }


def main():
    os.makedirs(SALIDA_DIR, exist_ok=True)

    archivos = [f for f in os.listdir(BD_JSON_DIR) if f.endswith(".json") or f.endswith(".geojson")]
    exitosos, saltados, fallidos = [], [], []

    for archivo in sorted(archivos):
        ruta = os.path.join(BD_JSON_DIR, archivo)
        print(f"\n{archivo}")

        try:
            with open(ruta, encoding="utf-8") as f:
                raw = json.load(f)

            resultado = normalizar(raw)

            if resultado is None:
                print("  [skip] GeoJSON — se importa directamente")
                saltados.append(archivo)
                continue

            slug = slugify(resultado["partido"])
            if not slug:
                print("  [skip] Sin campo 'partido'")
                saltados.append(archivo)
                continue

            salida = os.path.join(SALIDA_DIR, f"{slug}.json")
            with open(salida, "w", encoding="utf-8") as f:
                json.dump(resultado, f, ensure_ascii=False, indent=2)

            n_vias = len(resultado["vias_habilitadas"])
            n_alertas = len(resultado["alertas_altura"])
            print(f"  ✓ → {slug}.json  ({n_vias} vías, {n_alertas} alertas)")
            exitosos.append(slug)

        except Exception as e:
            print(f"  ✗ Error: {e}")
            fallidos.append(archivo)

    print("\n" + "=" * 50)
    print(f"✓ Normalizados: {len(exitosos)}")
    print(f"  Saltados (GeoJSON): {len(saltados)}")
    if fallidos:
        print(f"✗ Fallidos: {fallidos}")


if __name__ == "__main__":
    main()
