# agents.py - All classes and helper functions

def get_improvement(rounds):
    if rounds < 5:
        return 8.5
    elif rounds < 10:
        return 5.0
    elif rounds < 20:
        return 2.5
    else:
        return 0.5


def get_grade(acc):
    if acc >= 90:
        return "A"
    elif acc >= 80:
        return "B"
    elif acc >= 70:
        return "C"
    elif acc >= 60:
        return "D"
    else:
        return "F"


class EvolvAIAgent:
    def __init__(self, name, accuracy):
        self.name = name
        self.old_accuracy = accuracy
        self.accuracy = accuracy
        self.old_grade = get_grade(accuracy)
        self.grade = get_grade(accuracy)

    def evolve(self, rounds):
        self.accuracy = min(self.accuracy + get_improvement(rounds), 100)
        self.grade = get_grade(self.accuracy)

    def report(self):
        line = f"{self.name:<10} | {self.old_accuracy:>5.2f}% → {self.accuracy:>5.2f}% | {self.old_grade} → {self.grade}"
        print(line, end="")
        if self.old_grade != self.grade and self.accuracy > self.old_accuracy:
            print("  LEVEL UP!", end="")
        print()


class TutorAgent(EvolvAIAgent):
    def teach(self, subject):
        print(f"{self.name} is teaching {subject} at {self.accuracy:.1f}% mastery!")


class FarmerAgent(EvolvAIAgent):
    def farm(self, crop):
        print(f"{self.name} is optimising {crop} farming — current accuracy {self.accuracy:.1f}%")