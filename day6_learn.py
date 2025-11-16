# day6_learn.py - Loops (2:14:13 - 2:32:44)

# While loop
count = 0
while count < 3:
    print(f"Agent {count + 1} training...")
    count += 1

# For loop with range
print("\nSquad input:")
squad = []
for i in range(3):
    name = input(f"Agent {i+1} name: ")
    acc = float(input(f"{name}'s accuracy: "))
    squad.append([name, acc])

# For-in loop
print("\nSquad report:")
for agent in squad:
    print(f"{agent[0]} → {agent[1]:.1f}%")