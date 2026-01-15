# main.py - Main program

from agents import EvolvAIAgent, TutorAgent, FarmerAgent
from memory import save_squad, load_squad

print("╔" + "═" * 44 + "╗")
print("║" + "     LUMIERE SQUAD v1               ".center(44) + "║")
print("╚" + "═" * 44 + "╝\n")

squad = load_squad()

if not squad:
    squad = []

for i in range(1, 5):
    print(f"--- Agent {i} ---")
    name = input(f"Agent {i} name: ")
    accuracy = float(input(f"{name}'s accuracy: "))
    rounds = int(input(f"Training rounds for {name}: "))

    if i % 2 == 1:
        agent = TutorAgent(name, accuracy)
    else:
        agent = FarmerAgent(name, accuracy)

    agent.evolve(rounds)
    squad.append(agent)

print("\n╔" + "═" * 44 + "╗")
print("║" + "       FINAL EVOLUTION REPORT       ".center(44) + "║")
print("╚" + "═" * 44 + "╝\n")


for agent in squad:
    agent.report()

print("\nSquad Overview:")
for agent in squad:
    print(agent)  # uses __str__

print("\nDebug View:")
print(squad)  # uses __repr__

print(f"\nTotal Agents: {len(squad)}")

save_squad(squad)