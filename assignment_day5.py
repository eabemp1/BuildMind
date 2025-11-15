def get_improvement(rounds):
    if rounds < 5:
        return 8.5
    elif rounds < 10:
        return 5.0
    elif rounds < 20:
        return 2.5
    else:
        return 0.5
    
def get_grade(accuracy):
    if accuracy < 0 or accuracy > 100:
        return "Not valid"
    else:
        if accuracy >= 90:
            return "A"
        elif accuracy < 90 and accuracy > 79:
            return "B"
        elif accuracy < 80 and accuracy > 69:
            return "C"
        elif accuracy < 70 and accuracy > 59:
            return "D"
        else:
            return "F"
    
name = input("Please enter the agent's name: ")
current_accuracy = float(input("Current accuracy: "))
training_rounds = int(input("Training rounds: "))


new_accuracy = current_accuracy + get_improvement(training_rounds)
if new_accuracy > 100:
     new_accuracy = min(new_accuracy, 100)

print("\nEVOLVAI AGENT EVOLUTION")
print("-" * 35)
print(f"Name: {name}")
print(f"{current_accuracy:.2f}% -> {new_accuracy:.2f}% | {get_grade(current_accuracy)} -> {get_grade(new_accuracy)}")