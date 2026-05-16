################################################################################
# 6.100B Spring 2026
# Problem Set 4 — Climate Change and Impacts
# Name:
# Collaborators:
# Time:
#
# READ ME:
# - Do NOT rename this file or change existing function headers.
# - You may not import additional libraries beyond the ones already here.
# - You may (and should!) define additional helper functions if needed. For any
#   helper functions, include a docstring explaining its purpose, inputs, and outputs.
################################################################################

import sys

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import pycountry_convert as pc
import pymannkendall as mk
import sklearn

# DO NOT MODIFY ANY OF THE FUNCTION HEADERS BELOW
cheese_consumption_by_year = [
    6.95,
    7.35,
    8.15,
    8.78,
    9.44,
    9.10,
    10.33,
    10.40,
    11.27,
    11.68,
    12.01,
    12.94,
    13.52,
    13.80,
    15.35,
    16.48,
    16.76,
    17.28,
    17.13,
    17.38,
    17.80,
    18.11,
    19.02,
    19.12,
    19.57,
]


def load_data(file_path):
    """
    Loads a CSV or JSON file and returns its contents
    in the form of a DataFrame.

    file_path: path to a file, either .csv or .json

    Returns a DataFrame.
    """
    raise NotImplementedError("Not implemented yet")


def process_temperature_data(df):
    """
    Processes the temperature data as specified in the handout.

    df: a DataFrame

    Returns a DataFrame.
    """
    raise NotImplementedError("Not implemented yet")


def process_population_data(df):
    """
    Processes the population data as specified in the handout.

    df: a DataFrame

    Returns a DataFrame.
    """
    raise NotImplementedError("Not implemented yet")


def process_disaster_data(df):
    """
    Processes the disaster data as specified in the handout.

    df: a DataFrame

    Returns a DataFrame.
    """
    raise NotImplementedError("Not implemented yet")


def country_to_continent(country_code):
    """
    Takes in a three-letter ISO3 code representing a country
    and returns the continent it belongs to in the form of a
    two-letter code.

    country_code: a valid ISO3 country code from one of the
                  three datasets we have provided

    Returns a two-letter code, one of "AF", "AS", "EU",
    "NA", "SA", or "OC".
    """
    raise NotImplementedError("Not implemented yet")


# Implement your code below. Do not leave code in the global scope
# (i.e. outside of functions), unless it's in the main block below.

if __name__ == "__main__":
    # You can use this main block to test your functions.
    pass

    # Example:
    # df_temp = load_data("temp_change.csv")
    # processed_df_temp = process_temperature_data(df_temp)
    # print(processed_df_temp.head())
