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

squad = []        
for i in range(3):
    name = input(f"Agent {i+1} name: ")
    accuracy = float(input(f"{name}'s accuracy: "))
    rounds = int(input("Training rounds: "))
    old_grade = get_grade(accuracy)
    improvement = accuracy + get_improvement(rounds)
    new_grade = get_grade(improvement)
    squad.append([name, accuracy, rounds, improvement, old_grade, new_grade])



print("╔" + "═" * 44 + "╗")
print("║" + "     EVOLVAI SQUAD EVOLUTION v2     ".center(44) + "║")
print("╚" + "═" * 44 + "╝\n")


for agent in squad:
    print(f"{agent[0]} | {agent[1]:.1f}% -> {agent[3]:.1f}% | {agent[4]} -> {agent[5]}", end ="")
    print("  LEVEL UP!" if {agent[1]} != {agent[3]} else"")

print(f"\nTotal Agents: {len(squad)}")