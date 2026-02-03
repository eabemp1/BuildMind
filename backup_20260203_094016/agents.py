# agents.py - Specialized EvolvAIAgent subclasses for Lumiere

class EvolvAIAgent:
    def __init__(self, name, accuracy=50.0):
        self.name = name
        self.accuracy = accuracy
        self.specialty = "general"
        self.role = "General companion"

    def respond(self, question):
        return f"I'm {self.name} ({self.specialty}), {self.accuracy:.1f}% mastery. Answering: {question}"

class MathAgent(EvolvAIAgent):
    def __init__(self):
        super().__init__("Math Expert", 50.0)
        self.specialty = "math"
        self.role = "Math & science tutor"

    def respond(self, question):
        return f"Yh, Emmanuel, as your Math Expert ({self.accuracy:.1f}% mastery), here's the step-by-step for {question}"

class FinanceAgent(EvolvAIAgent):
    def __init__(self):
        super().__init__("Finance Guide", 50.0)
        self.specialty = "finance"
        self.role = "Personal finance & trading assistant"

    def respond(self, question):
        return f"Got you, Emmanuel — Finance Guide here ({self.accuracy:.1f}% mastery). On {question}:"

class CookingAgent(EvolvAIAgent):
    def __init__(self):
        super().__init__("Cooking Buddy", 50.0)
        self.specialty = "cooking"
        self.role = "Personal chef & recipe helper"

    def respond(self, question):
        return f"Sure thing, Emmanuel — Cooking Buddy ({self.accuracy:.1f}% mastery). For {question}:"

class ReminderAgent(EvolvAIAgent):
    def __init__(self):
        super().__init__("Reminder Manager", 50.0)
        self.specialty = "reminders"
        self.role = "Task & reminder helper"

    def respond(self, question):
        return f"Yh, Emmanuel — Reminder Manager here ({self.accuracy:.1f}% mastery). Setting up {question}:"