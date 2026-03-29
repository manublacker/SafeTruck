import math
import heapq

# Calculo la distancia en línea recta entre dos puntos geográficos usando la fórmula Haversine
# Recibe latitud y longitud de dos puntos y devuelve la distancia en metros
def haversine(lat1, lon1, lat2, lon2):
    # Convierto los grados a radianes porque math trabaja en radianes
    lat1 = math.radians(lat1)
    lon1 = math.radians(lon1)
    lat2 = math.radians(lat2)
    lon2 = math.radians(lon2)

    # Calculo la diferencia de latitud y longitud entre los dos puntos
    difLat = lat2 - lat1
    difLon = lon2 - lon1

    R = 6371000  # Radio de la Tierra en metros
    # Fórmula Haversine: calcula la distancia entre dos puntos sobre la superficie de la Tierra
    a = math.sin(difLat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(difLon/2)**2
    distance = 2 * R * math.asin(math.sqrt(a))
    return distance

# Implementación del algoritmo A* para encontrar el camino más corto entre dos nodos
# Recibe el grafo, el nodo origen y el nodo destino
def astar(graph, origin, destination):
    heap = []  # Cola de prioridad: siempre procesa el nodo con menor f primero
    heapq.heappush(heap, (0, 0, origin))  # Agrego el origen con f=0 y g=0

    prev = {}  # Diccionario que guarda desde qué nodo llegué a cada nodo
    visited = set()  # Conjunto de nodos ya procesados para no repetirlos

    # Inicializo el costo real g de todos los nodos en infinito
    g = {}
    for nodo in graph.nodes:
        g[nodo] = float('inf')
    g[origin] = 0  # El costo de llegar al origen desde el origen es 0

    while heap:  # Mientras haya nodos por procesar
        actual_f, actual_g, nodo = heapq.heappop(heap)  # Saco el nodo con menor f

        if nodo in visited:  # Si ya lo procesé, lo salteo
            continue
        if nodo == destination:  # Si llegué al destino, termino
            break

        visited.add(nodo)  # Marco el nodo como visitado

        for neighbor in graph[nodo]:  # Recorro los vecinos del nodo actual
            # Calculo el nuevo costo real sumando la distancia de la arista
            new_g = actual_g + graph[nodo][neighbor][0]['length']

            if new_g < g[neighbor]:  # Si encontré un camino mejor al vecino
                g[neighbor] = new_g  # Actualizo el costo real del vecino
                prev[neighbor] = nodo  # Guardo que llegué al vecino desde el nodo actual
                # Calculo f = g + h, donde h es la distancia en línea recta al destino
                f = new_g + haversine(
                    graph.nodes[neighbor]['y'], graph.nodes[neighbor]['x'],
                    graph.nodes[destination]['y'], graph.nodes[destination]['x']
                )
                heapq.heappush(heap, (f, new_g, neighbor))  # Agrego el vecino a la cola

    return prev, g[destination]  # Devuelvo el camino y la distancia total al destino

def route (prev, origin, destination):
    route = []
    route.append(destination)
    new_prev = prev [destination]
    while new_prev != origin: 
        route.append(new_prev)
        new_prev = prev [new_prev]
    route.append(origin)
    route.reverse()
    return route