# assignment_day4.py - EvolvAI Squad (Manual, No Loops)

# 1. Create empty list
squad = []

# 2. Add Agent 1
name1 = input("Agent 1 name: ")
acc1 = float(input("Agent 1 accuracy (0-100): "))
squad.append([name1, acc1])

# 3. Add Agent 2
name2 = input("Agent 2 name: ")
acc2 = float(input("Agent 2 accuracy (0-100): "))
squad.append([name2, acc2])

# 4. Add Agent 3
name3 = input("Agent 3 name: ")
acc3 = float(input("Agent 3 accuracy (0-100): "))
squad.append([name3, acc3])

# 5. Print squad
print("\nEvolvAI Squad Report")
print("─" * 30)
print(f"1. {squad[0][0]}: {squad[0][1]:.1f}%")
print(f"2. {squad[1][0]}: {squad[1][1]:.1f}%")
print(f"3. {squad[2][0]}: {squad[2][1]:.1f}%")
print(f"Total agents: {len(squad)}")