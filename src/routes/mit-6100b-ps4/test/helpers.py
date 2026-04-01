# 6.100 Testing Suite Helper Functions
# This file should not be modified
# @authors: suufi, lejla
# @last_modified: 2025-01-31

import io
import runpy
import sys
import unittest
from functools import wraps
from unittest.mock import MagicMock


def run_student_script(script_path, injected_globals):
    """
    Run a student's script and capture the output.

    Args:
        script_path (str): Path to the student's script
        injected_globals (dict): A dictionary of global variables to inject into the script

    Returns: Tuple of (output, student_locals, printed_lines)
    """

    # Capture output
    captured_output = io.StringIO()
    sys.stdout = captured_output

    # collect a log of all printed lines to distinguish from stack traces
    printed_lines = []

    class PrintLog:
        """
        A class to redirect print statements to a list
        """

        def write(self, text):
            """
            Write text to the printed_lines list
            """
            printed_lines.append(text)

    def log_print(*args, **kwargs):
        # this line redirects to printed_lines var
        print(*args, **kwargs, file=PrintLog())
        # this one goes to stddout
        print(*args, **kwargs)

    student_locals = {}
    try:
        student_locals.update(
            runpy.run_path(
                script_path, init_globals={**injected_globals, "print": log_print}
            )
        )
    except Exception as e:
        print(f"Error: {e}")

    printed_lines = [line for line in printed_lines if line.strip()]

    sys.stdout = sys.__stdout__
    return (captured_output.getvalue().strip(), student_locals, printed_lines)


def case_options(points, failure, error):
    """Decorator to add points and messages to a test case"""

    def decorator(func):
        # Directly set attributes on the original function
        func.points = points
        func.failure_message = failure
        func.error_message = error

        @wraps(func)
        def wrapper(*args, **kwargs):
            if isinstance(args[-1], MagicMock):
                args = args[:-1]
            return func(*args, **kwargs)

        return wrapper

    return decorator


def testsuite_options(timeout, weight):
    """Decorator to add timeout and weight to a test suite"""

    def decorator(cls):
        # Directly set attributes on the original class
        cls.timeout = timeout
        cls.weight = weight

        return cls

    return decorator


class TestProblemSetBase(unittest.TestCase):
    """
    Base class for the test suite
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.student_script_path = None
        self.global_vars = {}

    def attempt_cases(self, inputs, expected, exact_match=False, exact_lines=False):
        """Attempt the test cases for a given task and checks for expected output

        Args:
            inputs (dict): A dictionary of inputs to inject into the student's script
            expected (list, tuple): A list or tuple of expected outputs
            exact_match (bool): Whether the expected output should match exactly
            exact_lines (bool): Whether the expected output should match exactly line by line

        Returns:
            dict: The global variables from the student's script
        """

        injected_globals = self.global_vars.copy()
        injected_globals.update(inputs)

        output, student_vars, printed_lines = run_student_script(
            self.student_script_path, injected_globals
        )

        # lists of expected outputs
        if isinstance(expected, list):
            for expected_output in expected:
                if exact_match and expected_output != output:
                    self.fail(f"Expected {expected_output}, got {output}")
                elif (
                    not exact_match
                    and str(expected_output).lower() not in output.lower()
                ):
                    self.fail(f"Expected {expected_output}, got {output}")

        # tuple of expected outputs, in exact order
        elif isinstance(expected, tuple):

            if exact_lines and len(expected) != len(printed_lines):
                self.fail(f"Expected {len(expected)} outputs, got {len(printed_lines)}")

            for i, expected_output in enumerate(expected):
                if exact_match and expected_output != printed_lines[i]:
                    self.fail(f"Expected {expected_output}, got {printed_lines[i]}")
                elif (
                    not exact_match
                    and str(expected_output).lower() not in printed_lines[i].lower()
                ):
                    self.fail(f"Expected {expected_output}, got {printed_lines[i]}")

        return student_vars

    def get_global_vars(self):
        """Return the global variables from the student script"""
        return self.global_vars


class Results_600(unittest.TextTestResult):
    """
    Custom test result class to capture output and points
    """

    def __init__(self, *args, **kwargs):
        super(Results_600, self).__init__(*args, **kwargs)

        self.output = []

        self.points = 0
        self.max_points = 0

    def addSuccess(self, test):
        method = getattr(test, getattr(test, "_testMethodName"))
        func = method
        pts = getattr(func, "points", 0)

        self.points += pts
        self.max_points += pts

        return super().addSuccess(test)

    def addFailure(self, test, err):

        method = getattr(test, getattr(test, "_testMethodName"))
        func = method
        pts = getattr(func, "points", 0)

        failure_message = getattr(func, "failure_message", "")

        self.output.append(f"❌ [-{pts}] {failure_message}, {err[1]}\n")
        self.max_points += pts

        super(Results_600, self).addFailure(test, err)

    def addError(self, test, err):
        method = getattr(test, getattr(test, "_testMethodName"))
        func = method
        pts = getattr(func, "points", 0)

        error_message = getattr(func, "error_message", "")

        self.output.append(f"❌ [-{pts}] {error_message}, {err[1]}\n")
        self.max_points += pts

        super(Results_600, self).addError(test, err)

    def getOutput(self):
        """
        Return the captured output
        """
        if self.points == self.max_points:
            self.output.append(f"\n✅ [{self.points}] All tests passed! 🎉\n")
        elif self.points > 0:
            self.output.append(
                f"\n✅ [{self.points}/{self.max_points}] Some tests passed.\n"
            )
        else:
            self.output.append(f"\n❌ [0/{self.max_points}] No tests passed.\n")

        return "\n".join(self.output)

    def getPoints(self):
        """
        Return the total points
        """

        return self.points
