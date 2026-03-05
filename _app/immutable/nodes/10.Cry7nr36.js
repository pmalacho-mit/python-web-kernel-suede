import"../chunks/DAlV-aIX.js";import"../chunks/C98jonRY.js";import{g as t,G as s}from"../chunks/B8JPCewl.js";import{C as a}from"../chunks/BdBRdtDO.js";const i=`import random
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.animation as animation

############################################################
# Helper Code #
############################################################

# DO NOT modify the following code

class History(object):
    """
    History of a track.
    """
    def __init__(self, trains):
        """
        Initalizes a History object, which stores the trains and
        their locations at different time steps.

        Args:
            trains: names of the trains in the track system
        """
        self.trains = trains
        self.history = {}
        for train in trains:
            self.history[train] = []

    def add_stops(self, stop_locs):
        """
        Stores the provided stop locations.

        Args:
            stop_locs: stop locations
        """
        self.stop_locs = stop_locs

    def add_loc(self, train, loc):
        """
        Adds the location to the train's history.

        Args:
            train: name of the train whose history is to be updated
            loc: the location to add to the history
        """
        self.history[train].append(loc)

    def get_train_locs(self, train):
        """
        Args:
            train: name of the train
        Returns:
            a copy of the train's history as a list.
        """
        return self.history[train][:]

    def get_trains(self):
        """
        Returns:
            a copy of the train names as a list.
        """
        return self.trains[:]

    def get_stop_locs(self):
        """
        Returns:
            the stored stop locations
        """
        return self.stop_locs

    def __str__(self):
        return str(self.history)

def produce_animation(history, track_used):
    """
    Produces an animation using the provided history for the track.

    Args:
        history: a history for a track
        track_used: instance of PerfectTrack, GaussianSlowdownTrack, or HaltingTrack the history is generated from
    Returns:
        ani: the animation produced
    """
    radius = 10
    colors = ('b', 'r', 'g', 'k', 'y', 'c', 'm')
    train_names = ['Thomas', 'Gordon', 'Emily', 'James', 'Edward', 'Percy',
                   'Henry']
    stop_names = ['Alewife', 'Davis', 'Porter', 'Central', 'Kendall-MIT',
                  'Charles-MGH', 'Park']
    interval = 250  # milliseconds between frames

    # Initialize figure and axis
    fig, ax = plt.subplots()
    ax.set_aspect('equal')
    ax.set_xlim(-radius - 1, radius + 1)
    ax.set_ylim(-radius - 1, radius + 1)
    ax.axis('off')

    # Draw the circular track
    track = plt.Circle((0, 0), radius, fill=False, color='black', linewidth=2)
    ax.add_artist(track)

    # Stop names and their mile positions
    stop_names = ['Alewife', 'Davis', 'Porter', 'Central', 'Kendall\\nMIT',
                  'Charles\\nMGH', 'Park']
    stop_miles = [i * 2 for i in range(len(stop_names))]

    # Add stop labels around the track
    for stop_name, mile in zip(stop_names, stop_miles):
        angle = 2 * np.pi * mile / 14 # 14 is length of track
        label_radius = radius + 1.3  # slightly outside the circle
        x, y = label_radius * np.cos(angle), label_radius * np.sin(angle)
        ax.text(x, y, stop_name, ha='center', va='center', fontsize=9,
                fontweight='bold')

    # Initialize train markers
    angles = np.linspace(0, 2 * np.pi, len(train_names), endpoint=False)
    trains = []
    for angle, color in zip(angles, colors):
        x, y = radius * np.cos(angle), radius * np.sin(angle)
        train, = ax.plot(x, y, 'o', color=color, markersize=10)
        trains.append(train)

    # Initialize train name labels
    train_labels = []
    for angle, name in zip(angles, train_names):
        x, y = radius * np.cos(angle), radius * np.sin(angle)
        label = ax.text(x, y, name, ha='center', va='bottom', fontsize=8)
        train_labels.append(label)

    def update(frame):
        def convert_to_radians(loc):
            return (2 * np.pi / 14) * loc

        for i, (train, label) in enumerate(zip(trains, train_labels)):
            if frame < len(history_list[i]):
                angle = convert_to_radians(history_list[i][frame])
                x, y = radius * np.cos(angle), radius * np.sin(angle)
                train.set_data([x], [y])
                label.set_position((x, y + 0.5)) # Position label slightly above
        return trains + train_labels

    # Create the animation
    history_list = []
    for train in train_names:
        history_list.append(history.get_train_locs(train))

    ani = animation.FuncAnimation(fig, update,
                                  frames = len(history.get_train_locs(train)),
                                  interval=interval, blit=True)

    ax.set_title(f'{track_used.get_name()}\\n', fontsize=18)
    plt.show()
    return ani`,r=`################################################################################
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
# set numpoints for legend\`\`
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
        Initializes a PerfectTrack in which all trains run at \`max_speed\`.

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
            new_loc (float): the location at the next timestep given the current location \`loc\`
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
        return f'Consistent Speed Track\\nSpeed = {60*self.max_speed} MPH'

    def __str__(self):
        output = ''
        for t in self.trains:
            output += f'Train {t} is at location {self.trains[t]}\\n'
        return output

class GaussianSlowdownTrack(PerfectTrack):
    """
    A GaussianSlowdownTrack is a discrete-time simulation of a one track circular train line
    in which trains are slowed down at each step by the absolute value of a Gaussian with a
    mean of 0 and a standard deviation of \`sigma\`.
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
        return f'Gaussian Slowdown Track\\nSpeed = {60*self.max_speed} MPH \\nSigma = {self.sigma}'

class SlowZoneTrack(PerfectTrack):
    """
    A SlowZoneTrack is a discrete-time simulation of a one track circular train line
    in which trains move \`slow_zone_factor\` times slower in the slow zone (between the Charles-MGH
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
        return f'SlowZone Track\\nSpeed = {60*self.max_speed} MPH \\nSlowzone Facotr = {self.slow_zone_factor}'

def simulate_trains(track_type, num_sims, num_steps, max_speed, slow_down_param, verbose):
    """
    Runs \`num_sims\` simulations of a track of \`track_type\` (PerfectTrack, GaussianSlowdownTrack, or
    SlowZoneTrack) that has maximum speed \`max_speed\` and a \`slow_down_param\` value, if applicable.
    Each simulation runs for \`num_steps\` time steps.
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
                label = f'With max speed = {60*max_speed:.2f} MPH\\n' +
                        f'std slowdown = {60*slow_down_param:.2f} MPH\\n' +
                        f'mean inter-arrival time = {mean_wait:.2f} min.')
    elif track_type == SlowZoneTrack:
        plt.bar(filtered_bins, filtered_percents, alpha = alpha,
                label = f'With speed = {60*max_speed:.2f} MPH\\n' +
                        f'Slow zone factor = {slow_down_param}\\n' +
                        f'mean inter-arrival time = {mean_wait:.2f} min.')
    elif track_type == PerfectTrack:
        plt.bar(filtered_bins, filtered_percents, alpha = alpha,
                label = f'With fixed speed = {60*max_speed:.2f} MPH\\n' +
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
    label_plot(f"{metric} of Interarrival Times vs {slow_down_param} \\n Max Speed = 30 MPH, # Simulations = 32", slow_down_param, "minutes")

if __name__ == "__main__":    
    num_sims = 10
    num_steps = 500
    max_speed = 0.5

    p_histories, p_track = simulate_trains(PerfectTrack, num_sims, num_steps, max_speed, None, 0)

    frame_rate = 4 # frames/second
    ani = produce_animation(p_histories[0], p_track)
    ani.save("animation.gif", writer="pillow", fps=frame_rate)
    print("done")`,o=`################################################################################
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
        Initializes a PerfectTrack in which all trains run at \`max_speed\`.

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
            new_loc (float): the location at the next timestep given the current location \`loc\`
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
        return f'Consistent Speed Track\\nSpeed = {60*self.max_speed} MPH'

    def __str__(self):
        output = ''
        for t in self.trains:
            output += f'Train {t} is at location {self.trains[t]}\\n'
        return output

class GaussianSlowdownTrack(PerfectTrack):
    """
    A GaussianSlowdownTrack is a discrete-time simulation of a one track circular train line
    in which trains are slowed down at each step by the absolute value of a Gaussian with a
    mean of 0 and a standard deviation of \`sigma\`.
    """
    def __init__(self, max_speed, sigma):
        raise NotImplementedError  # TODO: delete this line and replace with your code here

class SlowZoneTrack(PerfectTrack):
    """
    A SlowZoneTrack is a discrete-time simulation of a one track circular train line
    in which trains move \`slow_zone_factor\` times slower in the slow zone (between the Charles-MGH
    and Park Street stops).
    """
    def __init__(self, max_speed, slow_zone_factor):
        raise NotImplementedError  # TODO: delete this line and replace with your code here

def simulate_trains(track_type, num_sims, num_steps, max_speed, slow_down_param, verbose):
    """
    Runs \`num_sims\` simulations of a track of \`track_type\` (PerfectTrack, GaussianSlowdownTrack, or
    SlowZoneTrack) that has maximum speed \`max_speed\` and a \`slow_down_param\` value, if applicable.
    Each simulation runs for \`num_steps\` time steps.
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
                label = f'With max speed = {60*max_speed:.2f} MPH\\n' +
                        f'std slowdown = {60*slow_down_param:.2f} MPH\\n' +
                        f'mean inter-arrival time = {mean_wait:.2f} min.')
    elif track_type == SlowZoneTrack:
        plt.bar(filtered_bins, filtered_percents, alpha = alpha,
                label = f'With speed = {60*max_speed:.2f} MPH\\n' +
                        f'Slow zone factor = {slow_down_param}\\n' +
                        f'mean inter-arrival time = {mean_wait:.2f} min.')
    elif track_type == PerfectTrack:
        plt.bar(filtered_bins, filtered_percents, alpha = alpha,
                label = f'With fixed speed = {60*max_speed:.2f} MPH\\n' +
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
    # ani.save('constant-speed.mp4', writer = 'ffmpeg', fps = frame_rate)`,l=`EXPECTED_PERFECTTRACK_1 = [{
    'Thomas': [0, 0.5, 1.0, 1.5, 2, 2, 2, 2.5, 3.0, 3.5, 4, 4, 4, 4.5, 5.0, 5.5, 6, 6, 6, 6.5, 7.0, 7.5, 8, 8, 8, 8.5, 9.0, 9.5, 10, 10, 10, 10.5, 11.0, 11.5, 12, 12, 12, 12.5, 13.0, 13.5, 0, 0, 0, 0.5, 1.0, 1.5, 2, 2, 2, 2.5, 3.0],
    'Gordon': [2, 2.5, 3.0, 3.5, 4, 4, 4, 4.5, 5.0, 5.5, 6, 6, 6, 6.5, 7.0, 7.5, 8, 8, 8, 8.5, 9.0, 9.5, 10, 10, 10, 10.5, 11.0, 11.5, 12, 12, 12, 12.5, 13.0, 13.5, 0, 0, 0, 0.5, 1.0, 1.5, 2, 2, 2, 2.5, 3.0, 3.5, 4, 4, 4, 4.5, 5.0],
    'Emily': [4, 4.5, 5.0, 5.5, 6, 6, 6, 6.5, 7.0, 7.5, 8, 8, 8, 8.5, 9.0, 9.5, 10, 10, 10, 10.5, 11.0, 11.5, 12, 12, 12, 12.5, 13.0, 13.5, 0, 0, 0, 0.5, 1.0, 1.5, 2, 2, 2, 2.5, 3.0, 3.5, 4, 4, 4, 4.5, 5.0, 5.5, 6, 6, 6, 6.5, 7.0],
    'James': [6, 6.5, 7.0, 7.5, 8, 8, 8, 8.5, 9.0, 9.5, 10, 10, 10, 10.5, 11.0, 11.5, 12, 12, 12, 12.5, 13.0, 13.5, 0, 0, 0, 0.5, 1.0, 1.5, 2, 2, 2, 2.5, 3.0, 3.5, 4, 4, 4, 4.5, 5.0, 5.5, 6, 6, 6, 6.5, 7.0, 7.5, 8, 8, 8, 8.5, 9.0],
    'Edward': [8, 8.5, 9.0, 9.5, 10, 10, 10, 10.5, 11.0, 11.5, 12, 12, 12, 12.5, 13.0, 13.5, 0, 0, 0, 0.5, 1.0, 1.5, 2, 2, 2, 2.5, 3.0, 3.5, 4, 4, 4, 4.5, 5.0, 5.5, 6, 6, 6, 6.5, 7.0, 7.5, 8, 8, 8, 8.5, 9.0, 9.5, 10, 10, 10, 10.5, 11.0],
    'Percy': [10, 10.5, 11.0, 11.5, 12, 12, 12, 12.5, 13.0, 13.5, 0, 0, 0, 0.5, 1.0, 1.5, 2, 2, 2, 2.5, 3.0, 3.5, 4, 4, 4, 4.5, 5.0, 5.5, 6, 6, 6, 6.5, 7.0, 7.5, 8, 8, 8, 8.5, 9.0, 9.5, 10, 10, 10, 10.5, 11.0, 11.5, 12, 12, 12, 12.5, 13.0],
    'Henry': [12, 12.5, 13.0, 13.5, 0, 0, 0, 0.5, 1.0, 1.5, 2, 2, 2, 2.5, 3.0, 3.5, 4, 4, 4, 4.5, 5.0, 5.5, 6, 6, 6, 6.5, 7.0, 7.5, 8, 8, 8, 8.5, 9.0, 9.5, 10, 10, 10, 10.5, 11.0, 11.5, 12, 12, 12, 12.5, 13.0, 13.5, 0, 0, 0, 0.5, 1.0],
}]

EXPECTED_PERFECTTRACK_2 = [{
    'Thomas': [0, 1, 2, 2, 2, 3, 4, 4, 4, 5, 6],
    'Gordon': [2, 3, 4, 4, 4, 5, 6, 6, 6, 7, 8],
    'Emily': [4, 5, 6, 6, 6, 7, 8, 8, 8, 9, 10],
    'James': [6, 7, 8, 8, 8, 9, 10, 10, 10, 11, 12],
    'Edward': [8, 9, 10, 10, 10, 11, 12, 12, 12, 13, 0],
    'Percy': [10, 11, 12, 12, 12, 13, 0, 0, 0, 1, 2],
    'Henry': [12, 13, 0, 0, 0, 1, 2, 2, 2, 3, 4],
}]

EXPECTED_SLOWZONETRACK = [{
    'Thomas': [0, 0.5, 1.0, 1.5, 2, 2, 2, 2.5, 3.0, 3.5, 4, 4, 4, 4.5, 5.0, 5.5, 6, 6, 6, 6.5, 7.0, 7.5, 8, 8, 8, 8.5],
    'Gordon': [2, 2.5, 3.0, 3.5, 4, 4, 4, 4.5, 5.0, 5.5, 6, 6, 6, 6.5, 7.0, 7.5, 8, 8, 8, 8.5, 9.0, 9.5, 10, 10, 10, 10.25],
    'Emily': [4, 4.5, 5.0, 5.5, 6, 6, 6, 6.5, 7.0, 7.5, 8, 8, 8, 8.5, 9.0, 9.5, 10, 10, 10, 10.25, 10.5, 10.75, 11.0, 11.25, 11.5, 11.75],
    'James': [6, 6.5, 7.0, 7.5, 8, 8, 8, 8.5, 9.0, 9.5, 10, 10, 10, 10.25, 10.5, 10.75, 11.0, 11.25, 11.5, 11.75, 12, 12, 12, 12.5, 13.0, 13.5],
    'Edward': [8, 8.5, 9.0, 9.5, 10, 10, 10, 10.25, 10.5, 10.75, 11.0, 11.25, 11.5, 11.75, 12, 12, 12, 12.5, 13.0, 13.5, 0, 0, 0, 0.5, 1.0, 1.5],
    'Percy': [10, 10.25, 10.5, 10.75, 11.0, 11.25, 11.5, 11.75, 12, 12, 12, 12.5, 13.0, 13.5, 0, 0, 0, 0.5, 1.0, 1.5, 2, 2, 2, 2.5, 3.0, 3.5],
    'Henry': [12, 12.5, 13.0, 13.5, 0, 0, 0, 0.5, 1.0, 1.5, 2, 2, 2, 2.5, 3.0, 3.5, 4, 4, 4, 4.5, 5.0, 5.5, 6, 6, 6, 6.5]
}]

PERFECTTRACK_MEAN_1 = 6.0
PERFECTTRACK_STD_1 = 0.0

PERFECTTRACK_MEAN_2 = 10.0
PERFECTTRACK_STD_2 = 0.0

SLOWZONETRACK_MEAN = 6.571
SLOWZONETRACK_STD = 1.399

GAUSSIANTRACK_MEAN = 8.608
GAUSSIANTRACK_MEAN_STD = 0.005
GAUSSIANTRACK_STD = 2.985
GAUSSIANTRACK_STD_STD = 0.033`,_=`import unittest
import random
from ps2 import PerfectTrack, GaussianSlowdownTrack, SlowZoneTrack, simulate_trains, analyze_histories
from test_constants import EXPECTED_PERFECTTRACK_1, EXPECTED_PERFECTTRACK_2, \\
                            EXPECTED_SLOWZONETRACK, \\
                            PERFECTTRACK_MEAN_1, PERFECTTRACK_STD_1, \\
                            PERFECTTRACK_MEAN_2, PERFECTTRACK_STD_2, \\
                            SLOWZONETRACK_MEAN, SLOWZONETRACK_STD, \\
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
        return '\\n'.join(self.output)

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

    print("\\n\\nProblem Set 2 Unit Test Results:")
    print(output)`;function f(n){{let e=s(()=>({mbta_helpers:i,ps2:r,ps2_unsolved:o,test_constants:l,test_ps2_student:_}));a(n,{get fs(){return t(e)}})}}export{f as component};
