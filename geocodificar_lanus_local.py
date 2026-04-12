"""
Geocodifica las intersecciones de la Red de Tránsito Pesado de Lanús
usando la API pública georef.ar (datos.gob.ar).

Estrategia:
    - Por cada intersección (calle_principal & calle_transversal),
      consulta el endpoint /intersecciones de georef.ar, que devuelve
      directamente la coordenada del cruce entre dos calles.

Uso:
    pip install requests
    python3 geocodificar_lanus_v4.py

Genera: red_transito_pesado_lanus.geojson
"""

import json
import time
import unicodedata
import requests

BASE = "https://apis.datos.gob.ar/georef/api"
DEPARTAMENTO = "Lanús"
PROVINCIA = "Buenos Aires"

# -- Tramos del PDF --
# Formato: (nombre_calle, calle_inicio, calle_fin, red)
TRAMOS = [
    ("Av. Remedios de Escalada de San Martín", "Puente Ezequiel Demonty",        "Av. Hipólito Yrigoyen",               "primaria"),
    ("Viamonte",                               "Orán",                            "Rincón",                              "primaria"),
    ("Rincón",                                 "Viamonte",                        "Cnel. Sayos",                         "primaria"),
    ("Cnel. Sayos",                            "Rincón",                          "Cnel. Osorio",                        "primaria"),
    ("Av. 25 de Mayo",                         "Cnel. Osorio",                    "Av. San Martín",                      "primaria"),
    ("Marco Avellaneda",                       "Enrique Fernández",               "Pte. Julio Argentino Roca",           "primaria"),
    ("Caferata",                               "Pte. Julio Argentino Roca",       "Av. Presbítero Pedro F. Uriarte",     "primaria"),
    ("Gral. Hornos",                           "Carlos Pellegrini",               "Ramón Franco",                        "primaria"),
    ("Av. Presbítero Pedro F. Uriarte",        "Ramón Franco",                    "Ferrocarril Gral. Roca",              "primaria"),
    ("Av. Hipólito Yrigoyen",                  "Av. Presbítero Pedro F. Uriarte", "Av. Teodoro Sánchez de Bustamante",   "primaria"),
    ("Presbítero José Malabia",                "Ferrocarril Gral. Roca",          "Aconcagua",                           "primaria"),
    ("Aconcagua",                              "Av. Centenario Uruguayo",         "Granaderos",                          "primaria"),
    ("Granaderos",                             "Aconcagua",                       "Roma",                                "primaria"),
    ("Roma",                                   "Granaderos",                      "Cnel. Lynch",                         "primaria"),
    ("Cnel. Lynch",                            "Roma",                            "Cno. Gral. Manuel Belgrano",          "primaria"),
    ("Cno. Gral. Belgrano",                    "Cnel. Martín Paulino Lacarra",    "Cnel. Lynch",                         "primaria"),
    ("Gral. Madariaga",                        "Av. Pte. Raúl Alfonsín",          "Cno. Gral. Belgrano",                 "primaria"),
    ("Av. San Martín",                         "Av. Gral. Hornos",                "Brasil",                              "primaria"),
    ("Av. Pte. Bernardino Rivadavia",          "Brasil",                          "Av. 25 de Mayo",                      "primaria"),
    ("Gral. Olazábal",                         "Carlos Pellegrini",               "Enrique Fernández",                   "primaria"),
    ("Enrique Fernández",                      "Gral. Olazábal",                  "Marco Avellaneda",                    "primaria"),
    ("Av. Pte. Raúl Alfonsín",                 "Av. Hipólito Yrigoyen",           "Av. Centenario Uruguayo",             "primaria"),
    ("Av. Centenario Uruguayo",                "Aconcagua",                       "Cno. Gral. Belgrano",                 "primaria"),
    ("Cnel. Osorio",                           "Carlos Pellegrini",               "Av. Remedios de Escalada de San Martín", "primaria"),
    ("Choele Choel",                           "Cnel. Osorio",                    "Av. Remedios de Escalada de San Martín", "secundaria"),
    ("Viamonte",                               "Cnel. Osorio",                    "Av. San Martín",                      "secundaria"),
    ("Diputado M. Pedrera",                    "Av. Pte. Bernardino Rivadavia",   "Enrique Fernández",                   "secundaria"),
    ("Av. Manuel Quindimil",                   "Enrique Fernández",               "Av. Hipólito Yrigoyen",               "secundaria"),
    ("Av. Gral. Donato Álvarez",               "Cno. Gral. Belgrano",             "Cnel. Lynch",                         "secundaria"),
    ("Villa de Luján",                         "29 de Septiembre",                "Av. Pte. Raúl Alfonsín",              "secundaria"),
    ("29 de Septiembre",                       "Malabia",                         "Villa de Luján",                      "secundaria"),
    ("Gral. Deheza",                           "Presbítero José Malabia",         "Allende",                             "secundaria"),
    ("Gral. Deheza",                           "Ramón Cabrero",                   "Av. Pte. Raúl Alfonsín",              "secundaria"),
    ("Allende",                                "Gral. Deheza",                    "Villa de Luján",                      "secundaria"),
    ("Eva Perón",                              "Oncativo",                        "Gral. Pinto",                         "secundaria"),
    ("Ramón Cabrero",                          "Cnel. Lynch",                     "29 de Septiembre",                    "secundaria"),
]


def sin_tildes(texto: str) -> str:
    """Elimina tildes para búsquedas más flexibles."""
    return "".join(
        c for c in unicodedata.normalize("NFD", texto)
        if unicodedata.category(c) != "Mn"
    )


def limpiar_nombre(nombre: str) -> str:
    """Expande abreviaciones comunes del PDF al nombre completo."""
    reemplazos = [
        ("Av. ",    "Avenida "),
        ("Av ",     "Avenida "),
        ("Cnel. ",  "Coronel "),
        ("Gral. ",  "General "),
        ("Pte. ",   "Presidente "),
        ("Cno. ",   "Camino "),
        ("Dr. ",    "Doctor "),
    ]
    for abrev, completo in reemplazos:
        if nombre.startswith(abrev):
            nombre = completo + nombre[len(abrev):]
    return nombre


def geocodificar_interseccion(calle1: str, calle2: str) -> tuple[float, float] | None:
    """
    Consulta el endpoint /intersecciones de georef.ar.
    Devuelve (lat, lon) o None si no encuentra el cruce.
    """
    url = f"{BASE}/intersecciones"
    params = {
        "calle_nombre_1":        limpiar_nombre(calle1),
        "calle_nombre_2":        limpiar_nombre(calle2),
        "departamento_nombre":   DEPARTAMENTO,
        "provincia_nombre":      PROVINCIA,
        "max":                   1,
        "campos":                "geometria",
    }

    try:
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        intersecciones = data.get("intersecciones", [])
        if not intersecciones:
            return None

        geom = intersecciones[0].get("geometria", {})
        coords = geom.get("coordinates", [])
        if not coords:
            return None

        # GeoJSON devuelve [lon, lat]
        lon, lat = coords[0], coords[1]
        return float(lat), float(lon)

    except Exception as e:
        print(f"    Error HTTP: {e}")
        return None


def main():
    features = []
    fallidos = []
    total = len(TRAMOS)

    for i, (calle, inicio, fin, red) in enumerate(TRAMOS):
        print(f"[{i+1}/{total}] {calle}: {inicio} → {fin}")

        coord_inicio = geocodificar_interseccion(calle, inicio)
        time.sleep(0.3)
        coord_fin = geocodificar_interseccion(calle, fin)
        time.sleep(0.3)

        if coord_inicio and coord_fin:
            lat1, lon1 = coord_inicio
            lat2, lon2 = coord_fin
            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[lon1, lat1], [lon2, lat2]],
                },
                "properties": {
                    "calle": calle,
                    "desde": inicio,
                    "hasta": fin,
                    "red": red,
                },
            })
            print(f"  ✓ ({lat1:.5f}, {lon1:.5f}) → ({lat2:.5f}, {lon2:.5f})")
        else:
            fallidos.append((calle, inicio, fin))
            if not coord_inicio:
                print(f"  ⚠ Sin intersección: {calle} & {inicio}")
            if not coord_fin:
                print(f"  ⚠ Sin intersección: {calle} & {fin}")
            print(f"  ✗ Tramo omitido")

    geojson = {"type": "FeatureCollection", "features": features}
    with open("red_transito_pesado_lanus.geojson", "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 50)
    print(f"✓ GeoJSON guardado: red_transito_pesado_lanus.geojson")
    print(f"  Tramos geocodificados: {len(features)}/{total}")
    if fallidos:
        print(f"\n  Fallidos ({len(fallidos)}):")
        for calle, inicio, fin in fallidos:
            print(f"    - {calle}: {inicio} → {fin}")


if __name__ == "__main__":
    main()