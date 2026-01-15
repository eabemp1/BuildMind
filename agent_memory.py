import json

class SimpleAgent:
    def __init__(self, name, accuracy):
        self.name = name
        self.accuracy = accuracy


name = input("Please input the agent's name: ")
accuracy = float(input(f"{name}'s accuracy: "))
agent = SimpleAgent(name, accuracy)
print(f"Created: {agent.name} at {agent.accuracy}%")

data = {"name": agent.name, "accuracy": agent.accuracy}

with open("agent_memory.json", "w") as file:
    json.dump(data, file)
print("Saved to agent_memory.json")


try:
    with open("agent_memory.json", "r") as file:
        data = json.load(file)
    agent = SimpleAgent(data["name"], data["accuracy"])
    print(f"Loaded from memory: {agent.name} at {agent.accuracy}%")
except FileNotFoundError:
    print("No saved agent. Starting fresh.")