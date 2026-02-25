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
# set numpoints for legend``
plt.rcParams['legend.numpoints'] = 1
# set marker size
plt.rcParams['lines.markersize'] = 10

############################################################
# Part 1: Track Simulations #
############################################################

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
            dist = (y - x) % self.length
            return 0 < dist <= 0.5
        old_loc = self.trains[train]
        loc = self.next_loc(old_loc)
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
        if old_loc not in self.stops: # not starting at a stop
            passed_stop = self.stop_between(old_loc, loc)
            if passed_stop != None: # if reaching a stop
                loc = passed_stop # snap to center of stop
                stop = self.stops[loc]
                if verbose > 0:
                    print(f'{train} has arrived at {stop}. Time = {time}')
        else: #starting at a stop
            # check if it has been there for last 2 time steps, -1 is where it is currently
            try:
                if self.get_history().get_train_locs(train)[-3] != old_loc or self.get_history().get_train_locs(train)[-2] != old_loc:
                    loc = old_loc
            except:
                pass #History doesn't exist that far yet
            # check try and except later

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
        super().__init__(max_speed)
        self.sigma = sigma

    def next_loc(self, loc):
        slowdown = random.gauss(0, self.sigma)
        speed = max(self.max_speed - abs(slowdown), 0)
        new_loc = round(loc + speed, 2)
        return new_loc % self.length
    
    def get_name(self):
        return f'Gaussian Slowdown Track\nSpeed = {60*self.max_speed} MPH \nSigma = {self.sigma}'

class SlowZoneTrack(PerfectTrack):
    """
    A SlowZoneTrack is a discrete-time simulation of a one track circular train line
    in which trains move `slow_zone_factor` times slower in the slow zone (between the Charles-MGH
    and Park Street stops).
    """
    def __init__(self, max_speed, slow_zone_factor):
        super().__init__(max_speed)
        self.slow_zone_factor = slow_zone_factor

    def next_loc(self, loc):
        #if in slowzone
        if 10 <= loc < 12: #10 is mgh, 12 is park
            speed = self.max_speed * self.slow_zone_factor
        else:
            speed = self.max_speed
        new_loc = round(speed + loc, 2)
        return new_loc % self.length
    
    def get_name(self):
        return f'SlowZone Track\nSpeed = {60*self.max_speed} MPH \nSlowzone Facotr = {self.slow_zone_factor}'

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
    track = None
    histories = []
    for _ in range(num_sims):
        if track_type == PerfectTrack:
            track = PerfectTrack(max_speed)
        elif track_type == GaussianSlowdownTrack:
            track = GaussianSlowdownTrack(max_speed, slow_down_param)
        else:
            track = SlowZoneTrack(max_speed, slow_down_param)
        for t in range(num_steps):
            track.move_trains(t, verbose)
        histories.append(track.get_history())
    return histories, track

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

def get_interarrival_time_of_stop(history, stop):
    stop_arrivals = []
    stop_interarrival_times = []
    #can also do histor.get_train_locs()
    for train, locs in history.history.items():
        for t in range(1, len(locs)):
            if locs[t] == stop and locs[t-1] != stop: #get time of first arrival
                stop_arrivals.append(t)
    stop_arrivals.sort()
    for t in range(1, len(stop_arrivals)):
        stop_interarrival_times.append(stop_arrivals[t] - stop_arrivals[t-1])
    return stop_interarrival_times

def get_interarrival_time_history(history):
    history_interarrival_times = []
    for stop in history.get_stop_locs():
        history_interarrival_times += get_interarrival_time_of_stop(history, stop) #don't use append or else list of lists
    return history_interarrival_times

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
    all_interarrival_times = []
    for history in histories:
        all_interarrival_times += get_interarrival_time_history(history)
    
    return (np.mean(all_interarrival_times), np.std(all_interarrival_times), all_interarrival_times)

def make_plots(slow_down_param, metric):
    """
    Docstring for make_plots
    
    :param slow_down_param: string sigma or slow_zone_factor
    :param histories: list of histories
    :metric: string mean, std
    """
    num_sims = 32
    num_steps = 500
    max_speed = .5 # this is miles/min #20 MPH

    slow_down_list = None
    if slow_down_param == "slow_zone_factor":
        slow_down_list = np.arange(.2, 1.2, .2)
        track_type = SlowZoneTrack
    else:
        slow_down_list = np.arange(0.05, 25.05/60, 3/60) #0 to 25 mph convert to miles per minute
        track_type = GaussianSlowdownTrack
    metric_list = []
    for slow_param in slow_down_list:
        histories, track = simulate_trains(track_type, num_sims, num_steps, max_speed, slow_param, 0)
        mean, std, all_interarrival_times = analyze_histories(histories)
        if metric == "Mean":
            metric_list.append(mean)
        else:
            metric_list.append(std)
    plt.plot(slow_down_list, metric_list)
    label_plot(f"{metric} of Interarrival Times vs {slow_down_param} \n Max Speed = 30 MPH, # Simulations = 32", slow_down_param, "minutes")

if __name__ == "__main__":    
    num_sims = 10
    num_steps = 500
    max_speed = 0.5

    p_histories, p_track = simulate_trains(PerfectTrack, num_sims, num_steps, max_speed, None, 0)

    frame_rate = 4 # frames/second
    ani = produce_animation(p_histories[0], p_track)
    ani.save("animation.gif", writer="pillow", fps=frame_rate)
    print("done")


