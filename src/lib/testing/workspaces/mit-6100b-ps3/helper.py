import numpy as np
import matplotlib.pyplot as plt
from scipy.spatial import Voronoi, voronoi_plot_2d, distance_matrix
import sys
import random
import networkx as nx
import itertools
import time

############################################################
# Districting Map Visualization Helper Functions           #
############################################################

# You do not need to understand or modify this function
def generate_grid_voronoi(n_cols, n_rows, max_neighbors, seed):
    np.random.seed(seed)

    num_points = n_cols * n_rows

    jitter = 0.05
    x = np.linspace(0.1, 0.9, n_cols)
    y = np.linspace(0.1, 0.9, n_rows)
    xv, yv = np.meshgrid(x, y)
    points = np.c_[xv.ravel(), yv.ravel()] + np.random.uniform(-jitter, jitter,
                                                               (num_points, 2))
    # Compute Voronoi diagram
    vor = Voronoi(points)

    # Step 1: Build full neighbor set from ridge_points
    neighbor_map = {i: set() for i in range(num_points)}
    for p1, p2 in vor.ridge_points:
        neighbor_map[p1].add(p2)
        neighbor_map[p2].add(p1)

    # Step 2: Limit neighbors based on distance
    dists = distance_matrix(points, points)
    limited_neighbor_map = {}
    for i in range(num_points):
        neighbors = list(neighbor_map[i])
        # Sort neighbors by distance
        neighbors.sort(key=lambda j: dists[i, j])
        # Keep only up to max_neighbors
        limited_neighbor_map[i] = neighbors[:max_neighbors]

    # Step 3: Build final symmetric edges (undirected)
    edges = set()
    for i in range(num_points):
        for j in limited_neighbor_map[i]:
            if (i, j) not in edges:
                edges.add((i, j))
    new_edges = set()           
    for i, j in edges:
        if (j, i) not in edges:
            new_edges.add((j, i))
    edges = edges | new_edges
    return points, vor, edges


# You do not need to understand or modify this function
def voronoi_finite_polygons_2d(vor, radius=1000):
    """
    Reconstruct infinite Voronoi regions in a 2D diagram to finite regions.
    
    Parameters:
        vor: Voronoi
            Input diagram.
        radius: float, optional
            Distance to 'points at infinity'.
    
    Returns:
        regions: list of lists of int
            Indices of vertices in each revised Voronoi region.
        vertices: ndarray
            Coordinates for revised vertices.
        
    Adapted from: https://gist.github.com/pv/8036995
    """
    new_regions = []
    new_vertices = vor.vertices.tolist()

    center = vor.points.mean(axis=0)
    if radius is None:
        radius = vor.points.ptp().max()*2

    # Map ridge vertices to ridges for each point
    all_ridges = {}
    for (p1, p2), (v1, v2) in zip(vor.ridge_points, vor.ridge_vertices):
        all_ridges.setdefault(p1, []).append((p2, v1, v2))
        all_ridges.setdefault(p2, []).append((p1, v1, v2))

    # Reconstruct each region.
    # The regions will be returned in the same order as vor.points.
    for p1, region_index in enumerate(vor.point_region):
        vertices = vor.regions[region_index]
        if all(v >= 0 for v in vertices):
            new_regions.append(vertices)
            continue

        # Reconstruct a non-finite region.
        ridges = all_ridges[p1]
        new_region = [v for v in vertices if v >= 0]
        for p2, v1, v2 in ridges:
            if v2 < 0:
                v1, v2 = v2, v1
            if v1 >= 0 and v2 >= 0:
                continue

            # Compute the missing endpoint
            t = vor.points[p2] - vor.points[p1]  # tangent
            t /= np.linalg.norm(t)
            n = np.array([-t[1], t[0]])  # normal
            
            midpoint = vor.points[[p1, p2]].mean(axis=0)
            direction = np.sign(np.dot(midpoint - center, n)) * n
            far_point = vor.vertices[v2] + direction * radius

            new_region.append(len(new_vertices))
            new_vertices.append(far_point.tolist())
        # Sort region vertices counterclockwise.
        vs = np.asarray([new_vertices[v] for v in new_region])
        c = vs.mean(axis=0)
        angles = np.arctan2(vs[:,1] - c[1], vs[:,0] - c[0])
        new_region = np.array(new_region)[np.argsort(angles)]
        new_regions.append(new_region.tolist())

    return new_regions, np.asarray(new_vertices)


############################################################
# Town Representation                                      #
############################################################

## The Functions and classes below should be looked over and understood
class Town(object):
    def __init__(self, name, big_frac):
        """
        Creates a Town whose voter counts are randomly sampled around a target split.
        On average, Bigendians make up `big_frac` of voters (and Smallendians = 1 - `big_frac`),
        but the actual counts vary due to random sampling.
        
        Parameters
            name (str): represents name of the Town
            big_frac (float): takes on a value between 0 and 1
        """
        voters_per_town = 188_000
        sigma = voters_per_town/5
        self.name = name

        # 10% of voters are swing voters
        num_swingendians = round(voters_per_town*0.1)
        remaining_voters = voters_per_town - num_swingendians
        self.bigendian = round(random.gauss(remaining_voters*big_frac, sigma))
        self.smallendian = round(random.gauss(remaining_voters*(1-big_frac), sigma))

        swing_big, swing_small = allocate_swingendians_for_town(num_swingendians)
        self.bigendian += swing_big
        self.smallendian += swing_small
        

    def get_name(self):
        """Return this town's name (string)."""
        return self.name
    def get_num_voters(self):
        """Return total voters in this town (integer)."""
        return self.bigendian + self.smallendian
    def get_voters_by_party(self):
        """Return total voters in this town (tuple[int, int])."""
        return (self.bigendian, self.smallendian)
    def get_diff(self):
        """Return the vote margin (Big - Small) (integer)."""
        return self.bigendian - self.smallendian
    def __hash__(self):
        """Hash by name so Towns can be used in sets/dicts."""
        return(hash(self.name))
    def __lt__(self, other):
        """less than ordering by name for sorting."""
        try:
            return int(self.name) < int(other.name)
        except:
            return self.name < other.name
    def __str__(self):
        """readable town name."""
        return self.name


class Graph(object):
    """
    Represents an undirected graph using an adjacency set.
    Each Town maps to the set of neighboring Towns.
    """

    def __init__(self, nodes=()):
        """
        Creates a Graph representation of Lilliput
        
        Parameters
            nodes (set): set of Town objects
        """
        self.node_list = []
        self.name_to_node = {} # Dictionary where key is town name, value is Town object
        for node in nodes:
            self.node_list.append(node)
            self.name_to_node[node.get_name()] = node
        self.nodes = nodes

        # Adjacency list (dict) keys are Town objects, values are sets of Towns 
        # that are directly adjacent (share a border) to the
        self.neighbors = {src: set() for src in self.node_list}

    def get_node(self, name: str):
        """Return the Town with this name (str)."""
        return self.name_to_node[name]
    

    def make_neighbors(self, a, b):
        """Make Towns `a` and `b` neighbors."""
        self.neighbors[a].add(b)
        self.neighbors[b].add(a)


    def has_node(self, node):
        """Return True if the given Town is present in the graph."""
        return node in self.neighbors


    def get_all_nodes(self):
        """Return the list of all Town objects in the graph."""
        return self.node_list


    def get_neighbors(self, node):
        """
        Returns a new list containing the Towns adjacent to `node`.
        Node is a Town object
        """
        return list(self.neighbors[node])


    def print_nodes(self):
        """Print each Town and its (Big, Small) voter counts."""
        for node in self.neighbors.keys():
            print(f'{node}: {node.get_voters_by_party()}')


    def get_num_voters(self):
        """Return the total number of voters across all towns in the graph."""
        return sum(town.get_num_voters() for town in self.node_list)


    def get_subgraph(self, nodes):
        """
        Parameters:
            nodes (iterable): a collection of Town objects.

        Returns the induced subgraph on `nodes`. Only connections where both 
        endpoints are included in `nodes` are kept.
        """
        subgraph = Graph(nodes)
        for node in nodes:
            if node in self.neighbors:
                for dest in self.neighbors[node]:
                    if dest in nodes:
                        subgraph.make_neighbors(node, dest)
        return subgraph


    def __str__(self):
        """Return a readable listing of each town and its neighbors (by name)."""
        vals = []
        for src in self.neighbors:
            entry = src.get_name() + ': '
            for dest in self.neighbors[src]:
                entry += f'{dest.get_name()}, '
            if entry[-2:] != ': ':  # There was at least one neighbor
                vals.append(entry[:-2])
            else:
                vals.append(entry[:-1])
        vals.sort(key=lambda x: int(x.split(':')[0]))
        result = ''
        for v in vals:
            result += v + '\n'
        return result[:-1]


  
def build_town_graph():
    """
    Builds and returns a random map of Lilluput represented both as a Graph and 
    a Voronoi Diagram.  

    Returns:
        (tuple): (town_graph, points, vor)
            - town_graph (Graph): graph represenation of Lilliput
            - points (numpy array): array of coordinates for each town 
            - vor (Voronoi Diagram): Voronoi Diagram represenation of Lilliput
    """
    # Ways to generate different maps
    size_32 = (32, 3, 4, 7)
    size_36 = (36, 3, 6, 8)
    size_40 = (40, 3, 5, 16) 
    size_48 = (48, 3, 6, 1)
    size = size_32 # hard coded default
    big_frac = 0.55
    num_towns, max_neighbors, num_cols, seed = size
    random.seed(seed)
    num_rows = num_towns//num_cols
    points, vor, edges = generate_grid_voronoi(num_cols, num_rows,
                                               max_neighbors, seed)
    names = set([str(edge[0]) for edge in edges])
    nodes = [Town(name, big_frac) for name in names]
    name_to_node = {node.get_name(): node for node in nodes}
    town_graph = Graph(nodes)
    tot_big, tot_small = 0, 0
    for town in town_graph.get_all_nodes():
        big, small = town.get_voters_by_party()
        tot_big += big
        tot_small += small
    print(f'Analysis for {size[0]} precincts')
    big_percent = 100*tot_big/(tot_big + tot_small)
    print(f'For entire state, Bigendian receives {big_percent:.2f}% of votes')
    for src, dest in edges:
        town_graph.make_neighbors(name_to_node[str(src)], name_to_node[str(dest)])
    return town_graph, points, vor


############################################################
# Helper Functions for Plotting                            #
############################################################
 
def plot_graph(graph, districting, title, colors):
    """
    Plots the given graph using networkx and matplotlib.

    Parameters:
        graph (Graph): An instance of the Graph class
        districting (list): Collection of legal, disjoint District objects 
            spanning Lilliput
        title (str): Title for the graph
        colors (list): list of strings, where each string is a color.
    """
        
    G = nx.Graph()

    # Add nodes
    colors = ('blue', 'orange', 'green', 'red', 'purple', 'brown', 'pink',
              'gray', 'olive', 'cyan')
    colors = colors + colors
    node_colors = {}
    for node in graph.get_all_nodes():
        G.add_node(node)
        if districting != None:
            for i in range(len(districting)):
                if node in districting[i].get_towns():
                    node_colors[node] = colors[i]

    # Add edges with weights
    for src in graph.get_all_nodes():
        for dest in graph.get_neighbors(src):
            G.add_edge(src, dest)
    # Position nodes using the Fruchterman-Reingold force-directed algorithm
    pos = nx.spring_layout(G, scale = 3, k = 1.5, iterations = 100)

    # Draw nodes and edges
    colors = [node_colors.get(node, 'skyblue') for node in G.nodes()]
    nx.draw(G, pos, with_labels=True, node_color=colors, node_size=300,
            font_size=12, font_weight='bold')
    edge_labels = nx.get_edge_attributes(G, '')
    nx.draw_networkx_edge_labels(G, pos, edge_labels=edge_labels, font_size=12)
    plt.title(title)
    plt.show()
    

def plot_voronoi_map(points, vor, font_size=16,
                     title='Voronoi Map', colors=None):
    """
    Plot a Voronoi diagram with each region colored the same as its label.
    
    Parameters
        points: Array (or list) of site coordinates.
        vor: Voronoi object from scipy.spatial.Voronoi.
        font_size: Label font size.
        title: Plot title.
        colors: Optional list of colors, one per point/region.
                If None, defaults to white for every region.
    """
    fig, ax = plt.subplots(figsize=(8, 8))
    
    if colors is None:
        colors = ['white' for _ in range(len(points))]
        
    regions, vertices = voronoi_finite_polygons_2d(vor, radius=1000)
    
    # Fill each region with its corresponding color.
    for i, region in enumerate(regions):
        polygon = vertices[region]
        ax.fill(*zip(*polygon), color=colors[i], alpha=0.4, edgecolor='grey')
    
    # Draw the original Voronoi edges in light grey
    voronoi_plot_2d(vor, ax=ax, show_points=False, show_vertices=False,
                    line_colors='grey', line_alpha=0.5, line_width=1)
    

    # Add region labels at the site points.
    for i, (x, y) in enumerate(points):
        ax.text(x, y, str(i), fontsize=font_size, color='k',
                ha='center', va='center')
    
    plt.xticks([])
    plt.yticks([])
    ax.set_aspect('equal')
    ax.set_title(title, size=20)
    plt.tight_layout()
    plt.show()


