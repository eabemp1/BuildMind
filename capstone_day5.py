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
        
# Prints a fancy header
print("EVOLVAI SQUAD EVOLUTION V2")
print("=" * 35)

# A list for the agent
squad = []

# Information about the agent(Name, Accuracy, Training rounds)
name1 = input("Agent 1 name: ")
accuracy1 = float(input(f"{name1}'s accuracy: "))
rounds1 = int(input(f"Training rounds for {name1}: "))
squad.append([name1, accuracy1, rounds1])

name2 = input("Agent 2 name: ")
accuracy2 = float(input(f"{name2}'s accuracy: "))
rounds2 = int(input(f"Training rounds for {name2}: "))
squad.append([name2, accuracy2, rounds2])

name3 = input("Agent 3 name: ")
accuracy3 = float(input(f"{name3}'s accuracy: "))
rounds3 = int(input(f"Training rounds for {name3}: "))
squad.append([name3, accuracy3, rounds3])


# Calling functioon to boost agent
new_accuracy1 = get_improvement(rounds1) + accuracy1
new_accuracy2 = get_improvement(rounds2) + accuracy2
new_accuracy3 = get_improvement(rounds3) + accuracy3

# Checks whether new accuracy is bigger than 100 and corrects it
if new_accuracy1 > 100:
    new_accuracy1 = min(new_accuracy1, 100)
if new_accuracy2 > 100:
    new_accuracy2 = min(new_accuracy2, 100)
if new_accuracy3 > 100:
    new_accuracy3 = min(new_accuracy3, 100)


# Prints final report
print("\nFINAL EVOLUTION REPORT")
print("=" * 35)
print(f"{name1}  | {accuracy1:.2f}% -> {new_accuracy1:.2f}% | {get_grade(accuracy1)} -> {get_grade(new_accuracy1)}", end="")
print("  LEVEL UP!" if get_grade(accuracy1)!= get_grade(new_accuracy1) else "")
print(f"{name2}  | {accuracy2:.2f}% -> {new_accuracy2:.2f}% | {get_grade(accuracy2)} -> {get_grade(new_accuracy2)}", end="")
print("  LEVEL UP!" if get_grade(accuracy2)!= get_grade(new_accuracy2) else "")
print(f"{name3}  | {accuracy3:.2f}% -> {new_accuracy3:.2f}% | {get_grade(accuracy3)} -> {get_grade(new_accuracy3)}", end="")
print("  LEVEL UP!" if get_grade(accuracy3)!= get_grade(new_accuracy3) else "")

print(f"\nTotal Agents: {len(squad)}")