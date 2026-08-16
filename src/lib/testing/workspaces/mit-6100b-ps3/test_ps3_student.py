# test_ps3_student.py
#
# This tester will check for:
#   - Return types / shapes for your functions
#   - Basic correctness of find_shortest_path, compactness, district enumeration, map assembly
#   - Deterministic answers on sample Graph
#
# Files expected in the same folder:
#   ps3.py  (student file)
#   helper.py  (helpers given)
# -----------------------------------------------------------------------------

import io
import unittest
import contextlib
import random

from helper import Town, Graph  

from ps3 import (
    make_lilliput,                    # builds the Lilliput Graph
    allocate_swingendians_for_town,   # PART I
    neighbors_of,                     # PART I (Town in -> list[Town])
    state_summary,                    # PART I
    find_shortest_path,               # PART II
    is_compact_connected_subgraph,    # PART II
    District,                         # PART III
    find_all_possible_districts,      # PART III
    find_disjoint_districts,          # PART III
    eval_choices,                     # PART III
)

###############################################################################
# Ignore these, just helper funcs
###############################################################################

def run_quiet(fn, *args, **kwargs):
    """Calls functions without printed output."""
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        return fn(*args, **kwargs)

def build_lilliput_quiet():
    """Builds graph of Lilliput using make_lilliput."""
    return run_quiet(make_lilliput)

def find_disjoint_or_fail(districts, needed, test_case):
    """
    Catches if students use sys.exit() in find_disjoint_districts and produces an error.
    """
    try:
        return find_disjoint_districts(districts, needed)
    except SystemExit:
        test_case.fail(
            "Your find_disjoint_districts() called sys.exit().\n"
            "Please return an empty list instead."
        )

def assert_valid_district(d):
    assert isinstance(d, District), f"Expected a District object, got {type(d)}."
    towns = d.get_towns()
    assert isinstance(towns, set), "District.get_towns() should return a set of Towns."
    assert all(hasattr(t, 'get_name') and hasattr(t, 'get_voters_by_party') for t in towns), \
        "Towns inside District must support get_name() and get_voters_by_party()."
    big, small = d.get_voters_by_party()
    assert isinstance(big, int) and isinstance(small, int), \
        "District.get_voters_by_party() should return (big:int, small:int)."
    diff = d.get_diff()
    assert isinstance(diff, int), "District.get_diff() should return an int."

def assert_valid_maps(maps, all_nodes, k):
    assert isinstance(maps, list), "find_disjoint_districts() must return a list of maps."
    assert len(maps) >= 1, "Expected at least one valid full map."
    all_towns = set(all_nodes)
    for m in maps:
        assert isinstance(m, list), "Each map must be a list of Districts."
        assert len(m) == len(all_nodes) // k, "Each full map should have N/k districts."
        used = set()
        for d in m:
            assert_valid_district(d)
            towns = d.get_towns()
            assert len(towns) == k, f"Each District in a map must have exactly {k} towns."
            assert used.isdisjoint(towns), "A town appears in more than one District within a map."
            used |= towns
        assert used == all_towns, "A full map must cover all towns exactly once."

###############################################################################
# Part I — Graph basics
###############################################################################

class TestPS3_Part1(unittest.TestCase):

    def test_Part1_allocate_swingendians_deterministic(self):
        voters_per_town = 188_000
        num_swingendians = round(voters_per_town*0.1)

        for mu, sigma, big_exp, small_exp in [(-5,0, 0, 18800), (5,0, 18800, 0)]:
            swing_big, swing_small = allocate_swingendians_for_town(num_swingendians, mu, sigma)
            self.assertEqual(swing_big, big_exp, f"Expected {big_exp} Swing voters to vote for Bigendians, got {swing_big} instead")
            self.assertEqual(swing_small, small_exp, f"Expected {small_exp} Swing voters to vote for Smallendians, got {swing_small} instead")

    def test_Part1_state_summary_returntype(self):
        g, _, _ = build_lilliput_quiet()
        result = run_quiet(state_summary, g)

        self.assertIsInstance(result, tuple, "state_summary must return a 6-tuple.")
        self.assertEqual(
            len(result), 6,
            "state_summary must return (n_towns, total_voters, big_pct, avg_neighbors, most_big, most_small)."
        )

        n_towns, total_voters, big_pct, avg_neighbors, most_big, most_small = result

        self.assertIsInstance(n_towns, int)
        self.assertGreater(n_towns, 0)

        self.assertIsInstance(total_voters, int)
        self.assertGreater(total_voters, 0)

        self.assertIsInstance(big_pct, float)
        self.assertGreaterEqual(big_pct, 0.0)
        self.assertLessEqual(big_pct, 100.0)

        self.assertIsInstance(avg_neighbors, float)
        self.assertGreaterEqual(avg_neighbors, 0.0)

        if most_big is not None:
            self.assertIsInstance(most_big, tuple)
            self.assertEqual(len(most_big), 2)
            self.assertIsInstance(most_big[0], str)
            self.assertIsInstance(most_big[1], int)

        if most_small is not None:
            self.assertIsInstance(most_small, tuple)
            self.assertEqual(len(most_small), 2)
            self.assertIsInstance(most_small[0], str)
            self.assertIsInstance(most_small[1], int)

    def test_Part1_neighbors_types_only(self):
        g, _, _ = build_lilliput_quiet()
        node = g.get_all_nodes()[0]
        nbrs = neighbors_of(g, node)  # Town in

        self.assertIsInstance(nbrs, list, "neighbors_of should return a list of Town objects.")
        self.assertTrue(all(hasattr(t, 'get_name') and hasattr(t, 'get_voters_by_party') for t in nbrs),
                        "neighbors_of should return Town objects (with get_name/get_voters_by_party).")

        valid = set(g.get_all_nodes())
        self.assertTrue(set(nbrs).issubset(valid), "neighbors_of returned Towns not in the graph.")

    def test_Part1_neighbors_numeric_order(self):
        """neighbors_of should be numerically sorted by name (e.g., '2' before '10')."""
        g, _, _ = build_lilliput_quiet()
        any_node = g.get_all_nodes()[0]
        truth = [t.get_name() for t in sorted(g.get_neighbors(any_node))]
        reported_towns = neighbors_of(g, any_node)
        reported = [t.get_name() for t in reported_towns]
        self.assertEqual(reported, truth,
                         "neighbors_of should return neighbor towns sorted numerically.")

###############################################################################
# Part II — Graph analysis
###############################################################################

class TestPS3_Part2(unittest.TestCase):

    def test_Part2_find_shortest_path_returntype(self):
        g, _, _ = build_lilliput_quiet()
        nodes = g.get_all_nodes()
        self.assertTrue(len(nodes) > 0, "Graph appears empty; check construction.")
        src = nodes[0]
        nbrs = g.get_neighbors(src)
        self.assertTrue(len(nbrs) > 0, "First node has no neighbors; check construction.")
        path = find_shortest_path(g, src, nbrs[0])
        self.assertTrue((path is None) or isinstance(path, list),
                        "find_shortest_path should return None or a list (path).")

    def test_Part2_find_shortest_path_exists(self):
        g, _, _ = build_lilliput_quiet()
        nodes = g.get_all_nodes()
        src = nodes[0]
        tgt = g.get_neighbors(src)[0]
        path = find_shortest_path(g, src, tgt)
        self.assertIsInstance(path, list, "Expected a path (list) when target is a neighbor.")
        self.assertGreaterEqual(len(path), 2, "Path should have at least source and target.")
        self.assertEqual(path[0], src)
        self.assertEqual(path[-1], tgt)

    def test_Part2_find_shortest_path_trivial(self):
        g, _, _ = build_lilliput_quiet()
        nodes = g.get_all_nodes()
        src = nodes[0]
        path = find_shortest_path(g, src, src)
        self.assertIsInstance(path, list, "Expected a (trivial) path list when source == target.")
        self.assertEqual(path[0], src)
        self.assertEqual(path[-1], src)

    def test_Part2_compact_connected_returntype(self):
        g, _, _ = build_lilliput_quiet()
        nodes = g.get_all_nodes()
        pick = [nodes[0]]
        for n in g.get_neighbors(nodes[0]):
            pick.append(n)
            if len(pick) == 4:
                break
        while len(pick) < 4:
            for n in nodes:
                if n not in pick:
                    pick.append(n)
                    break
        ans = is_compact_connected_subgraph(g, pick, 3)
        self.assertIsInstance(ans, bool, "is_compact_connected_subgraph() must return a bool.")

    def test_Part2_compact_connected_true(self):
        g, _, _ = build_lilliput_quiet()
        start = g.get_all_nodes()[0]
        pick = [start]
        for n in g.get_neighbors(start):
            pick.append(n)
            if len(pick) == 4:
                break
        self.assertTrue(is_compact_connected_subgraph(g, pick, 3),
                        "Expected this set to be compact + connected with compactness <= 3 towns.")

    def test_Part2_compact_connected_false(self):
        g, _, _ = build_lilliput_quiet()
        nodes = g.get_all_nodes()
        pick = [nodes[i] for i in (0, 5, 10, 15)]
        self.assertFalse(is_compact_connected_subgraph(g, pick, 2),
                         "With compactness=2 towns, this scattered set should not be compact-connected.")

###############################################################################
# Part III — Districts & maps
###############################################################################

class TestPS3_Part3(unittest.TestCase):

    def test_Part3_find_all_districts_returntype(self):
        g, _, _ = build_lilliput_quiet()
        k = 4
        comp = 3
        districts = find_all_possible_districts(g, k, comp)
        self.assertIsInstance(districts, list, "find_all_possible_districts() must return a list.")
        for d in districts:
            assert_valid_district(d)
            self.assertEqual(len(d.get_towns()), k)

    def test_Part3_find_all_districts_nonempty_and_valid(self):
        g, _, _ = build_lilliput_quiet()
        k = 4
        comp = 3
        districts = find_all_possible_districts(g, k, comp)
        self.assertGreater(len(districts), 0, "No legal districts found; expected some.")
        for d in districts:
            assert_valid_district(d)
            self.assertEqual(len(d.get_towns()), k)

    def test_Part3_find_disjoint_districts_returntype(self):
        g, _, _ = build_lilliput_quiet()
        k = 4
        comp = 3
        districts = find_all_possible_districts(g, k, comp)
        maps = find_disjoint_or_fail(districts, len(g.get_all_nodes()) // k, self)
        assert_valid_maps(maps, g.get_all_nodes(), k)

    def test_Part3_find_disjoint_maps_nonempty_and_cover(self):
        g, _, _ = build_lilliput_quiet()
        k = 4
        comp = 3
        districts = find_all_possible_districts(g, k, comp)
        maps = find_disjoint_or_fail(districts, len(g.get_all_nodes()) // k, self)
        assert_valid_maps(maps, g.get_all_nodes(), k)

    def test_Part3_eval_choices_returntype(self):
        g, _, _ = build_lilliput_quiet()
        k = 4
        comp = 3
        districts = find_all_possible_districts(g, k, comp)
        maps = find_disjoint_or_fail(districts, len(g.get_all_nodes()) // k, self)
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            result = eval_choices(g, maps)
        self.assertIsInstance(result, tuple, "eval_choices() must return a tuple.")
        self.assertEqual(len(result), 5,
                         "eval_choices() must return (best_big_map, best_small_map, maybe_tie, best_big_num, best_small_num).")
        best_big, best_small, maybe_tie, best_big_num, best_small_num = result
        self.assertIsInstance(best_big, list)
        self.assertIsInstance(best_small, list)
        self.assertTrue((maybe_tie is None) or isinstance(maybe_tie, list))
        self.assertIsInstance(best_big_num, int)
        self.assertIsInstance(best_small_num, int)

    def test_Part3_eval_choices_shapes(self):
        g, _, _ = build_lilliput_quiet()
        k = 4
        comp = 3
        districts = find_all_possible_districts(g, k, comp)
        maps = find_disjoint_or_fail(districts, len(g.get_all_nodes()) // k, self)
        best_big, best_small, maybe_tie, best_big_num, best_small_num = eval_choices(g, maps)
        self.assertIsInstance(best_big, list)
        self.assertIsInstance(best_small, list)
        self.assertTrue((maybe_tie is None) or isinstance(maybe_tie, list))
        self.assertIsInstance(best_big_num, int)
        self.assertIsInstance(best_small_num, int)
        assert_valid_maps([best_big], g.get_all_nodes(), k)
        assert_valid_maps([best_small], g.get_all_nodes(), k)
        if maybe_tie is not None:
            assert_valid_maps([maybe_tie], g.get_all_nodes(), k)

###############################################################################
# Test Graph made up of a 4x4 grid (16 towns) to test your code on
###############################################################################

def build_test_grid_graph():
    """
    creates a Graph with towns named '0'...'15'.
    """
    random.seed(1008)  # for reproducability
    towns = [Town(str(i), 0.58 if (i % 2 == 0) else 0.42) for i in range(16)]
    g = Graph(towns)

    def idx(r, c): return r * 4 + c
    for r in range(4):
        for c in range(4):
            u = towns[idx(r, c)]
            if r > 0: g.make_neighbors(u, towns[idx(r - 1, c)])  # up
            if c > 0: g.make_neighbors(u, towns[idx(r, c - 1)])  # left
    return g

def names_of(towns_iter):
    """Sorted list of town names (numeric-aware)."""
    return sorted(
        [t.get_name() for t in towns_iter],
        key=lambda s: (0, int(s)) if s.isdigit() else (1, s)
    )

def townset_comp(a_set, b_set):
    """Compare two sets of Towns by name."""
    return {t.get_name() for t in a_set} == {t.get_name() for t in b_set}

class TestPS3_SmallDeterministic(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.g = build_test_grid_graph()
        cls.towns = cls.g.get_all_nodes()
        # 2x2 block districts we expect to be legal (compactness=3)
        name_to_t = {t.get_name(): t for t in cls.towns}
        cls.block_A = {name_to_t['0'],  name_to_t['1'],  name_to_t['4'],  name_to_t['5']}
        cls.block_B = {name_to_t['2'],  name_to_t['3'],  name_to_t['6'],  name_to_t['7']}
        cls.block_C = {name_to_t['8'],  name_to_t['9'],  name_to_t['12'], name_to_t['13']}
        cls.block_D = {name_to_t['10'], name_to_t['11'], name_to_t['14'], name_to_t['15']}
        cls.expected_map_blocks = [cls.block_A, cls.block_B, cls.block_C, cls.block_D]

    # -------- Part I: checks state_summary and neighbors_of  --------

    def test_SmallDet_Part1_neighbors_known_node(self):
        # Node '5' (row=1,col=1) expected neighbors: 1,4,6,9
        t5 = next(t for t in self.towns if t.get_name() == '5')
        nbrs = neighbors_of(self.g, t5)
        self.assertEqual(names_of(nbrs), ['1', '4', '6', '9'])

    def test_SmallDet_Part1_state_summary_shapes(self):
        n_towns, total_voters, big_pct, avg_neighbors, most_big, most_small = state_summary(self.g)
        # Known size
        self.assertEqual(n_towns, 16)
        # Types
        self.assertIsInstance(total_voters, int)
        self.assertIsInstance(big_pct, float)
        self.assertIsInstance(avg_neighbors, float)
        # In a 4x4 grid with 4-neighborhoods:
        # corners: 4 * 2 = 8
        # edges (non-corner): 8 * 3 = 24
        # centers: 4 * 4 = 16
        # sum = 48; average degree = 48 / 16 = 3.0
        self.assertAlmostEqual(avg_neighbors, 3.0, places=6)
        if most_big is not None:
            self.assertIsInstance(most_big, tuple)
            self.assertEqual(len(most_big), 2)
        if most_small is not None:
            self.assertIsInstance(most_small, tuple)
            self.assertEqual(len(most_small), 2)

    # -------- Part II: shortest path & compactness (deterministic grid) --------

    def test_SmallDet_Part2_shortest_path_grid_0_to_15(self):
        # (0,0) -> (3,3) manhattan distance is 6 edges => 7 towns in the path
        t0  = next(t for t in self.towns if t.get_name() == '0')
        t15 = next(t for t in self.towns if t.get_name() == '15')
        path = find_shortest_path(self.g, t0, t15)
        self.assertIsInstance(path, list)
        self.assertEqual(path[0].get_name(), '0')
               # last town should be '15'
        self.assertEqual(path[-1].get_name(), '15')
        # path length should be 7 towns (6 edges)
        self.assertEqual(len(path), 7)

    def test_SmallDet_Part2_compact_connected_examples(self):
        # Legal compact (≤3 towns per shortest path): a 2x2 block
        ok_set = list(self.block_A)
        self.assertTrue(is_compact_connected_subgraph(self.g, ok_set, 3))

        # Illegal compact with K=3: a line of four in a row (max shortest path uses 4 towns)
        # Example: row 0 => '0','1','2','3'
        row0 = [next(t for t in self.towns if t.get_name() == x) for x in ('0', '1', '2', '3')]
        self.assertFalse(is_compact_connected_subgraph(self.g, row0, 3))

    # -------- Part III: districts & maps (deterministic grid) --------

    def test_SmallDet_Part3_find_all_districts_includes_2x2_blocks(self):
        k = 4
        C = 3
        districts = find_all_possible_districts(self.g, k, C)
        self.assertIsInstance(districts, list)
        # Must include our 2x2 blocks
        d_sets = [set(d.get_towns()) for d in districts]
        for block in self.expected_map_blocks:
            self.assertTrue(any(townset_comp(s, block) for s in d_sets),
                            f"Expected 2x2 block {names_of(block)} to be a legal district.")

    def test_SmallDet_Part3_find_disjoint_contains_map(self):
        k = 4
        C = 3
        districts = find_all_possible_districts(self.g, k, C)
        maps = find_disjoint_districts(districts, len(self.towns)//k)
        self.assertIsInstance(maps, list)
        # look for a map comprised exactly of the four 2x2 blocks
        wanted_sets = [set(b) for b in self.expected_map_blocks]
        def map_matches(m):
            m_sets = [set(d.get_towns()) for d in m]
            m_name_sets = [{t.get_name() for t in s} for s in m_sets]
            w_name_sets = [{t.get_name() for t in s} for s in wanted_sets]
            return set(map(frozenset, m_name_sets)) == set(map(frozenset, w_name_sets))
        self.assertTrue(any(map_matches(m) for m in maps),
                        "Expected to find 2x2 blocks map among disjoint maps.")

    def test_SmallDet_Part3_eval_choices_shapes_on_small_graph(self):
        k = 4
        C = 3
        districts = find_all_possible_districts(self.g, k, C)
        maps = find_disjoint_districts(districts, len(self.towns)//k)
        result = eval_choices(self.g, maps)
        self.assertIsInstance(result, tuple)
        self.assertEqual(len(result), 5)
        best_big_map, best_small_map, maybe_tie, best_big_num, best_small_num = result
        # quick structural checks
        self.assertIsInstance(best_big_map, list)
        self.assertIsInstance(best_small_map, list)
        self.assertTrue((maybe_tie is None) or isinstance(maybe_tie, list))
        self.assertIsInstance(best_big_num, int)
        self.assertIsInstance(best_small_num, int)

###############################################################################
# Optional grading metadata
###############################################################################

point_values = {
    # Part 1
    "test_Part1_allocate_swingendians_deterministic": 0.1,
    "test_Part1_state_summary_returntype": 0.1,
    "test_Part1_neighbors_types_only": 0.1,
    "test_Part1_neighbors_numeric_order": 0.1,
    # Part 2
    "test_Part2_find_shortest_path_returntype": 0.1,
    "test_Part2_find_shortest_path_exists": 0.1,
    "test_Part2_find_shortest_path_trivial": 0.1,
    "test_Part2_compact_connected_returntype": 0.1,
    "test_Part2_compact_connected_true": 0.1,
    "test_Part2_compact_connected_false": 0.1,
    # Part 3
    "test_Part3_find_all_districts_returntype": 0.1,
    "test_Part3_find_all_districts_nonempty_and_valid": 0.1,
    "test_Part3_find_disjoint_districts_returntype": 0.1,
    "test_Part3_find_disjoint_maps_nonempty_and_cover": 0.1,
    "test_Part3_eval_choices_returntype": 0.1,
    "test_Part3_eval_choices_shapes": 0.1,
    # Graph test
    "test_SmallDet_Part1_neighbors_known_node": 0.5,
    "test_SmallDet_Part1_state_summary_shapes": 0.5,
    "test_SmallDet_Part2_shortest_path_grid_0_to_15": 1.5,
    "test_SmallDet_Part2_compact_connected_examples": 1.5,
    "test_SmallDet_Part3_find_all_districts_includes_2x2_blocks": 2.0,
    "test_SmallDet_Part3_find_disjoint_contains_map": 2.0,
    "test_SmallDet_Part3_eval_choices_shapes_on_small_graph": 0.5,
}

error_messages = {
    # Part 1
    "test_Part1_allocate_swingendians_deterministic": "Your modifcations to the Town Class __init__ did not properly allocate Swingendans.",
    "test_Part1_state_summary_returntype": "Your state_summary() produced an error or wrong type.",
    "test_Part1_neighbors_types_only": "Your neighbors_of() produced an error or wrong type.",
    "test_Part1_neighbors_numeric_order": "Your neighbors_of() did not return numerically sorted neighbor towns.",
    # Part 2
    "test_Part2_find_shortest_path_returntype": "Your find_shortest_path() produced an error or wrong type.",
    "test_Part2_find_shortest_path_exists": "Your find_shortest_path() failed to find a simple path that should exist.",
    "test_Part2_find_shortest_path_trivial": "Your find_shortest_path() mishandled the trivial source==target case.",
    "test_Part2_compact_connected_returntype": "Your is_compact_connected_subgraph() produced an error or wrong type.",
    "test_Part2_compact_connected_true": "Your compactness/connectedness check rejected a simple valid set.",
    "test_Part2_compact_connected_false": "Your compactness/connectedness check accepted an invalid set.",
    # Part 3
    "test_Part3_find_all_districts_returntype": "Your find_all_possible_districts() produced an error or wrong type.",
    "test_Part3_find_all_districts_nonempty_and_valid": "Your find_all_possible_districts() returned no districts or invalid ones.",
    "test_Part3_find_disjoint_districts_returntype": "Your find_disjoint_districts() produced an error or wrong type.",
    "test_Part3_find_disjoint_maps_nonempty_and_cover": "Your find_disjoint_districts() returned invalid or empty maps.",
    "test_Part3_eval_choices_returntype": "Your eval_choices() produced an error or wrong type.",
    "test_Part3_eval_choices_shapes": "Your eval_choices() returned invalid shapes or maps.",
    # Graph test
    "test_SmallDet_Part1_neighbors_known_node": "neighbors_of() failed on the 4x4 grid known neighbor list.",
    "test_SmallDet_Part1_state_summary_shapes": "state_summary() failed basic shape/avg degree on 4x4 grid.",
    "test_SmallDet_Part2_shortest_path_grid_0_to_15": "find_shortest_path() path length incorrect on 4x4 grid.",
    "test_SmallDet_Part2_compact_connected_examples": "is_compact_connected_subgraph() incorrect on 4x4 grid examples.",
    "test_SmallDet_Part3_find_all_districts_includes_2x2_blocks": "find_all_possible_districts() missing canonical 2x2 blocks.",
    "test_SmallDet_Part3_find_disjoint_contains_map": "find_disjoint_districts() missing canonical 2x2 map.",
    "test_SmallDet_Part3_eval_choices_shapes_on_small_graph": "eval_choices() wrong shape on small grid.",
}

failure_messages = {
    # Part 1
    "test_Part1_allocate_swingendians_deterministic": "Your modifcations to the Town Class __init__ did not properly allocate Swingendans.",
    "test_Part1_state_summary_returntype": "Your state_summary() produced incorrect output.",
    "test_Part1_neighbors_types_only": "Your neighbors_of() produced incorrect output.",
    "test_Part1_neighbors_numeric_order": "Your neighbors_of() list was not numerically sorted.",
    # Part 2
    "test_Part2_find_shortest_path_returntype": "Your find_shortest_path() produced incorrect output.",
    "test_Part2_find_shortest_path_exists": "Your find_shortest_path() failed to find a valid shortest path.",
    "test_Part2_find_shortest_path_trivial": "Your find_shortest_path() should return a valid (trivial) path when source==target.",
    "test_Part2_compact_connected_returntype": "Your is_compact_connected_subgraph() produced incorrect output.",
    "test_Part2_compact_connected_true": "Your is_compact_connected_subgraph() incorrectly returned False for a compact, connected set.",
    "test_Part2_compact_connected_false": "Your is_compact_connected_subgraph() incorrectly returned True for a non-compact or disconnected set.",
    # Part 3
    "test_Part3_find_all_districts_returntype": "Your find_all_possible_districts() produced incorrect output.",
    "test_Part3_find_all_districts_nonempty_and_valid": "Your find_all_possible_districts() returned districts that are invalid or empty.",
    "test_Part3_find_disjoint_districts_returntype": "Your find_disjoint_districts() produced incorrect output.",
    "test_Part3_find_disjoint_maps_nonempty_and_cover": "Your find_disjoint_districts() did not return valid full maps covering all towns exactly once.",
    "test_Part3_eval_choices_returntype": "Your eval_choices() produced incorrect output.",
    "test_Part3_eval_choices_shapes": "Your eval_choices() did not return in the expected shape.",
    # Graph test
    "test_SmallDet_Part1_neighbors_known_node": "neighbors_of() failed on the 4x4 grid known neighbor list.",
    "test_SmallDet_Part1_state_summary_shapes": "state_summary() failed basic shape/avg degree on 4x4 grid.",
    "test_SmallDet_Part2_shortest_path_grid_0_to_15": "find_shortest_path() path length incorrect on 4x4 grid.",
    "test_SmallDet_Part2_compact_connected_examples": "is_compact_connected_subgraph() incorrect on 4x4 grid examples.",
    "test_SmallDet_Part3_find_all_districts_includes_2x2_blocks": "find_all_possible_districts() missing canonical 2x2 blocks.",
    "test_SmallDet_Part3_find_disjoint_contains_map": "find_disjoint_districts() missing canonical 2x2 map.",
    "test_SmallDet_Part3_eval_choices_shapes_on_small_graph": "eval_choices() wrong shape on small grid.",
}

###############################################################################
# Runner
###############################################################################

if __name__ == "__main__":
    suites = []
    suites.append(unittest.TestLoader().loadTestsFromTestCase(TestPS3_Part1))
    suites.append(unittest.TestLoader().loadTestsFromTestCase(TestPS3_Part2))
    suites.append(unittest.TestLoader().loadTestsFromTestCase(TestPS3_Part3))
    suites.append(unittest.TestLoader().loadTestsFromTestCase(TestPS3_SmallDeterministic))  # added
    all_suites = unittest.TestSuite(suites)
    result = unittest.TextTestRunner(verbosity=2).run(all_suites)
