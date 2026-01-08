# main.py - Main program

from agents import EvolvAIAgent, TutorAgent, FarmerAgent

print("╔" + "═" * 44 + "╗")
print("║" + "     LUMIERE SQUAD v1               ".center(44) + "║")
print("╚" + "═" * 44 + "╝\n")

squad = []

for i in range(1, 5):
    print(f"--- Agent {i} ---")
    name = input(f"Agent {i} name: ")
    accuracy = float(input(f"{name}'s accuracy: "))
    rounds = int(input(f"Training rounds for {name}: "))

    # Alternate between Tutor and Farmer
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
    if isinstance(agent, TutorAgent):
        agent.teach("Artificial Intelligence")
    elif isinstance(agent, FarmerAgent):
        agent.farm("maize")

print(f"\nTotal Agents: {len(squad)}")