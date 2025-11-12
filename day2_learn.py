# day2.py - I learned input, print, if/else

name = input("Your name: ")
print("Hello " + name + "!")

age = input("Your age: ")
age_num = int(age)

if age_num >= 18:
    print("You're an adult!")
else:
    print("You're a minor!")