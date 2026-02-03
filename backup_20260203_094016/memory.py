# memory.py - Save/load squad with accuracy

import json
import os
from agents import EvolvAIAgent, MathAgent, FinanceAgent, CookingAgent, ReminderAgent

SQUAD_FILE = "squad_memory.json"

def save_squad(squad):
    data = []
    for agent in squad:
        data.append({
            "name": agent.name,
            "accuracy": agent.accuracy,
            "specialty": agent.specialty,
            "role": agent.role
        })
    with open(SQUAD_FILE, 'w') as f:
        json.dump(data, f, indent=2)
    print(f"Saved squad with {len(squad)} agents")

def load_squad():
    if not os.path.exists(SQUAD_FILE):
        print("No squad file found - starting fresh")
        return []
    
    try:
        with open(SQUAD_FILE, 'r') as f:
            data = json.load(f)
        agents = []
        for item in data:
            specialty = item.get("specialty", "general")  # Safe default
            accuracy = item.get("accuracy", 50.0)
            name = item.get("name", "Unknown Agent")
            role = item.get("role", "Helper")

            if specialty == "math":
                agent = MathAgent()
            elif specialty == "finance":
                agent = FinanceAgent()
            elif specialty == "cooking":
                agent = CookingAgent()
            elif specialty == "reminders":
                agent = ReminderAgent()
            else:
                agent = EvolvAIAgent(name, accuracy)

            agent.accuracy = accuracy
            agent.specialty = specialty
            agent.role = role
            agents.append(agent)
        
        print(f"Loaded {len(agents)} agents from squad_memory.json")
        return agents
    
    except Exception as e:
        print(f"Error loading squad: {e} - starting fresh")
        return []