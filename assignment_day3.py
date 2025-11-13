# assignment_day3.py - EvolvAI Agent Score Calculator

name = input("Please enter your full name: ")
correct_input = input("Number of correct answers: ")
total_input = input("Total number of questions: ")
training_rounds_completed = int(input("Please enter the number of training rounds completed: "))
# Convert to float
correct = float(correct_input)
total = float(total_input)

# --- FIX: Check for zero BEFORE division ---
if total == 0:
    print("Name:", name)
    print("Error: Total questions cannot be zero.")
else:
    # Safe to calculate
    accuracy = (correct / total) * 100


    # Grade
if accuracy >= 90:
        print("Grade: A")
elif accuracy >= 80:
        print("Grade: B")
elif accuracy >= 70:
        print("Grade: C")
elif accuracy >= 60:
        print("Grade: D")
else:
        print("Grade: F")

if training_rounds_completed < 5:
    improvement = 8.5
elif training_rounds_completed < 10:
    improvement = 5.0
elif training_rounds_completed < 20:
    improvement = 2.5
else:
    improvement = 0.5  # Agent is almost maxed out

New_accuracy = accuracy + improvement
if New_accuracy > 100:
      New_accuracy = 100.0

print("EvolvAI Agent Evolution Tracker")
print("_______________________________")    
print(f"Accuracy: {accuracy:.2f}%")
print(f"Training: {training_rounds_completed} rounds")
print(f"Improvement: {improvement}%")
print(f"Predicted: {New_accuracy}%")



