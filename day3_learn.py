# Quick math fun
num1 = 10
num2 = 3
print(num1 % num2) # Modulus
from math import *

print(sqrt(4.897)) # Square root
print(round(28.456)) # Square up/down

# day3_calculator.py - Basic calculator (from 50:00 video)

num1 = float(input("First number: "))
num2 = float(input("Second number: "))
op = input("Operator (+, -, *, /): ")

if op == "+":
    print(num1 + num2)
elif op == "-":
    print(num1 - num2)
elif op == "*":
    print(num1 * num2)
elif op == "/":
    print(num1 / num2)
else:
    print("Invalid operator")