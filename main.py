# main.py - Main program

from agents import EvolvAIAgent, TutorAgent, FarmerAgent
from memory import save_squad, load_squad
import os  # Added for file deletion (reset)

print("╔" + "═" * 44 + "╗")
print("║" + "     LUMIERE SQUAD v1               ".center(44) + "║")
print("╚" + "═" * 44 + "╝\n")

squad = load_squad()

# === Startup: Load or Reset ===
if squad:
    print("Previous squad found! What would you like to do?")
    print("1. Load previous squad (continue)")
    print("2. Reset and create new squad")
    
    choice = ""
    while choice not in ["1", "2"]:
        choice = input("Enter 1 or 2: ").strip()
    
    if choice == "2":
        print("Resetting squad...")
        squad = []
        # Optional: Delete the memory file for clean reset
        if os.path.exists("squad_memory.json"):
            os.remove("squad_memory.json")
            print("Memory file deleted for clean reset.")
        else:
            print("No memory file found — starting fresh anyway.")
else:
    print("No previous squad found. Creating new one...")

# === Create new squad only if empty (first run OR reset) ===
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

# === Show current squad status immediately ===
print("\n╔" + "═" * 44 + "╗")
print("║" + "     CURRENT SQUAD STATUS       ".center(44) + "║")
print("╚" + "═" * 44 + "╝\n")

for agent in squad:
    agent.report()

print("\nSquad Overview:")
for agent in squad:
    print(agent)  # uses __str__

print("\nDebug View:")
print(squad)  # uses __repr__

print("\nSummary:")
print(f"- Total agents: {len(squad)}")
print(f"- Average accuracy: {sum(agent.accuracy for agent in squad) / len(squad):.1f}%")

leveled_up = sum(1 for agent in squad if agent.grade != agent.old_grade and agent.accuracy > agent.old_accuracy)
print(f"- Agents that leveled up since last save: {leveled_up}")

# === Optional training ===
train_again = input("\nWould you like to train the squad again? (y/n): ").lower().strip()
if train_again in ['y', 'yes']:
    print("\n--- Train the squad again ---")
    for agent in squad:
        print(f"Training {agent.name} (current accuracy: {agent.accuracy:.1f}%)")
        rounds = int(input(f"New training rounds: "))
        agent.evolve(rounds)

    # Show updated report after training
    print("\n╔" + "═" * 44 + "╗")
    print("║" + "     UPDATED EVOLUTION REPORT       ".center(44) + "║")
    print("╚" + "═" * 44 + "╝\n")

    for agent in squad:
        agent.report()

    print("\nUpdated Summary:")
    print(f"- Total agents: {len(squad)}")
    print(f"- Average accuracy: {sum(agent.accuracy for agent in squad) / len(squad):.1f}%")
    leveled_up = sum(1 for agent in squad if agent.grade != agent.old_grade and agent.accuracy > agent.old_accuracy)
    print(f"- Agents that leveled up this session: {leveled_up}")

# Save at the end (always)
save_squad(squad)