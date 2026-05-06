"""
Descarga la red vial completa de todos los municipios del AMBA desde OpenStreetMap
y guarda cada uno como GeoJSON en database/data/base/.

Uso:
    python3 scripts/descargar_amba.py

Skipea municipios que ya tienen su archivo descargado.
"""

import os
import time
import osmnx as ox

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "database", "data", "base")

MUNICIPIOS = [
    # (nombre_archivo, query_nominatim)

    # --- Ya descargados ---
    # ("red-vial-CABA",     "Ciudad Autónoma de Buenos Aires, Argentina"),
    # ("red-vial-lanus",    "Lanús, Buenos Aires, Argentina"),

    # --- Primer cordón ---
    ("red-vial-avellaneda",       "Avellaneda, Buenos Aires, Argentina"),
    ("red-vial-san_martin",       "General San Martín, Buenos Aires, Argentina"),
    ("red-vial-lomas_de_zamora",  "Lomas de Zamora, Buenos Aires, Argentina"),
    ("red-vial-la_matanza",       "La Matanza, Buenos Aires, Argentina"),
    ("red-vial-moron",            "Morón, Buenos Aires, Argentina"),
    ("red-vial-quilmes",          "Quilmes, Buenos Aires, Argentina"),
    ("red-vial-tres_de_febrero",  "Tres de Febrero, Buenos Aires, Argentina"),
    ("red-vial-vicente_lopez",    "Vicente López, Buenos Aires, Argentina"),

    # --- Segundo cordón ---
    ("red-vial-almirante_brown",      "Almirante Brown, Buenos Aires, Argentina"),
    ("red-vial-berazategui",          "Berazategui, Buenos Aires, Argentina"),
    ("red-vial-esteban_echeverria",   "Esteban Echeverría, Buenos Aires, Argentina"),
    ("red-vial-florencio_varela",     "Florencio Varela, Buenos Aires, Argentina"),
    ("red-vial-hurlingham",           "Hurlingham, Buenos Aires, Argentina"),
    ("red-vial-ituzaingo",            "Ituzaingó, Buenos Aires, Argentina"),
    ("red-vial-jose_c_paz",           "José C. Paz, Buenos Aires, Argentina"),
    ("red-vial-malvinas_argentinas",  "Malvinas Argentinas, Buenos Aires, Argentina"),
    ("red-vial-merlo",                "Merlo, Buenos Aires, Argentina"),
    ("red-vial-moreno",               "Moreno, Buenos Aires, Argentina"),
    ("red-vial-pilar",                "Pilar, Buenos Aires, Argentina"),
    ("red-vial-presidente_peron",     "Presidente Perón, Buenos Aires, Argentina"),
    ("red-vial-san_fernando",         "San Fernando, Buenos Aires, Argentina"),
    ("red-vial-san_isidro",           "San Isidro, Buenos Aires, Argentina"),
    ("red-vial-san_miguel",           "San Miguel, Buenos Aires, Argentina"),
    ("red-vial-tigre",                "Tigre, Buenos Aires, Argentina"),

    # --- Tercer cordón / extendido ---
    ("red-vial-escobar",           "Escobar, Buenos Aires, Argentina"),
    ("red-vial-ezeiza",            "Ezeiza, Buenos Aires, Argentina"),
    ("red-vial-campana",           "Campana, Buenos Aires, Argentina"),
    ("red-vial-zarate",            "Zárate, Buenos Aires, Argentina"),
    ("red-vial-marcos_paz",        "Marcos Paz, Buenos Aires, Argentina"),
    ("red-vial-general_rodriguez", "General Rodríguez, Buenos Aires, Argentina"),
]


def descargar_municipio(nombre_archivo: str, query: str) -> bool:
    ruta = os.path.join(OUTPUT_DIR, f"{nombre_archivo}.geojson")

    if os.path.exists(ruta):
        print(f"  [skip] {nombre_archivo} ya existe")
        return True

    print(f"  Descargando {query}...")
    try:
        G = ox.graph_from_place(query, network_type="drive")
        edges = ox.graph_to_gdfs(G, nodes=False).reset_index()
        edges.to_file(ruta, driver="GeoJSON")
        print(f"  ✓ {nombre_archivo}.geojson ({len(edges)} aristas)")
        return True
    except Exception as e:
        print(f"  ✗ Error en {nombre_archivo}: {e}")
        return False


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    total = len(MUNICIPIOS)
    exitosos = []
    fallidos = []

    for i, (nombre, query) in enumerate(MUNICIPIOS, 1):
        print(f"\n[{i}/{total}] {nombre}")
        ok = descargar_municipio(nombre, query)
        (exitosos if ok else fallidos).append(nombre)
        time.sleep(1)  # pausa entre requests a Nominatim

    print("\n" + "=" * 50)
    print(f"✓ Descargados: {len(exitosos)}/{total}")
    if fallidos:
        print(f"✗ Fallidos ({len(fallidos)}):")
        for m in fallidos:
            print(f"    - {m}")
        print("\n  Tip: los fallidos pueden tener un nombre distinto en Nominatim.")
        print("  Buscá el nombre exacto en https://nominatim.openstreetmap.org")


if __name__ == "__main__":
    main()
