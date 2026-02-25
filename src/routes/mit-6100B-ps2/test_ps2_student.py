import unittest
import random
from ps2 import PerfectTrack, GaussianSlowdownTrack, SlowZoneTrack, simulate_trains, analyze_histories
from test_constants import EXPECTED_PERFECTTRACK_1, EXPECTED_PERFECTTRACK_2, \
                            EXPECTED_SLOWZONETRACK, \
                            PERFECTTRACK_MEAN_1, PERFECTTRACK_STD_1, \
                            PERFECTTRACK_MEAN_2, PERFECTTRACK_STD_2, \
                            SLOWZONETRACK_MEAN, SLOWZONETRACK_STD, \
                            GAUSSIANTRACK_MEAN, GAUSSIANTRACK_MEAN_STD, GAUSSIANTRACK_STD, GAUSSIANTRACK_STD_STD

def check_histories_match(expected_results, simulated_histories):
    """
    Args:
        expected_results: list of dictionaries dictionary mapping trains to expected locations
        simulated_histories: the list of histories produced by the student's code

    Asserts that the number of simulations is correct,
        the number of time steps is correct,
        and the trains' locations are correct in the simulated histories.
    """
    # check that the number of histories should match the number of simulations
    assert len(expected_results) == len(simulated_histories), "Number of simulations produced does not match expected number of simulations expected"

    for expected_history, simulated_history in zip(expected_results, simulated_histories):
        for train, expected_locs in expected_history.items():

            simulated_locs = simulated_history.get_train_locs(train)

            # check that the number of time steps in the simulations is correct
            assert len(expected_locs) == len(simulated_locs), "Length of simulated history does not match expected number of time steps"

            # check that the simulated train locations match the expected locations
            assert expected_locs == simulated_locs, f"Simulated locations for train ({train}) do not match expected locations"

class TestPS2(unittest.TestCase):

    def test_1_simulate_trains_perfect_track_1(self):
        num_sims = 1
        num_steps = 50
        max_speed = 0.5
        slow_down_param = None
        simulated_histories, track = simulate_trains(PerfectTrack, num_sims, num_steps, max_speed, slow_down_param, 0)
        check_histories_match(EXPECTED_PERFECTTRACK_1, simulated_histories)

    def test_1_simulate_trains_perfect_track_2(self):
        num_sims = 1
        num_steps = 10
        max_speed = 1
        slow_down_param = None
        simulated_histories, track = simulate_trains(PerfectTrack, num_sims, num_steps, max_speed, slow_down_param, 0)
        check_histories_match(EXPECTED_PERFECTTRACK_2, simulated_histories)

    def test_1_simulate_trains_gaussian_track_sigma_0(self):
        num_sims = 1
        num_steps = 50
        max_speed = 0.5
        slow_down_param = 0
        simulated_histories, track = simulate_trains(GaussianSlowdownTrack, num_sims, num_steps, max_speed, slow_down_param, 0)
        check_histories_match(EXPECTED_PERFECTTRACK_1, simulated_histories)

    def test_1_simulate_trains_slowzone_track_1(self):
        num_sims = 1
        num_steps = 50
        max_speed = 0.5
        slow_down_param = 1
        simulated_histories, track = simulate_trains(SlowZoneTrack, num_sims, num_steps, max_speed, slow_down_param, 0)
        check_histories_match(EXPECTED_PERFECTTRACK_1, simulated_histories)

    def test_1_simulate_trains_slowzone_track_2(self):
        num_sims = 1
        num_steps = 25
        max_speed = 0.5
        slow_down_param = 0.5
        simulated_histories, track = simulate_trains(SlowZoneTrack, num_sims, num_steps, max_speed, slow_down_param, 0)
        check_histories_match(EXPECTED_SLOWZONETRACK, simulated_histories)

    def test_2_analyze_histories_perfect_track_1(self):
        num_sims = 10
        num_steps = 100
        max_speed = 0.5
        slow_down_param = None
        simulated_histories, track = simulate_trains(PerfectTrack, num_sims, num_steps, max_speed, slow_down_param, 0)
        mean, std, all_interarrival_times = analyze_histories(simulated_histories)
        self.assertEqual(mean, PERFECTTRACK_MEAN_1)
        self.assertEqual(std, PERFECTTRACK_STD_1)

    def test_2_analyze_histories_perfect_track_2(self):
        num_sims = 10
        num_steps = 100
        max_speed = 0.25
        slow_down_param = None
        simulated_histories, track = simulate_trains(PerfectTrack, num_sims, num_steps, max_speed, slow_down_param, 0)
        mean, std, all_interarrival_times = analyze_histories(simulated_histories)
        self.assertEqual(mean, PERFECTTRACK_MEAN_2)
        self.assertEqual(std, PERFECTTRACK_STD_2)

    def test_2_analyze_histories_gaussian_track(self):
        num_sims = 100
        num_steps = 1000
        max_speed = 0.5
        slow_down_param = 0.2
        simulated_histories, track = simulate_trains(GaussianSlowdownTrack, num_sims, num_steps, max_speed, slow_down_param, 0)
        mean, std, all_interarrival_times = analyze_histories(simulated_histories)

        # answers should fall within 3 standard deviations, use 4 for some buffer
        mean_lower_bound = GAUSSIANTRACK_MEAN - 4 * GAUSSIANTRACK_MEAN_STD
        mean_upper_bound = GAUSSIANTRACK_MEAN + 4 * GAUSSIANTRACK_MEAN_STD
        std_lower_bound = GAUSSIANTRACK_STD - 4 * GAUSSIANTRACK_STD_STD
        std_upper_bound = GAUSSIANTRACK_STD + 4 * GAUSSIANTRACK_STD_STD
        self.assertTrue(mean_lower_bound <= mean <= mean_upper_bound)
        self.assertTrue(std_lower_bound <= std <= std_upper_bound)

    def test_2_analyze_histories_slowzone_track(self):
        num_sims = 10
        num_steps = 1000
        max_speed = 0.5
        slow_down_param = 0.5
        simulated_histories, track = simulate_trains(SlowZoneTrack, num_sims, num_steps, max_speed, slow_down_param, 0)
        mean, std, all_interarrival_times = analyze_histories(simulated_histories)

        # values should pretty much be exact, some allowance for rounding, etc.
        mean_lower_bound = SLOWZONETRACK_MEAN -  0.001
        mean_upper_bound = SLOWZONETRACK_MEAN +  0.001
        std_lower_bound = SLOWZONETRACK_STD - 0.001
        std_upper_bound = SLOWZONETRACK_STD + 0.001
        self.assertTrue(mean_lower_bound <= mean <= mean_upper_bound)
        self.assertTrue(std_lower_bound <= std <= std_upper_bound)


class Results_600(unittest.TextTestResult):

	# We override the init method so that the Result object
	# can store the score and appropriate test output.
    def __init__(self, *args, **kwargs):
        super(Results_600, self).__init__(*args, **kwargs)
        self.output = []
        self.points = 10

    def addFailure(self, test, err):
        test_name = test._testMethodName
        self.handleDeduction(test_name, failure_messages)
        super(Results_600, self).addFailure(test, err)

    def addError(self, test, err):
        test_name = test._testMethodName
        self.handleDeduction(test_name, error_messages)
        super(Results_600, self).addError(test, err)

    def handleDeduction(self, test_name, messages):
        if test_name in point_values:
            point_value = point_values[test_name]
            message = messages[test_name]
            self.output.append('[-%s]: %s' % (point_value, message))
            self.points -= point_value

    def getOutput(self):
        if len(self.output) == 0:
            return "All correct!"
        return '\n'.join(self.output)

    def getPoints(self):
        return self.points


point_values = {
    "test_1_simulate_trains_perfect_track_1" : 0.5,
    "test_1_simulate_trains_perfect_track_2" : 0.5,
    "test_1_simulate_trains_gaussian_track_sigma_0" : 0.5,
    "test_1_simulate_trains_slowzone_track_1" : 0.5,
    "test_1_simulate_trains_slowzone_track_2" : 0.5,
    "test_2_analyze_histories_perfect_track_1" : 0.5,
    "test_2_analyze_histories_perfect_track_2" : 0.5,
    "test_2_analyze_histories_gaussian_track" : 0.5,
    "test_2_analyze_histories_slowzone_track" : 0.5,
}
# Dictionary mapping function names from the above TestCase class to
# messages you'd like the student to see if their code throws an error.
error_messages = {
    "test_1_simulate_trains_perfect_track_1" : "Your function simulate_trains() produced an error.",
    "test_1_simulate_trains_perfect_track_2" : "Your function simulate_trains() produced an error.",
    "test_1_simulate_trains_gaussian_track_sigma_0" : "Your function simulate_trains() produced an error.",
    "test_1_simulate_trains_slowzone_track_1" : "Your function simulate_trains() produced an error.",
    "test_1_simulate_trains_slowzone_track_2" : "Your function simulate_trains() produced an error.",
    "test_2_analyze_histories_perfect_track_1" : "Your function analyze_histories() produced an error.",
    "test_2_analyze_histories_perfect_track_2" : "Your function analyze_histories() produced an error.",
    "test_2_analyze_histories_gaussian_track" : "Your function analyze_histories() produced an error.",
    "test_2_analyze_histories_slowzone_track" : "Your function analyze_histories() produced an error.",
    }
# Dictionary mapping function names from the above TestCase class to
# messages you'd like the student to see if the test fails.
failure_messages = {
    "test_1_simulate_trains_perfect_track_1" : "Your function simulate_trains() produced incorrect output.",
    "test_1_simulate_trains_perfect_track_2" : "Your function simulate_trains() produced incorrect output.",
    "test_1_simulate_trains_gaussian_track_sigma_0" : "Your function simulate_trains() produced incorrect output.",
    "test_1_simulate_trains_slowzone_track_1" : "Your function simulate_trains() produced incorrect output.",
    "test_1_simulate_trains_slowzone_track_2" : "Your function simulate_trains() produced incorrect output.",
    "test_2_analyze_histories_perfect_track_1" : "Your function analyze_histories() produced incorrect output.",
    "test_2_analyze_histories_perfect_track_2" : "Your function analyze_histories() produced incorrect output.",
    "test_2_analyze_histories_gaussian_track" : "Your function analyze_histories() produced incorrect output.",
    "test_2_analyze_histories_slowzone_track" : "Your function analyze_histories() produced incorrect output.",
    }

if __name__ == "__main__":
    print("Running unit tests")
    suite = unittest.TestSuite()
    suite.addTests(unittest.TestLoader().loadTestsFromTestCase(TestPS2))

    runner = unittest.TextTestRunner(verbosity=2, resultclass=Results_600)
    result = runner.run(suite)

    output = result.getOutput()
    points_earned = round(result.getPoints(), 3)

    print("\n\nProblem Set 2 Unit Test Results:")
    print(output)
