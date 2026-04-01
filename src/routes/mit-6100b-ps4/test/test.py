# test_ps4_student.py
#
# This tester will check for:
#   - Correctness of functions implemented in ps4.py
#   - Use of docstrings in ps4.py
#   - Basic implementation of required functionality
# This tester will not check for:
#
# Files expected in the same ancestor folder:
#   ps4.py  (student file)
# -----------------------------------------------------------------------------
import contextlib
import io
import os
import random
import unittest

import numpy as np
import pandas as pd
from helpers import Results_600, TestProblemSetBase, case_options, run_student_script

def hash_dataframe(df):
    return sum(pd.util.hash_pandas_object(df.sort_values(by=["Country", "ISO3", "Year"]).reset_index(drop=True)).tolist())

class TestProblemSet(TestProblemSetBase):
    """
    Test suite for Problem Set 4
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # file is in grandparent directory
        self.student_script_path = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "ps4.py"
        )

        _, student_locals, _ = run_student_script(self.student_script_path, {})

        self.global_vars = student_locals or {}

    @case_options(
        points=1,
        failure="Function 'load_data' is not implemented correctly",
        error="Error occurred while testing 'load_data'",
    )
    def test_load_data(self):
        """Test that load_data returns a DataFrame with expected columns."""
        os.makedirs("test", exist_ok=True)
        if not os.path.exists("test/sample_temperature_data.csv"):
            df_test = pd.DataFrame(
                {"Year": [2000, 2001, 2002], "Temperature": [14.1, 14.3, 14.5]}
            )
            df_test.to_csv("test/sample_temperature_data.csv", index=False)

        if not os.path.exists("test/sample_disaster_data.json"):
            df_test = pd.DataFrame({"Year": [2000, 2001, 2002], "Disasters": [5, 7, 6]})
            df_test.to_json("test/sample_disaster_data.json", index=False)

        fn = self.global_vars.get("load_data")
        if not callable(fn):
            self.fail(
                "Function 'load_data' is not defined or not callable in the student script."
            )

        df = fn("test/sample_temperature_data.csv")

        self.assertIsInstance(
            df, pd.DataFrame, "Function 'load_data' must return a DataFrame"
        )

        expected_columns = {"Year", "Temperature"}

        self.assertTrue(
            expected_columns.issubset(set(df.columns)),  # type: ignore
            f"DataFrame columns {df.columns} do not include expected columns {expected_columns}.",  # type: ignore
        )

        df = fn("test/sample_disaster_data.json")
        expected_columns = {"Year", "Disasters"}
        self.assertTrue(
            expected_columns.issubset(set(df.columns)),  # type: ignore
            f"DataFrame columns {df.columns} do not include expected columns {expected_columns}.",  # type: ignore
        )

    @case_options(
        points=1,
        failure="Function 'process_temp_change' did not correctly clean or rename temperature data",
        error="Error occurred while testing 'process_temp_change'",
    )

    def test_process_temp_change(self):
        """Test process_temperature_data function with actual data"""
        ld = self.global_vars.get("load_data")

        if not callable(ld):
            self.fail(
                "Pass the load_data test first!"
            )

        raw = ld("data/temp_change.csv")

        fn = self.global_vars.get("process_temperature_data")
        if not callable(fn):
            self.fail(
                "Function 'process_temperature_data' is not defined or not callable in the student script."
            )

        df: pd.DataFrame = fn(raw)  # type: ignore

        self.assertIsInstance(
            df,
            pd.DataFrame,
            "process_temperature_data: must return a DataFrame",
        )

        self.assertTrue(
            df.columns.tolist() == ["Country", "ISO3", "Year", "Temperature"],
            "process_temperature_data: must have 4 columns as above",
        )

        self.assertTrue(
            hash_dataframe(df) == 132765512004132243850372,
            "process_temperature_data: recheck the contents of the dataframe!",
        )

    @case_options(
        points=1,
        failure="Function 'process_disasters' failed to correctly aggregate disaster data",
        error="Error occurred while testing 'process_disasters'",
    )
    def test_process_disasters(self):
        """Test process_disaster_data function with sample data"""
        ld = self.global_vars.get("load_data")

        if not callable(ld):
            self.fail(
                "Pass the load_data test first!"
            )

        raw = ld("data/disasters.csv")

        fn = self.global_vars.get("process_disaster_data")
        if not callable(fn):
            self.fail(
                "Function 'process_disaster_data' is not defined or not callable in the student script."
            )

        df_disasters: pd.DataFrame = fn(raw)  # type: ignore
        # df_people: pd.DataFrame = fn(raw, people=True)

        self.assertIsInstance(
            df_disasters,
            pd.DataFrame,
            "Function 'process_disaster_data' must return a DataFrame when people=False",
        )
        # self.assertIsInstance(
        #     df_people,
        #     pd.DataFrame,
        #     "Function 'process_disaster_data' must return a DataFrame when people=True",
        # )
        # self.assertTrue(
        #     df_people.columns.tolist() == ["Country", "ISO3", "Year", "People"],
        #     "process_disaster_data(True): must have 4 columns as above",
        # )
        self.assertTrue(
            df_disasters.columns.tolist() == ["Country", "ISO3", "Year", "Total Climate-Related Disasters"],
            "process_disaster_data(False): must have 4 columns as above",
        )
        # self.assertTrue(
        #     df_people.shape == (9720, 4),
        #     "process_disaster_data(True): shape isn't the right size!"
        # )
        self.assertTrue(
            df_disasters.shape == (9720, 4),
            "process_disaster_data(False): shape isn't the right size!"
        )
        # self.assertTrue(
        #     hash_dataframe(df_people) == 89256587471184936056507,
        #     "process_disaster_data(True): recheck the contents of the dataframe!"
        # )
        self.assertTrue(
            hash_dataframe(df_disasters) == 89270565562687137423940,
            "process_disaster_data(False): recheck the contents of the dataframe!"
        )

    @case_options(
        points=1,
        failure="Function 'process_population_data' did not correctly format population data",
        error="Error occurred while testing 'process_population_data'",
    )
    def test_process_population_data(self):
        """Test process_population_data function with sample data."""
        ld = self.global_vars.get("load_data")

        if not callable(ld):
            self.fail(
                "Pass load_data first!"
            )

        raw = ld("data/population.json")


        fn = self.global_vars.get("process_population_data")
        if not callable(fn):
            self.fail(
                "Function 'process_population_data' is not defined or not callable in the student script"
            )

        df: pd.DataFrame = fn(raw)  # type: ignore

        self.assertIsInstance(
            df,
            pd.DataFrame,
            "Function 'process_population_data' must return a DataFrame",
        )
        self.assertTrue(
            df.columns.tolist() == ["Country", "ISO3", "Year", "Population"],
            "process_population_data(): must have 4 columns as above",
        )
        self.assertTrue(
            df.shape == (16727, 4),
            "process_population_data(): shape isn't the right size!"
        )
        self.assertTrue(
            hash_dataframe(df) == 153241324937726548248568,
            "process_population_data: recheck the contents of the dataframe!"
        )

    @case_options(
        points=1,
        failure="Function 'country_to_continent' did not correctly map ISO codes to continent names",
        error="Error occurred while testing 'country_to_continent'",
    )
    def test_country_to_continent(self):
        """Test country_to_continent function with various ISO3 codes"""
        fn = self.global_vars.get("country_to_continent")
        if not callable(fn):
            self.fail(
                "Function 'country_to_continent' is not defined or not callable in the student script."
            )
        result1 = fn("USA")
        result2 = fn("FRA")
        # result3 = fn("XXX")  # invalid ISO
        result4 = fn("AZO")  # special case
        result5 = fn("ANT")  # special case
        self.assertIn(result1, ["North America", "NA"], "Incorrect continent for USA")
        self.assertIn(result2, ["Europe", "EU"], "Incorrect continent for FRA")
        # don't think this is within the spec
        # self.assertTrue(
        #     result3 is None,
        #     "Function should handle invalid ISO codes gracefully (e.g., return None)",
        # )
        self.assertIn(
            result4,
            ["Europe", "EU"],
            "Incorrect continent for AZO. Be sure to handle all special cases.",
        )
        self.assertIn(
            result5,
            ["North America", "NA"],
            "Incorrect continent for ANT. Be sure to handle all special cases.",
        )


if __name__ == "__main__":
    print("Running unit tests")
    suite = unittest.TestSuite()
    suite.addTests(unittest.TestLoader().loadTestsFromTestCase(TestProblemSet))

    runner = unittest.TextTestRunner(verbosity=2, resultclass=Results_600)
    result = runner.run(suite)

    output = result.getOutput()
    points_earned = round(result.getPoints(), 3)

    print("\n\nProblem Set 4 Unit Test Results:")
    print(output)
