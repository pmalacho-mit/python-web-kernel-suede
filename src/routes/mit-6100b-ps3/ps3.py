################################################################################
# 6.100B Fall 2025
# Problem Set 3 — Modeling Gerrymandering using Graphs (Lilliput)
# Name:
# Collaborators:
# Time:
################################################################################


################################################################################
# READ ME:
# - This file is your WORKING SKELETON. Fill what's necessary for each function.
# - Do NOT rename this file or change function signatures / docstrings.
# - You may not import additional libraries beyond the ones already here.
# - You should NOT modify the helper module (helper.py) that we provide.
################################################################################

from collections import deque
import matplotlib.pyplot as plt
import networkx as nx
import random
import helper

from helper import build_town_graph, plot_graph, plot_voronoi_map


################################################################################
# Part I — Model Lilliput as a Graph
################################################################################

def make_lilliput():
    """
    Builds a Graph representation of Lilliput by calling the build_town_graph()
    from helper.py.
        
    Returns:
        g (Graph): Graph instance of Lilliput
        points: (optional) locations for Voronoi plotting
        vor: (optional) Voronoi object for plotting
   
    """
    pass

def allocate_swingendians_for_town(num_swingendians, swing_mean = -1, swing_sd = 1):
    """
    Allocate swing voters to Bigendians or Smallendians for a town
    
    Parameters:
        num_swingendians (int): Number of Swingendians in the town
        swing_mean (int): mean of Gaussian distribution to draw from to determine 
            how Swingendian will vote.
        swing_sd (int): sd of Gaussian distribution to draw from to determine 
            how Swingendian will vote.

    Returns:
        (tuple) (swing_big, swing_small) where:
        - swing_big (int): number of Swingendians that vote for Bigendians
        - swing_small (int): number of Swingendians that vote for Smallendians
    """
    pass


### DO NOT REMOVE THIS LINE ###    
helper.allocate_swingendians_for_town = allocate_swingendians_for_town
###############################

def state_summary(g):
    """
    Summarizes information about the Lilliput graph.
    
    Parameters:
      g (Graph): the graph representation of Lilliput
    
    Returns:
        tuple of six statistics, where the statistics are in order:
            - n_towns (int): number of towns in the Lilliput graph
            - total_voters (int): total number of voters in Lilliput graph
            - big_pct (float): percent of voters who are Bigendian. Value should
                be in the range [0, 100].
            - avg_neighbors (float): the average number of neighbors per town
            - most_big (tuple): the town with the highest margin of Bigendian 
                voters. Represented by (town_name, margin),w here margin = 
                Bigendian voters - Smallendian voters.
            - most_small (tuple): the town with the highest margin of Smallendian
                voters. Represented by (town_name, margin), where margin = 
                Bigendian voters - Smallendian voters.
    """
    pass


def neighbors_of(g, town):
    """
    Finds all the towns that neighbor a particular town. Returns a sorted list 
    of Town objects.
    
    Parameters:
        g (Graph): the graph representation of Lilliput
        town (Town): Town object contained within g
        
    Returns
        list: collection of neighboring Town objects that are sorted by the numeric 
            value of the integer town name (e.g. town '2' comes before town '10').
    """
    pass


################################################################################
# Part II — ENFORCE DISTRICT CONSTRAINTS with GRAPH ALGORITHMS
################################################################################

def find_shortest_path(g, source, target):
    """
    Finds the shortest path between a `source` town and a `target` town.
    
    Inputs:
        g (Graph): the graph representation of Lilliput
        source (Town): starting Town object
        target (Town): target Town object

    Returns:
        list: all Town objects between source to target (including both source
            and target) if a shortest path exists. 
            If no path exists, returns None.
    """
    pass


def is_compact_connected_subgraph(g, node_set, compactness):
    """
    Determines if a set of towns can qualify to be a legal district based off 
    the connectivity and compactness constraints.
    
    Parameters:
        g (Graph): the graph representation of Towns
        node_set (iterable) : a collection of Town objects to be tested for legal-districthood.
        compactness (int): maximum allowed shortest path length within a district. 
            Path length is defined as the number of towns.
                   
    Returns:
        bool:
            True if all towns within this 'node_set' are connected AND if
                for every pair of towns (A, B) within 'node_set', the shortest path
                between them has length <= compactness.
            False otherwise.
    """
    pass


################################################################################
# Part III — CONSTRUCT LEGAL DISTRICTS & EVALUATE MAPS
################################################################################

class District(object):
    """
    Represents a set of towns that have already met the legality constraints and 
    requirements. The class keeps track of useful properties.
    
    Define the __init__ of this class with the following attributes:
        self.towns (set): set of Town objects in this district
        self.first_town (Town): The town with the lowest value name (e.g. town 
            '2' has a lower value name than town '10', etc)
        self.big (int): total Bigendian votes across all towns in this district
        self.small (int): total Smallendian votes across all towns in this district
        self.diff (int): self.big - self.small
    """
    def __init__(self, town_list):
        """
        Initialize a District Object
        town_list (list): list of Town objects
        """
        pass

    def get_towns(self):
        return self.towns

    def get_voters_by_party(self):
        return (self.big, self.small)

    def get_diff(self):
        return self.diff

    def __lt__(self, other):
        return self.first_town < other.first_town

    def __str__(self):
        towns = ''
        for town in sorted(self.towns):
            towns += town.get_name() + ','
        return (f'{towns[:-1]}. ' +
                f'Votes for Big - votes for Small = {self.diff:,}')


def find_all_possible_districts(g, k, compactness):
    """
    Enumerates every possible size-k group of towns and keeps 
    only those that would constitute a legal district. In this pset, we specify that k = 4.
    
    Parameters:
        g (Graph): graph representation of Towns
        k (int): the required number of towns per district 
        compactness (int): The maximum allowed path length between any
            two towns inside a district.     

    Returns:
        (list): collection of legal District objects
    """
    pass


def find_disjoint_districts(district_list, num_districts):
    """
    Enumerates all full maps (lists of Districts) such that:
        - each map has exactly `num_districts` districts
        - districts in a map are disjoint (no shared Towns)
        - every town appears in a District exactly once
    
    Parameters:
        district_list (list): list of District objects
        num_districts (int): total number of districts required for a valid map

    Returns: 
        (list): A collection of full maps such that each element (map) is:
            - A list of Districts of length num_districts
            - Disjoint (districts have no overlap of towns)
            - All towns are taken into account
    """
    # Make sure the line below is the first in your function.
    district_list = sorted(district_list)
    
    # Your code here
    pass


def eval_choices(g, possible_choices):
    """
    Examines a list of valid maps (list of District objects) and evaluates them regarding which party
    benefits from which map
    
    Parameters:
        g (Graph): graph representation of Lilliput
        possible_choices (list): a list of valid maps. Since each map is a list of District objects,
            this is a list of a list of Districts where each inner list is one possible map.


    Returns:
        tuple: (best_big_map, best_small_map, maybe_tie, best_big_num, best_small_num)
        - best_big_map (list): map that maximizes Bigendians's district wins
        - best_small_map (list): map that maximizes Smallendians's district wins
        - maybe_tie (list): any map where there is a tie if one occurs; otherwise None.
        - best_big_num (int): number of districts bigendians would win in best_big_map
        - best_small_num (int): number of districts smallendians would win in best_small_map
    """
    pass

################################################################################
# Uncomment the code below to run your functions locally
################################################################################

if __name__ == "__main__":
    pass
    ## 1) Build the Lilliput graph
    # g, points, vor = make_lilliput()

    ## 2) Explore graph
    ## Example: get a Town by name string, then list its neighbors (as Towns)
    # t12 = g.get_node("12")
    # nbrs = neighbors_of(g, t12)
    # print("Neighbors of '12':", [t.get_name() for t in nbrs])

    ## 3) Concise printout of state_summary()
    # print(f"Number of towns: {n_towns}")
    # print(f"Total voters statewide: {total_voters:,}")
    # print(f"For entire state, Bigendian receives {big_pct:.2f}% of votes")
    # print(f"Average bordering towns per town: {avg_neighbors:.2f}")
    # if most_big is not None:
    #     print(f"Most Big-leaning town: {most_big[0]} (margin +{most_big[1]:,})")
    # if most_small is not None:
    #     print(f"Most Small-leaning town: {most_small[0]} (margin {most_small[1]:,})")

    ## 4) Run full pipeline (example values)
    # k = 4
    # compactness = 3
    # districts = find_all_possible_districts(g, k, compactness)
    # print("Number of possible districts =", len(districts))
    # maps = find_disjoint_districts(districts, len(g.get_all_nodes()) // k)
    # print("Number of possible combinations of districts =", f"{len(maps):,}")
    # (best_big_map, best_small_map, maybe_tie, best_big_num, best_small_num) = eval_choices(g, maps)

    ## Example plots:
    # plot_graph(g, None, "Connectivity of Towns", None)
