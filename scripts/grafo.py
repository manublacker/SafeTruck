import pickle
import networkx as nx
import psycopg2
from shapely import wkb

DB_CONFIG = {
    "host": "localhost",
    "dbname": "safetrack",
    "user": "calumac",
}


def get_grafo(solo_habilitadas=True):
    """
    Retorna un MultiDiGraph compatible con osmnx/astar.py del equipo de routing.

    Cada nodo tiene:
      - x: longitud (lon)
      - y: latitud (lat)

    Cada arista tiene:
      - length: longitud en metros
      - geometry: objeto Shapely LineString
      - nomoficial: nombre de la calle
      - sentido: CRECIENTE / DECRECIENTE / DOBLE
      - habilitada_camiones: bool

    Parámetros:
      solo_habilitadas: si True, incluye solo calles habilitadas para camiones
    """
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    filtro = "WHERE habilitada_camiones = TRUE" if solo_habilitadas else ""

    # Aristas
    cur.execute(f"""
        SELECT
            source,
            target,
            id,
            nomoficial,
            long AS length,
            sentido,
            habilitada_camiones,
            wkb_geometry
        FROM calles_caba
        {filtro}
        AND source IS NOT NULL
        AND target IS NOT NULL
    """)
    edges = cur.fetchall()

    # Nodos con coordenadas (x=lon, y=lat — igual que osmnx)
    cur.execute("""
        SELECT id,
               ST_X(geom) AS lon,
               ST_Y(geom) AS lat
        FROM calles_caba_vertices
    """)
    vertices = cur.fetchall()

    cur.close()
    conn.close()

    G = nx.MultiDiGraph()

    # Agregar nodos con coordenadas
    for vid, lon, lat in vertices:
        G.add_node(vid, x=lon, y=lat)

    # Agregar aristas
    for row in edges:
        source, target, seg_id, nombre, length, sentido, habilitada, geom_bytes = row
        geom = wkb.loads(bytes.fromhex(geom_bytes) if isinstance(geom_bytes, str) else geom_bytes.tobytes())

        attrs = {
            "id": seg_id,
            "length": length or 0,
            "geometry": geom,
            "nomoficial": nombre,
            "sentido": sentido,
            "habilitada_camiones": habilitada,
        }

        if sentido == "DECRECIENTE":
            G.add_edge(target, source, **attrs)
        else:
            G.add_edge(source, target, **attrs)
            if sentido not in ("CRECIENTE",):
                G.add_edge(target, source, **attrs)

    return G


def guardar_grafo(path="grafo.pkl", solo_habilitadas=True):
    G = get_grafo(solo_habilitadas=solo_habilitadas)
    with open(path, "wb") as f:
        pickle.dump(G, f)
    print(f"Grafo guardado: {G.number_of_nodes()} nodos, {G.number_of_edges()} aristas → {path}")
    return G


if __name__ == "__main__":
    guardar_grafo()
