import networkx as nx 
import matplotlib.pyplot as plt
import osmnx as ox
from Algorithm.astar import astar, haversine, route

G = ox.graph_from_place("Palermo, Buenos Aires")
Y = -34.6037
X = -58.3816
Z = -34.5833
W = -58.4167
node1 = ox.nearest_nodes(G, X, Y)
node2 = ox.nearest_nodes(G, W, Z)

prev, distance = astar(G, node1, node2)
new_route = route (prev, node1, node2)
print(new_route)
print(distance)
print(node1)
print(node2)
#print(G.nodes(data=True))
#print(G.edges(data=True))
#ox.plot_graph(G)
#plt.show()
