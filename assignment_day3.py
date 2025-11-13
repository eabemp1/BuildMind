name = input("Please enter your full name: ")
correct_num = input("Number of correct answers: ")
Total_num = input("Total number of Questions: ")

Accuracy = (float(correct_num) / float(Total_num)) * 100

print("Name: " + name)
if Accuracy >= 90:
    print("A")
elif Accuracy >= 80:
    print("B")
elif Accuracy >= 70:
    print("C")
elif Accuracy >= 60:
    print("C")
else:
    print("F")