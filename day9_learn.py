# day9_learn.py - Classes + Inheritance

# Base class (parent)
class EvolvAIAgent:
    def __init__(self, name, accuracy):
        self.name = name
        self.accuracy = accuracy
        self.grade = self.get_grade()

    def get_grade(self):
        if self.accuracy >= 90: return "A"
        elif self.accuracy >= 80: return "B"
        elif self.accuracy >= 70: return "C"
        elif self.accuracy >= 60: return "D"
        else: return "F"

    def evolve(self, rounds):
        imp = 8.5 if rounds < 5 else 5.0 if rounds < 10 else 2.5 if rounds < 20 else 0.5
        self.accuracy = min(self.accuracy + imp, 100)
        self.grade = self.get_grade()

    def report(self):
        print(f"{self.name} | Accuracy: {self.accuracy:.1f}% | Grade: {self.grade}")

# Child class (inherits everything)
class TutorAgent(EvolvAIAgent):
    def teach(self, subject):
        print(f"{self.name} is teaching {subject} at {self.accuracy:.0f}% mastery!")

class FarmerAgent(EvolvAIAgent):
    def farm(self, crop):
        print(f"{self.name} is optimising {crop} yield — current accuracy {self.accuracy:.1f}%")

# Test
tutor = TutorAgent("Kwesi", 85.0)
farmer = FarmerAgent("Ama", 72.5)

tutor.evolve(7)
farmer.evolve(12)

tutor.report()
tutor.teach("Python")

farmer.report()
farmer.farm("maize")