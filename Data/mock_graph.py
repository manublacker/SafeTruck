import networkx as nx 
import matplotlib.pyplot as plt

G = nx.MultiDiGraph()
G.add_node("Callao-Corrientes", lat=-34.6037, lon=-58.3816, nombre="Callao y Corrientes", tipo="interseccion")
G.add_node("Uruguay-Corrientes", lat=-34.60394, lon=-58.38658, nombre="Uruguay y Corrientes", tipo="interseccion")
G.add_node("Corrientes-9 de Julio", lat=-34.60356, lon=-58.38212, nombre="Corrientes y 9 de Julio", tipo="interseccion")
G.add_node("Lavalle-9 de Julio", lat=-34.60239, lon=-58.38187, nombre="Lavalle y 9 de Julio", tipo="interseccion")
G.add_edge("Callao-Corrientes", "Uruguay-Corrientes", length=550)
G.add_edge("Uruguay-Corrientes", "Callao-Corrientes", length=550)
G.add_edge("Corrientes-9 de Julio", "Lavalle-9 de Julio", length=140)

nx.draw(G, with_labels=True, font_weight='bold')
plt.show()