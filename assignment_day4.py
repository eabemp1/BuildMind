# A list called squad to contain my agents

squad = []

# User inputs three agents with accuracy scores and it is stored

Name1 = input("Please input the agent's name: ")
Accuracy1 = float(input("What is the accuracy score(Decimals are allowed): "))

# Update the list with the stored data
squad.append([Name1, Accuracy1])

# User inputs three agents with accuracy scores and it is stored

Name2 = input("Please input the agent's name: ")
Accuracy2 = float(input("What is the accuracy score(Decimals are allowed): "))

# Update the list with the stored data
squad.append([Name2, Accuracy2])

# User inputs three agents with accuracy scores and it is stored

Name3 = input("Please input the agent's name: ")
Accuracy3 = float(input("What is the accuracy score(Decimals are allowed): "))

# Update the list with the stored data
squad.append([Name3, Accuracy3])


print("\nEVOLVAI SQUAD REPORT")
print("-" * 35)
print(f"{Name1} -> : {Accuracy1:.2f}%")
print(f"{Name2} -> : {Accuracy2:.2f}%")
print(f"{Name3} -> : {Accuracy3:.2f}%")
print("-" * 35)
print(F"Total Agents: {len(squad)}")