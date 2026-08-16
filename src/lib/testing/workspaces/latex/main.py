from sympy import *
from sympy.abc import *

init_printing()

x, y= symbols("x, y", real = True)
diff((3*x**4+5)**3,x)