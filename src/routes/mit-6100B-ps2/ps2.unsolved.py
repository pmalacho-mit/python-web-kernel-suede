################################################################################
# 6.100B Spring 2026
# Problem Set 2
# Name:
# Collaborators:
# Time:

import random
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from mbta_helpers import History, produce_animation

# set line width
plt.rcParams['lines.linewidth'] = 4
# set font size for titles
plt.rcParams['axes.titlesize'] = 16
# set font size for labels on axes
plt.rcParams['axes.labelsize'] = 16
# set size of numbers on x-axis
plt.rcParams['xtick.labelsize'] = 12
# set size of numbers on y-axis
plt.rcParams['ytick.labelsize'] = 12
# set size of ticks on x-axis
plt.rcParams['xtick.major.size'] = 7
# set size of ticks on y-axis
plt.rcParams['ytick.major.size'] = 7
# set numpoints for legend
plt.rcParams['legend.numpoints'] = 1
# set marker size
plt.rcParams['lines.markersize'] = 10

############################################################
# Part 1: Track Simulations #
############################################################

# TODO: Modify PerfectTrack so trains stop for two additional time units
# when they reach a stop

class PerfectTrack(object):
    """
    A PerfectTrack is a discrete-time simulation of a one track circular train line
    in which all trains run at maximum speed at all times.
    """
    def __init__(self, max_speed):
        """
        Initializes a PerfectTrack in which all trains run at `max_speed`.

        Args:
            max_speed (float): the maximum speed of the trains in miles/min
        """
        stop_names = ['Alewife', 'Davis', 'Porter', 'Central', 'Kendall-MIT',
                      'Charles-MGH', 'Park']
        train_names = ['Thomas', 'Gordon', 'Emily', 'James', 'Edward',
                       'Percy', 'Henry']
        self.length = 14 # in miles
        self.stop_distance = 2 # stops are 2 miles apart
        self.max_speed = max_speed # miles/min
        self.stops = {} # maps locations to stop names
        self.trains = {} # map trains to location
        self.history = History(train_names)
        self.time = 0
        for i in range(int(self.length/self.stop_distance)):
            stop_loc = i*self.stop_distance
            self.stops[stop_loc] = stop_names[i]
            self.trains[train_names[i]] = stop_loc
            self.history.add_loc(train_names[i], stop_loc)
        self.history.add_stops(self.stops.keys())

    def next_loc(self, loc):
        """
        Args:
            loc (float): a location along the circular track (value between 0 and self.length)
        Returns:
            new_loc (float): the location at the next timestep given the current location `loc`
        """
        new_loc = round(loc + self.max_speed, 2)
        return new_loc % self.length

    def stop_between(self, old_loc, new_loc):
        """
        Args:
            old_loc (float): the previous location
            new_loc (float): the next location
        Returns:
            Returns the stop between the old and new location if there is one, otherwise returns None.
        """
        for stop in self.stops:
            if stop > old_loc and stop <= new_loc:
                return stop
            if new_loc < old_loc:
                if stop >= 0 and stop <= new_loc:
                    return stop
        return None

    def move_train(self, train, time, verbose):
        """
        Moves the train one time step in the simulation.

        Args:
            train (str): the train to move
            time (int): the simulation timestep
            verbose: flag to print outputs
        """
        def ahead_and_too_close(x, y):
            """
            Check for enforcing the trains' minimum distance requirement.
            """
            dist = (y - x) % self.length
            return 0 < dist <= 0.5
        # get location and candidate next location
        old_loc = self.trains[train]
        loc = self.next_loc(old_loc)
        # handle train spacing
        for other_train in self.trains:
            if other_train == train:
                continue
            if ahead_and_too_close(loc, self.trains[other_train]):
                if verbose > 0:
                    print(f'{train} is stuck behind {other_train}')
                loc = old_loc # Don't move train
                self.history.add_loc(train, loc)
                if verbose > 1:
                    print(f'{train} is at location {loc}')
                return
        # handle stops
        if old_loc not in self.stops: # not starting at a stop
            passed_stop = self.stop_between(old_loc, loc)
            if passed_stop != None: # if reaching a stop
                loc = passed_stop # snap to center of stop
                stop = self.stops[loc]
                if verbose > 0:
                    print(f'{train} has arrived at {stop}. Time = {time}')
        self.trains[train] = loc # move train to new loc
        self.history.add_loc(train, loc)
        if verbose > 1:
            print(f'{train} is at location {loc}')

    def move_trains(self, time, verbose):
        """
        Moves all of the trains in the track for one time step.

        Args:
            time (int): the simulation timestep
            verbose: flag to print outputs
        """
        for train in self.trains:
            self.move_train(train, time, verbose)
        self.time += 1
        if verbose > 1:
            print('')

    def get_trains(self):
        """
        Returns a list of all the train names.
        """
        trains = []
        for k in self.trains:
            trains.append(k)
        return trains

    def get_stops(self):
        """
        Returns a list of tuples of (stop name, stop location).
        """
        stops = []
        for k in self.stops:
            stops.append((self.stops[k], k))
        return stops

    def get_history(self):
        """
        Returns the track's history.
        """
        return self.history

    def get_name(self):
        """
        Returns details about the type and speed of track.
        """
        return f'Consistent Speed Track\nSpeed = {60*self.max_speed} MPH'

    def __str__(self):
        output = ''
        for t in self.trains:
            output += f'Train {t} is at location {self.trains[t]}\n'
        return output

class GaussianSlowdownTrack(PerfectTrack):
    """
    A GaussianSlowdownTrack is a discrete-time simulation of a one track circular train line
    in which trains are slowed down at each step by the absolute value of a Gaussian with a
    mean of 0 and a standard deviation of `sigma`.
    """
    def __init__(self, max_speed, sigma):
        raise NotImplementedError  # TODO: delete this line and replace with your code here

class SlowZoneTrack(PerfectTrack):
    """
    A SlowZoneTrack is a discrete-time simulation of a one track circular train line
    in which trains move `slow_zone_factor` times slower in the slow zone (between the Charles-MGH
    and Park Street stops).
    """
    def __init__(self, max_speed, slow_zone_factor):
        raise NotImplementedError  # TODO: delete this line and replace with your code here

def simulate_trains(track_type, num_sims, num_steps, max_speed, slow_down_param, verbose):
    """
    Runs `num_sims` simulations of a track of `track_type` (PerfectTrack, GaussianSlowdownTrack, or
    SlowZoneTrack) that has maximum speed `max_speed` and a `slow_down_param` value, if applicable.
    Each simulation runs for `num_steps` time steps.
    Returns the list of histories from each simulation and the track used.

    Args:
        track_type: the track's object type (i.e., PerfectTrack, GaussianSlowdownTrack, or SlowZoneTrack)
        num_sims (int): the number of simulations
        num_steps (int): the number of time steps per simulation
        max_speed (float): the maximum speed in the track
        slow_down_param (float): None for a PerfectTrack,
                the sigma value for a GaussianSlowdownTrack,
                or the slow_zone_factor for a SlowZoneTrack
        verbose: flag to print outputs

    Returns:
        a tuple (histories, track)
            histories: list of histories
            track: any of the track instances used when generating the histories
    """
    raise NotImplementedError  # TODO: delete this line and replace with your code here

############################################################
# Part 2: Plotting #
############################################################

############## DO NOT MODIFY THESE FUNCTIONS ###############

def label_plot(title, x_label, y_label, legend = False):
    """
    Labels the plot with the specified title and axes labels.
    """
    plt.title(title)
    plt.xlabel(x_label)
    plt.ylabel(y_label)
    if legend:
        plt.legend()

def plot_distributions(track_type, histories, max_speed, slow_down_param, alpha):
    """
    Creates a histogram showing the distribution of interarrival times.

    Args:
        track_type: the track's object type (i.e. PerfectTrack, GaussianSlowdownTrack, or SlowZoneTrack)
        histories (list): list of histories
        max_speed (float): the maximum speed in the track
        slow_down_param (float): None for a PerfectTrack,
                the sigma value for a GaussianSlowdownTrack,
                or the slow_zone_factor for a SlowZoneTrack
        alpha (float): value between 0-1, controls the transparency of the histogram bars
    """
    mean_wait, std, wait_times = analyze_histories(histories)
    vals, bins = np.histogram(wait_times, bins = 10)
    total = sum(vals)
    percentages = (vals / total) * 100
    filtered_percents = percentages[percentages > 0.25]
    filtered_bins = bins[1:][percentages > 0.25]
    if track_type == GaussianSlowdownTrack:
        plt.bar(filtered_bins, filtered_percents, alpha = alpha,
                label = f'With max speed = {60*max_speed:.2f} MPH\n' +
                        f'std slowdown = {60*slow_down_param:.2f} MPH\n' +
                        f'mean inter-arrival time = {mean_wait:.2f} min.')
    elif track_type == SlowZoneTrack:
        plt.bar(filtered_bins, filtered_percents, alpha = alpha,
                label = f'With speed = {60*max_speed:.2f} MPH\n' +
                        f'Slow zone factor = {slow_down_param}\n' +
                        f'mean inter-arrival time = {mean_wait:.2f} min.')
    elif track_type == PerfectTrack:
        plt.bar(filtered_bins, filtered_percents, alpha = alpha,
                label = f'With fixed speed = {60*max_speed:.2f} MPH\n' +
                        f'mean inter-arrival time = {mean_wait:.2f} min.')
    label_plot('Observed Time Between Trains', 'Minutes',
              'Percentage of Arrivals', True)
############################################################


##################### YOUR CODE BELOW ######################

def analyze_histories(histories):
    """
    Given a list of histories, computes the mean and standard deviation of all the interarrival times
    from those histories.

    Args:
        histories (list): list of histories
    Returns:
        a tuple (mean, std, all_interarrival_times)
            mean: the average interarrival time across all the histories in histories
            std: the standard deviation of interarrival times across all the histories in histories
            all_interarrival_times: a list of all interarrival times from all the histories in histories
    """
    raise NotImplementedError  # TODO: delete this line and replace with your code here

# PLOTTING CODE: You may define any helper functions above and
# place any plotting or testing code in the if __name__ == "__main___" block below.

if __name__ == "__main__":
    pass

    ## Feel free to uncomment and modify the below example for PerfectTrack to visualize your code
    # num_sims = 32
    # num_steps = 500
    # max_speed = 0.5

    # p_histories, p_track = simulate_trains(PerfectTrack, num_sims, num_steps, max_speed, None, 0)

    # frame_rate = 4 # frames/second
    # ani = produce_animation(p_histories[0], p_track)
    # ani.save('constant-speed.mp4', writer = 'ffmpeg', fps = frame_rate)
