import networkx as nx 
import matplotlib.pyplot as plt
import osmnx as ox
G = ox.graph_from_place("Palermo, Buenos Aires")
print(G.nodes(data=True))
print(G.edges(data=True))
ox.plot_graph(G)
plt.show()
