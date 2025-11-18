# assignment_day8.py - Fixed version

def get_improvement(rounds):
    if rounds < 5: return 8.5
    elif rounds < 10: return 5.0
    elif rounds < 20: return 2.5
    else: return 0.5

def get_grade(acc):
    if acc >= 90: return "A"
    elif acc >= 80: return "B"
    elif acc >= 70: return "C"
    elif acc >= 60: return "D"
    else: return "F"

class EvolvAIAgent:
    def __init__(self, name, accuracy):
        self.name = name
        self.accuracy = accuracy
        self.grade = get_grade(accuracy)

    def evolve(self, rounds):
        self.accuracy = min(self.accuracy + get_improvement(rounds), 100.0)
        self.grade = get_grade(self.accuracy)

    def report(self, old_acc, old_grade):
        print(f"{self.name:<10} | {old_acc:>5.2f}% → {self.accuracy:>5.2f}% | {old_grade} → {self.grade}", end="")
        if get_grade(old_acc) != self.grade and self.accuracy > old_acc:
            print("  LEVEL UP!", end="")
        print()

# === MAIN ===
print("╔" + "═" * 46 + "╗")
print("║" + "     EVOLVAI SQUAD EVOLUTION v5     ".center(46) + "║")
print("╚" + "═" * 46 + "╝\n")

squad = []

for i in range(1, 5):
    print(f"--- Agent {i} ---")
    name = input(f"Agent {i} name: ")
    acc = float(input(f"{name}'s accuracy: "))
    agent = EvolvAIAgent(name, acc)
    old_acc = agent.accuracy
    old_grade = agent.grade
    rounds = int(input(f"Training rounds for {name}: "))
    agent.evolve(rounds)
    squad.append(agent)

print("\n╔" + "═" * 46 + "╗")
print("║" + "       FINAL EVOLUTION REPORT       ".center(46) + "║")
print("╚" + "═" * 46 + "╝\n")

for agent in squad:
    agent.report(old_acc, old_grade)  # Note: better to store old values in object (Day 9)

print(f"\nTotal Agents: {len(squad)}")