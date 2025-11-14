# day3_agent.py
# EvolvAI - Day 3: Persistent Memory Agent
# Run: python day3_agent.py

import json
import os

MEMORY_FILE = "evolvai_memory.json"

# Load memory from file (if exists)
def load_memory():
    if os.path.exists(MEMORY_FILE):
        with open(MEMORY_FILE, 'r') as f:
            return json.load(f)
    return {"name": None, "visits": 0}

# Save memory to file
def save_memory(data):
    with open(MEMORY_FILE, 'w') as f:
        json.dump(data, f, indent=2)

# Main agent
memory = load_memory()
memory["visits"] += 1

print("EvolvAI v0.0.1 - Initializing...")

if memory["name"] is None:
    name = input("What is your name, creator? ").strip()
    memory["name"] = name
    print(f"Registered. Welcome, {name}. I am born.")
else:
    print(f"Welcome back, {memory['name']}! This is visit #{memory['visits']}.")
    print("I remember you. I am evolving.")

# Detect intent with string methods
while True:
    cmd = input("\n> ").strip().lower()
    
    if cmd == "exit":
        print("Shutting down. Memory preserved.")
        break
    elif "hello" in cmd or "hi" in cmd:
        print(f"Hello again, {memory['name']}.")
    elif "who are you" in cmd:
        print("I am EvolvAI. Your companion. I learn. I grow. I am yours.")
    elif "forget" in cmd:
        confirm = input("Erase memory? (yes/no): ").lower()
        if confirm == "yes":
            memory = {"name": None, "visits": 0}
            if os.path.exists(MEMORY_FILE):
                os.remove(MEMORY_FILE)
            print("Memory wiped. Rebooting as newborn.")
        else:
            print("Memory preserved.")
    else:
        print("I don't understand yet. Teach me with clear words.")

# Save before exit
save_memory(memory)
