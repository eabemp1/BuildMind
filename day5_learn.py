# day5_learn.py - Functions (1:24:15 - 1:35:00)

# Basic function
def say_hello(name):
    print(f"Hello, {name}! Welcome to EvolvAI.")

say_hello("Kwame")

# Function with return
def calculate_improvement(rounds):
    if rounds < 5:
        return 8.5
    elif rounds < 10:
        return 5.0
    elif rounds < 20:
        return 2.5
    else:
        return 0.5

# Test it
imp = calculate_improvement(7)
print(f"Improvement: {imp}%")