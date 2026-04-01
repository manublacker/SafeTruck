import json
import psycopg2

DB_CONFIG = {
    "host": "localhost",
    "dbname": "safetrack",
    "user": "calumac",
}


def export_graph(output_path="graph.json"):
    """
    Exporta la red vial desde PostGIS al formato JSON que consume el A* de TypeScript.

    Formato de salida:
    {
      "nodes": { "<id>": { "id": "<id>", "lat": float, "lon": float } },
      "adjacency": { "<id>": [ { "to": "<id>", "lengthM": float, "truckAllowed": bool } ] }
    }
    """
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # Nodos con coordenadas
    cur.execute("""
        SELECT id,
               ST_Y(geom) AS lat,
               ST_X(geom) AS lon
        FROM calles_caba_vertices
    """)
    nodes = {}
    for vid, lat, lon in cur.fetchall():
        nid = str(vid)
        nodes[nid] = {"id": nid, "lat": lat, "lon": lon}

    # Aristas
    cur.execute("""
        SELECT source, target, long, sentido, habilitada_camiones
        FROM calles_caba
        WHERE source IS NOT NULL AND target IS NOT NULL
    """)

    adjacency = {}
    for source, target, length, sentido, habilitada in cur.fetchall():
        src = str(source)
        tgt = str(target)
        length_m = length or 0

        edge_forward = {
            "to": tgt,
            "lengthM": length_m,
            "truckAllowed": bool(habilitada),
        }
        edge_backward = {
            "to": src,
            "lengthM": length_m,
            "truckAllowed": bool(habilitada),
        }

        if sentido == "DECRECIENTE":
            adjacency.setdefault(tgt, []).append(edge_backward)
        else:
            adjacency.setdefault(src, []).append(edge_forward)
            if sentido not in ("CRECIENTE",):
                adjacency.setdefault(tgt, []).append(edge_backward)

    cur.close()
    conn.close()

    graph = {"nodes": nodes, "adjacency": adjacency}

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(graph, f, ensure_ascii=False)

    print(f"Grafo exportado: {len(nodes)} nodos → {output_path}")


if __name__ == "__main__":
    export_graph("database/graph.json")
