# agents.py - Specialized EvolvAIAgent subclasses for Lumiere
# FIXED: Removed hardcoded user name, improved responses

class EvolvAIAgent:
    """
    Base agent class for Lumiere
    All specialized agents inherit from this
    """
    def __init__(self, name, accuracy=50.0):
        self.name = name
        self.accuracy = accuracy
        self.specialty = "general"
        self.role = "General companion"

    def respond(self, question, user_name="friend"):
        """
        Generate a response to a question
        
        Args:
            question: User's question
            user_name: Name of the user (dynamic)
        
        Returns:
            str: Agent's response prompt for LLM
        """
        return f"I'm {self.name} ({self.specialty}), {self.accuracy:.1f}% mastery. Answering for {user_name}: {question}"
    
    def __repr__(self):
        return f"<{self.name} ({self.specialty}) - {self.accuracy:.1f}% accuracy>"


class MathAgent(EvolvAIAgent):
    """Specialized agent for mathematics and science questions"""
    
    def __init__(self):
        super().__init__("Math Expert", 50.0)
        self.specialty = "math"
        self.role = "Math & science tutor"

    def respond(self, question, user_name="friend"):
        return f"Yh, {user_name}, as your Math Expert ({self.accuracy:.1f}% mastery), here's the step-by-step for {question}"


class FinanceAgent(EvolvAIAgent):
    """Specialized agent for finance, investing, and money management"""
    
    def __init__(self):
        super().__init__("Finance Guide", 50.0)
        self.specialty = "finance"
        self.role = "Personal finance & trading assistant"

    def respond(self, question, user_name="friend"):
        return f"Got you, {user_name} — Finance Guide here ({self.accuracy:.1f}% mastery). On {question}:"


class CookingAgent(EvolvAIAgent):
    """Specialized agent for recipes, cooking tips, and food prep"""
    
    def __init__(self):
        super().__init__("Cooking Buddy", 50.0)
        self.specialty = "cooking"
        self.role = "Personal chef & recipe helper"

    def respond(self, question, user_name="friend"):
        return f"Sure thing, {user_name} — Cooking Buddy ({self.accuracy:.1f}% mastery). For {question}:"


class ReminderAgent(EvolvAIAgent):
    """Specialized agent for reminders, tasks, and scheduling"""
    
    def __init__(self):
        super().__init__("Reminder Manager", 50.0)
        self.specialty = "reminders"
        self.role = "Task & reminder helper"

    def respond(self, question, user_name="friend"):
        return f"Yh, {user_name} — Reminder Manager here ({self.accuracy:.1f}% mastery). Setting up {question}:"


# Future agent ideas (commented out for now):
# 
# class CodeAgent(EvolvAIAgent):
#     """Specialized agent for programming and debugging"""
#     def __init__(self):
#         super().__init__("Code Assistant", 50.0)
#         self.specialty = "coding"
#         self.role = "Programming & debugging helper"
#
# class FitnessAgent(EvolvAIAgent):
#     """Specialized agent for fitness and health"""
#     def __init__(self):
#         super().__init__("Fitness Coach", 50.0)
#         self.specialty = "fitness"
#         self.role = "Workout & nutrition guide"
#
# class CreativeAgent(EvolvAIAgent):
#     """Specialized agent for creative writing and brainstorming"""
#     def __init__(self):
#         super().__init__("Creative Muse", 50.0)
#         self.specialty = "creative"
#         self.role = "Writing & brainstorming partner"
