import json
from agents import FarmerAgent, TutorAgent, EvolvAIAgent

def save_squad(squad, filename="squad_memory.json"):
    data = []
    for agent in squad:
        entry = {
            "class": agent.__class__.__name__,
            "name": agent.name,
            "accuracy": agent.accuracy,
            "grade": agent.grade
        }
        data.append(entry)

    with open("squad_memory.json", "w") as f:
        json.dump(data, f, indent=4)
    print("Squad saved!")


def load_squad(filename = "squad_memory.json"):
    try:
        with open(filename, "r") as f:
           data = json.load(f)

        squad = []

        for item in data:
            class_name = item["class"]
            name = item["name"]
            accuracy = item["accuracy"]

            if class_name == "TutorAgent":
                agent = TutorAgent(name, accuracy)
            elif class_name == "FarmerAgent":
                agent = FarmerAgent(name, accuracy)
            else:
                agent = EvolvAIAgent(name, accuracy)
            squad.append(agent)

        print(f"Squad loaded from {filename}")
        return squad
    except FileNotFoundError:
        print("No saved squad found. Starting fresh")
        return []