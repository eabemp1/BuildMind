# Function gets the number of rounds and choose the improvement %

def get_improvement(rounds):
    if rounds < 5:
        return 8.5
    elif rounds < 10:
        return 5.0
    elif rounds < 20:
        return 2.5
    else:
        return 0.5


# Function takes accuracy as input and returns grade

def get_grade(accuracy):
    if accuracy < 0 or accuracy > 100:
        return "Not valid"
    else:
        if accuracy >= 90:
            return "A"
        elif accuracy >= 80:
            return "B"
        elif accuracy >= 70:
            return "C"
        elif accuracy >= 60:
            return "D"
        else:
            return "F"
        

# === Header ===
print("╔" + "═" * 46 + "╗")
print("║" + "     EVOLVAI SQUAD EVOLUTION v4       ".center(46) + "║")
print("╚" + "═" * 46 + "╝\n")
        
# Loop to take user input and store in a dictionary
squad = []        
for i in range(3):
    print(f"--- Agent {i+1} ---")
    name = input(f"Agent {i+1} name: ")
    accuracy = float(input(f"{name}'s accuracy: "))
    rounds = int(input("Training rounds: "))

# Store the information in a dictionary

    agent = {
        "Agent_name" : name,
        "current_accuracy" : accuracy,
        "rounds" : rounds,
        "current_grade" : get_grade(accuracy),
        "new_accuracy" : min(get_improvement(rounds) + accuracy, 100),
        "new_grade" : get_grade(min(get_improvement(rounds) + accuracy, 100))
    }
    squad.append(agent) #add the dictionary to the list

# === Final Report ===
print("\n╔" + "═" * 46 + "╗")
print("║" + "       FINAL EVOLUTION REPORT       ".center(46) + "║")
print("╚" + "═" * 46 + "╝\n")

for agent in squad:
    name = agent["Agent_name"]
    g1_old = agent["current_accuracy"]
    g1_new = agent["new_accuracy"]
    g2_old = agent["current_grade"]
    g2_new = agent["new_grade"]

    print(f"{name:<10}  | {g1_old:>5.1f}% -> {g1_new:>5.1f}%  | {g2_old} -> {g2_new}", end = "")
    print("  LEVEL UP!" if g2_old != g2_new else "")


print(f"\nTotal Agents: {len(squad)}")