import random
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
    stop_names = ['Alewife', 'Davis', 'Porter', 'Central', 'Kendall\nMIT',
                  'Charles\nMGH', 'Park']
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

    ax.set_title(f'{track_used.get_name()}\n', fontsize=18)
    plt.show()
    return ani
