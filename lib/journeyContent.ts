/**
 * lib/journeyContent.ts — Learn + Practice content for the Developer Journey.
 *
 * This is the piece that was missing before: lib/journeyCurriculum.ts only
 * ever held topic LABELS ("strings", "loops") — never actual lesson text or
 * exercises a student could work through. This file is that content.
 *
 * Scope decision, stated plainly: this is real instructional content for
 * all 16 modules, but it's necessarily concise (a working explanation plus
 * 2 practice exercises per module) rather than a full textbook chapter per
 * module — that's a multi-week authoring project on its own. If a lesson
 * here feels thin for a module she's actively struggling with, that's a
 * signal to expand that specific one, not a sign the whole file needs a
 * rewrite.
 *
 * Static content, same pattern as journeyCurriculum.ts — not a database
 * table. Completion is tracked separately (see lib/journey.ts's
 * completeLesson/completeExercise), keyed by the `id` fields below, so
 * these ids are stable identifiers — don't rename them without a plan for
 * what happens to a student's existing completion history.
 */

export interface JourneyLesson {
  id: string;
  moduleOrder: number;
  title: string;
  /** Plain-text paragraphs — rendered as-is, no markdown parser wired up yet. */
  body: string[];
  keyTakeaways: string[];
}

export interface JourneyExercise {
  id: string;
  moduleOrder: number;
  prompt: string;
  hint: string;
}

export const JOURNEY_LESSONS: JourneyLesson[] = [
  {
    id: "m1-fundamentals",
    moduleOrder: 1,
    title: "Python Fundamentals",
    body: [
      "A Python program is a sequence of instructions the interpreter runs top to bottom. Variables are just names pointing at values — `age = 25` doesn't declare a type, it just points the name `age` at the integer 25. Python figures out the type from the value.",
      "The core types you'll use constantly: int (whole numbers), float (decimals), str (text, in quotes), and bool (True/False). Use type() on anything you're unsure about — type(age) tells you exactly what you're working with.",
      "input() always returns a string, even if the person types a number — that's the single most common beginner bug. `age = input('Age: ')` then `age + 1` will crash, because you're adding an int to a string. You need `age = int(input('Age: '))` to convert it first.",
      "Operators (+, -, *, /, //, %, **) follow the math order of operations you already know: parentheses first, then power, then multiply/divide, then add/subtract. When in doubt, add parentheses — it costs nothing and removes ambiguity for you and anyone reading it later.",
    ],
    keyTakeaways: [
      "input() returns a string — convert it (int(), float()) before doing math with it",
      "Variables have no fixed type in Python — the value determines the type, not a declaration",
      "// is integer division, % is remainder (modulo) — both come up constantly",
    ],
  },
  {
    id: "m2-decisions",
    moduleOrder: 2,
    title: "Decision Making",
    body: [
      "if/elif/else lets your program take different paths depending on a condition. Only one branch runs — Python checks the if first, then each elif in order, and only falls to else if none matched.",
      "Comparison operators (==, !=, <, >, <=, >=) produce a bool. A very common bug: using = (assignment) where you meant == (comparison) — Python will actually stop you here with a syntax error in an if statement, which is one of the few times a crash is doing you a favor.",
      "Compound conditions combine with `and`, `or`, `not`. `and` requires both sides true; `or` needs just one. Python short-circuits — in `a and b`, if a is False, b is never even evaluated. That matters when b would otherwise crash (e.g. checking a list isn't empty before indexing into it).",
      "match-case (Python's newer switch-like statement) is worth knowing but if/elif/else is the one you'll reach for by default — match-case shines specifically when you're matching a value against many discrete options.",
    ],
    keyTakeaways: [
      "Only one branch of if/elif/else ever runs, in order, top to bottom",
      "= is assignment, == is comparison — this typo is one of the most common beginner bugs",
      "and/or short-circuit — the second condition isn't checked if the first already decides the answer",
    ],
  },
  {
    id: "m3-loops",
    moduleOrder: 3,
    title: "Iteration and Repetition",
    body: [
      "for loops iterate over something with a known, finite sequence — a range, a list, a string. `for i in range(5):` runs 5 times, with i going 0, 1, 2, 3, 4 (range stops one before the number you give it — another classic off-by-one trap).",
      "while loops run as long as a condition stays true. Use them when you don't know in advance how many times you'll loop — waiting for the right input, searching until found, etc. The #1 while-loop bug: forgetting to update the variable the condition depends on, which loops forever.",
      "break exits the loop immediately, no matter what. continue skips the rest of the current iteration and jumps to the next one. pass does nothing — it's a placeholder for a block you'll fill in later, not a real loop control tool.",
      "Nested loops (a loop inside a loop) are for grid-like or pairwise problems — printing a multiplication table, comparing every item to every other item. The inner loop completes fully for each single pass of the outer loop.",
    ],
    keyTakeaways: [
      "range(5) gives 0-4, not 1-5 — always double check your loop boundaries",
      "A while loop needs something inside it that eventually makes the condition false, or it never ends",
      "break stops the loop entirely; continue just skips to the next iteration",
    ],
  },
  {
    id: "m4-strings",
    moduleOrder: 4,
    title: "Working with Strings",
    body: [
      "Strings are indexed starting at 0 — `word[0]` is the first character. Negative indices count from the end: `word[-1]` is the last character. Slicing `word[2:5]` gives characters from index 2 up to (not including) index 5.",
      "Strings are immutable — you can't change a character in place (`word[0] = 'x'` fails). Instead you build a new string, often with slicing and concatenation, or by using a method that returns a new string.",
      "The methods you'll use constantly: .lower()/.upper() for case, .strip() to remove surrounding whitespace, .split() to break a string into a list, .join() to do the reverse, .replace() to substitute text, and .find()/.count() to search within a string.",
      "f-strings (`f'Hello {name}, you are {age} years old'`) are the cleanest way to build strings with variables mixed in — far more readable than concatenating with +, and they let you do formatting inline, like f'{price:.2f}' for two decimal places.",
    ],
    keyTakeaways: [
      "Strings are immutable — every 'modification' actually builds and returns a new string",
      "Slicing's end index is exclusive — word[2:5] does NOT include index 5",
      "f-strings are the default way to build strings with variables mixed in",
    ],
  },
  {
    id: "m5-lists",
    moduleOrder: 5,
    title: "Lists and Sequence Processing",
    body: [
      "Lists are ordered, mutable collections — unlike strings, you CAN change an item in place: `grades[0] = 95`. Indexing and slicing work the same way as strings.",
      ".append() adds one item to the end. .insert(index, item) puts it at a specific position. .remove(value) removes the first matching value; del list[index] removes by position. .sort() sorts in place (changes the original); sorted(list) returns a new sorted list without touching the original — knowing which one you're using matters.",
      "Traversal is just a for loop: `for grade in grades:`. If you need the index too, use enumerate: `for i, grade in enumerate(grades):` — much cleaner than manually tracking a counter variable.",
      "Tuples look like lists but are immutable — once created, you can't change them. Use a tuple when the collection shouldn't change after creation (coordinates, RGB values); use a list when it should (a running collection you build up or modify).",
    ],
    keyTakeaways: [
      "Lists are mutable (change in place); tuples are immutable — pick based on whether the data should ever change",
      ".sort() changes the list in place; sorted() returns a new list and leaves the original alone",
      "enumerate() gives you index + value together — cleaner than a manual counter",
    ],
  },
  {
    id: "m6-dicts-sets",
    moduleOrder: 6,
    title: "Dictionaries and Sets",
    body: [
      "A dictionary maps keys to values: `contact = {'name': 'Ama', 'phone': '024...'}`. Access with `contact['name']`, or safer, `contact.get('name')` — .get() returns None (or a default you specify) instead of crashing if the key doesn't exist.",
      "Iterate with `for key in contact:`, or `for key, value in contact.items():` when you need both. .keys() and .values() give you just one side when that's all you need.",
      "Sets store unique values with no order and no duplicates — `{1, 2, 2, 3}` becomes `{1, 2, 3}`. They're the right tool specifically when you need fast membership checks ('is this value already in here?') or to eliminate duplicates from a collection.",
      "Choosing the right structure is the actual skill here: use a list when order matters and duplicates are fine; a dict when you're looking things up by a key; a set when you only care about uniqueness and don't care about order.",
    ],
    keyTakeaways: [
      "dict.get(key) is safer than dict[key] — it won't crash on a missing key",
      "Sets automatically remove duplicates and don't preserve order",
      "Picking list vs dict vs set is about what operation you'll do most: sequence, lookup, or uniqueness",
    ],
  },
  {
    id: "m7-functions",
    moduleOrder: 7,
    title: "Functions and Program Decomposition",
    body: [
      "A function is a named, reusable block: `def greet(name):` ... `return f'Hello {name}'`. Parameters are the names inside the parentheses in the definition; arguments are the actual values you pass when calling it.",
      "return sends a value back to whoever called the function and immediately exits the function — code after a return in the same branch never runs. A function with no return statement returns None.",
      "Default parameters (`def greet(name, greeting='Hello'):`) let a caller omit an argument and get a sensible default. Keyword arguments (`greet(name='Ama', greeting='Hi')`) let you pass arguments by name instead of position — useful when a function takes several parameters and you want the call to stay readable.",
      "Scope: a variable created inside a function only exists inside that function (local scope) — it doesn't leak out, and it doesn't automatically see variables from outside unless they're passed in as parameters. This is a feature, not a limitation — it's what lets you reuse a function without it clashing with unrelated code.",
    ],
    keyTakeaways: [
      "return exits the function immediately and sends a value back — code after it in that branch never runs",
      "Variables created inside a function are local to it — they don't exist outside",
      "If a function is hard to name clearly, it's probably doing too much — split it",
    ],
  },
  {
    id: "m8-exceptions",
    moduleOrder: 8,
    title: "Exception Handling and Debugging",
    body: [
      "Three kinds of errors: syntax errors (the code isn't valid Python — caught before it even runs), runtime errors/exceptions (valid code that fails while running — dividing by zero, converting 'abc' to int), and logic errors (the code runs fine but produces the wrong answer — the hardest kind to catch, since nothing crashes).",
      "try/except catches exceptions so your program can recover instead of crashing: `try: risky_thing() except ValueError: handle_it()`. Catch specific exception types when you can — catching bare `except:` hides bugs you'd actually want to know about.",
      "else runs only if the try block succeeded with no exception; finally always runs, exception or not — the classic use is closing a file or connection regardless of what happened.",
      "Reading a traceback: read the LAST line first — that's the actual error and message. Then read upward — that's the call chain that led there. Most beginners read top to bottom and get lost; read bottom to top for the fastest diagnosis.",
    ],
    keyTakeaways: [
      "Read tracebacks bottom-to-top: the last line is the error, the lines above are how you got there",
      "Catch specific exception types (ValueError, ZeroDivisionError) rather than a bare except — it hides real bugs otherwise",
      "finally always runs regardless of whether an exception happened — use it for cleanup",
    ],
  },
  {
    id: "m9-files",
    moduleOrder: 9,
    title: "File Handling and Persistent Data",
    body: [
      "Without saving to a file, everything a program does disappears the moment it closes. `with open('data.txt', 'r') as f:` opens a file for reading; 'w' opens (and overwrites) for writing; 'a' appends without erasing existing content.",
      "Always use `with open(...) as f:` rather than a bare open()/close() pair — the `with` block automatically closes the file even if an error happens inside it, which a manual close() call won't do if the error happens before it.",
      "CSV files are just text with commas separating values — Python's csv module handles the parsing (quoted commas, etc.) so you don't hand-split on commas yourself, which breaks the moment a value contains a comma.",
      "JSON maps directly onto Python's dicts and lists — json.load()/json.dump() convert between a JSON file and Python data with almost no extra code, which makes it the natural choice for saving structured data like a list of contacts or settings.",
    ],
    keyTakeaways: [
      "Always use `with open(...) as f:` — it guarantees the file closes even if something goes wrong inside",
      "Don't hand-parse CSV by splitting on commas — use the csv module, it handles edge cases you haven't hit yet",
      "JSON maps almost one-to-one onto Python dicts/lists — it's the easiest format for structured data",
    ],
  },
  {
    id: "m10-modules",
    moduleOrder: 10,
    title: "Modules, Packages and Libraries",
    body: [
      "A module is just a .py file you can import: `import math` gives you math.sqrt(), math.pi, etc. `from math import sqrt` imports just that one name, so you can call sqrt() directly without the math. prefix.",
      "You can write your own modules — any .py file can be imported by another as long as they're in the same project. This is how program decomposition (splitting into functions) extends to splitting into separate files as a project grows.",
      "The standard library ships with Python and covers an enormous amount of ground: random (randomness), datetime (dates/times), os and pathlib (filesystem), statistics (basic stats). Before writing something from scratch, check if the standard library already has it — it usually does, and it's already tested.",
      "A package is a folder of modules with an `__init__.py` file, letting you organize related modules together — you won't need this much yet, but it's the next step up once a single file starts feeling too large.",
    ],
    keyTakeaways: [
      "`from module import name` lets you skip the module. prefix for that one name",
      "Check the standard library before writing something from scratch — math, random, datetime, os cover a lot",
      "Your own .py files can be imported just like standard library modules",
    ],
  },
  {
    id: "m11-oop",
    moduleOrder: 11,
    title: "Object-Oriented Programming",
    body: [
      "A class is a blueprint; an object (instance) is a specific thing built from it. `class Book:` with an `__init__(self, title, author):` constructor sets up what every Book has when created — `self` refers to the specific instance being built or used.",
      "Encapsulation means keeping an object's internal data and the methods that operate on it together, and controlling access to it — rather than scattering related data and functions across the program disconnected from each other.",
      "Inheritance lets one class build on another: `class EBook(Book):` gets everything Book has, plus whatever EBook adds or overrides. Use inheritance for a genuine 'is-a' relationship (an EBook IS a Book). If the relationship is really 'has-a' (a Library HAS Books), use composition instead — store Book objects inside Library rather than inheriting from Book.",
      "Polymorphism means different classes can respond to the same method call in their own way — if both Book and EBook define a display() method, calling display() on either works without the caller needing to know which specific type it's dealing with.",
    ],
    keyTakeaways: [
      "self refers to the specific instance — it's what lets each object keep its own separate data",
      "Inheritance is for 'is-a' relationships; composition (objects containing other objects) is for 'has-a'",
      "Mixing up inheritance and composition is the most common OOP design mistake at this stage",
    ],
  },
  {
    id: "m12-algorithms",
    moduleOrder: 12,
    title: "Algorithms and Data Structures",
    body: [
      "Linear search checks every item one by one — simple, always works, but slow on large data (O(n)). Binary search is much faster (O(log n)) but only works on already-sorted data — it repeatedly halves the search range by comparing against the middle element.",
      "Sorting algorithms (bubble, selection, insertion) are worth implementing by hand once, purely to understand HOW sorting works — in real code you'll almost always just call .sort() or sorted(), which use a much faster algorithm than any of these three.",
      "A stack is last-in-first-out (like a stack of plates — you take from the top). A queue is first-in-first-out (like a line at a store). Python lists can act as either with .append()/.pop() for a stack, or collections.deque for an efficient queue.",
      "Complexity (Big O) is a way of describing how an algorithm's running time grows as the input grows — O(n) means roughly linear growth, O(n²) means it grows much faster (a loop inside a loop over the same data). You don't need to calculate it formally yet — just start noticing when you've nested a loop inside a loop over the same collection.",
    ],
    keyTakeaways: [
      "Binary search requires sorted data and is much faster than linear search on large collections",
      "Stack = last-in-first-out; queue = first-in-first-out",
      "A loop inside a loop over the same data is usually O(n²) — worth noticing, not always worth avoiding",
    ],
  },
  {
    id: "m13-intermediate",
    moduleOrder: 13,
    title: "Intermediate Python",
    body: [
      "A list comprehension builds a list in one line: `[x * 2 for x in numbers]` instead of a 4-line for-loop with .append(). They can filter too: `[x for x in numbers if x > 0]`. Use them when they make the code clearer — if the comprehension itself is hard to read, a regular loop is the better choice.",
      "lambda creates a small, unnamed function inline: `lambda x: x * 2`. map() applies a function to every item in a collection; filter() keeps only items where a function returns True. These are most useful as arguments to other functions (like as the `key` in sorted()), less useful as a replacement for a normal named function.",
      "enumerate() (index + value) and zip() (pair up multiple sequences element-by-element) solve two extremely common looping needs — reach for them before writing a manual index counter or manually pairing lists yourself.",
      "A generator (using `yield` instead of `return`) produces values one at a time, on demand, instead of building a whole list in memory at once — useful once you're working with data too large to hold entirely in memory, which likely won't come up yet, but the concept is good to have seen.",
    ],
    keyTakeaways: [
      "List comprehensions are a shorthand for a for-loop that builds a list — use them when they're actually more readable, not automatically",
      "zip() pairs up multiple lists element by element; enumerate() gives you index + value",
      "yield makes a function a generator — it produces values one at a time instead of building a full list upfront",
    ],
  },
  {
    id: "m14-databases",
    moduleOrder: 14,
    title: "Databases with Python",
    body: [
      "A relational database stores data in tables (rows and columns), similar in shape to a spreadsheet, but with real query power. SQLite is a full relational database that lives in a single file — no server to set up, which makes it the right starting point.",
      "The CRUD operations map directly to SQL: CREATE (INSERT INTO), READ (SELECT), UPDATE (UPDATE ... SET), DELETE (DELETE FROM). Learning to read and write basic SQL is a genuinely separate skill from Python — worth practicing the SQL by itself before wiring it into Python code.",
      "Python's sqlite3 module (built into the standard library, no install needed) lets you run SQL from Python: connect to a file, get a cursor, execute() a query, and either commit() (for writes) or fetchall() (for reads).",
      "Always use parameterized queries (`cursor.execute('SELECT * FROM users WHERE name = ?', (name,))`) rather than building SQL strings with f-strings or +. Beyond being safer, it also correctly handles special characters in the data without you having to think about it.",
    ],
    keyTakeaways: [
      "SQLite is a full database in a single file — no server setup, ideal for learning and small projects",
      "CRUD maps directly to SQL: INSERT, SELECT, UPDATE, DELETE",
      "Always use parameterized queries (the ? placeholder), never build SQL strings by hand with + or f-strings",
    ],
  },
  {
    id: "m15-apis",
    moduleOrder: 15,
    title: "Working with APIs",
    body: [
      "An API lets your program request data from someone else's server over the internet. The `requests` library is the standard way to do this in Python: `response = requests.get(url)` sends the request and gets a response back.",
      "Always check response.status_code before trusting the data — 200 means success, 404 means not found, 401/403 mean an authorization problem, 500 means the server itself failed. Don't assume a request worked just because it didn't crash.",
      "response.json() converts a JSON response body into a Python dict/list you can work with directly. Before writing code that assumes a particular shape, print the raw response (or response.json()) once and actually look at it — assuming the shape wrong is the single most common API bug.",
      "Wrap API calls in try/except — the network can fail, time out, or return something unexpected, none of which is under your control, and your program should handle that gracefully rather than crashing.",
    ],
    keyTakeaways: [
      "Check response.status_code before trusting the response — don't assume success just because nothing crashed",
      "Print the raw JSON once and look at the actual shape before writing parsing code for it",
      "Wrap API calls in try/except — network failures are outside your program's control",
    ],
  },
  {
    id: "m16-practices",
    moduleOrder: 16,
    title: "Software Development Practices",
    body: [
      "Clean code means someone else (including future-you) can read it without you explaining it out loud. Consistent naming, small functions with one clear job, and comments that explain WHY (not what — the code already shows what) are the highest-leverage habits here.",
      "Docstrings (`\"\"\"Explains what this function does.\"\"\"` right under a def) document a function's purpose, parameters, and return value in a way tools and other developers can actually find, unlike a regular comment above it.",
      "Unit tests check that a specific piece of code produces the expected output for a given input, automatically, every time — instead of manually re-testing by hand after every change. Even a handful of tests on your trickiest functions catches regressions before they become a live bug.",
      "Git tracks every change to your code over time and lets you undo mistakes, work on features without breaking the working version, and (with GitHub) back your work up and share it. The core loop you'll use constantly: git add, git commit, git push. Commit often, with a message that says what changed and why.",
    ],
    keyTakeaways: [
      "Docstrings document what a function does in a way tools can surface — comments alone can't do that",
      "A few tests on your trickiest functions catch regressions automatically, without manual re-checking",
      "Commit often with clear messages — git history is only useful if you can actually tell what each commit did",
    ],
  },
];

export const JOURNEY_EXERCISES: JourneyExercise[] = [
  { id: "m1-ex1", moduleOrder: 1, prompt: "Write a program that asks for someone's name and birth year, then prints a sentence stating their approximate age (current year minus birth year).", hint: "Remember input() returns a string — you'll need int() before subtracting." },
  { id: "m1-ex2", moduleOrder: 1, prompt: "Ask for a temperature in Celsius and convert it to Fahrenheit (F = C * 9/5 + 32), printing the result rounded to 1 decimal place.", hint: "round(value, 1) rounds to one decimal place." },
  { id: "m2-ex1", moduleOrder: 2, prompt: "Write a program that takes a number and prints whether it's positive, negative, or zero, using if/elif/else.", hint: "Check the zero case first, or you might accidentally treat 0 as neither positive nor negative correctly." },
  { id: "m2-ex2", moduleOrder: 2, prompt: "Ask for a person's age and whether they have a student ID (yes/no), then decide if they qualify for a student discount (age under 25 AND has a student ID).", hint: "This needs an `and` — both conditions must be true." },
  { id: "m3-ex1", moduleOrder: 3, prompt: "Print the multiplication table for a number the user provides, from 1x to 10x, using a for loop.", hint: "for i in range(1, 11): — remember range's upper bound is exclusive." },
  { id: "m3-ex2", moduleOrder: 3, prompt: "Write a program that keeps asking the user to guess a secret number (pick one yourself) until they get it right, using a while loop, telling them 'higher' or 'lower' after each guess.", hint: "The while condition should check whether the guess equals the secret number." },
  { id: "m4-ex1", moduleOrder: 4, prompt: "Write a function that takes a sentence and returns it with every word capitalized, without using .title() (use .split(), a loop, and .join()).", hint: "Split into words, capitalize each one's first letter, then join back with spaces." },
  { id: "m4-ex2", moduleOrder: 4, prompt: "Write a function that checks whether a given string is a palindrome (reads the same forwards and backwards), ignoring case and spaces.", hint: "Strip spaces and lowercase the string first, then compare it to its reverse (string[::-1])." },
  { id: "m5-ex1", moduleOrder: 5, prompt: "Given a list of exam scores, write code that prints the highest, lowest, and average score without using max()/min() — loop through and track them yourself.", hint: "Start your 'highest so far' variable as the first item in the list, then compare each subsequent item to it." },
  { id: "m5-ex2", moduleOrder: 5, prompt: "Write a function that removes duplicate values from a list while preserving the original order (don't just convert to a set, which loses order).", hint: "Build a new empty list, and only append an item if it's not already in the new list." },
  { id: "m6-ex1", moduleOrder: 6, prompt: "Build a dictionary counting how many times each word appears in a sentence.", hint: "For each word, use dict.get(word, 0) + 1 to handle both new and existing words in one line." },
  { id: "m6-ex2", moduleOrder: 6, prompt: "Given two lists of names, use sets to find which names appear in both lists.", hint: "Convert both lists to sets and use the & operator (or .intersection())." },
  { id: "m7-ex1", moduleOrder: 7, prompt: "Write a function is_prime(n) that returns True if n is a prime number, False otherwise.", hint: "Check divisibility from 2 up to n — if nothing divides evenly, it's prime. (You can stop checking once you pass the square root of n, if you want the more efficient version.)" },
  { id: "m7-ex2", moduleOrder: 7, prompt: "Write a function that takes a list of numbers and returns a new list with only the even numbers, without using a list comprehension.", hint: "Build an empty result list, loop through the input, and append when number % 2 == 0." },
  { id: "m8-ex1", moduleOrder: 8, prompt: "Write a function safe_divide(a, b) that returns a/b, but catches ZeroDivisionError and returns None instead of crashing.", hint: "try: return a / b, except ZeroDivisionError: return None." },
  { id: "m8-ex2", moduleOrder: 8, prompt: "Write a loop that keeps asking the user for a number until they enter a valid one, catching ValueError if they type something that isn't a number.", hint: "Put the int(input(...)) call inside a try block, inside a while True loop, and break once it succeeds." },
  { id: "m9-ex1", moduleOrder: 9, prompt: "Write a program that appends a new to-do item (as a line of text) to a file called todos.txt each time it runs, without erasing previous entries.", hint: "Open the file in 'a' (append) mode, not 'w' (write), which would erase it." },
  { id: "m9-ex2", moduleOrder: 9, prompt: "Write a program that saves a dictionary of settings to a JSON file, then a second function that loads it back and prints it.", hint: "json.dump(data, f) to save, json.load(f) to load — both need the file opened first." },
  { id: "m10-ex1", moduleOrder: 10, prompt: "Using the random module, write a simple dice-rolling function that returns a random integer between 1 and 6.", hint: "random.randint(1, 6) — note this is inclusive on both ends, unlike range()." },
  { id: "m10-ex2", moduleOrder: 10, prompt: "Using the datetime module, write a function that prints how many days remain until a given date.", hint: "Subtracting two datetime.date objects gives you a timedelta, which has a .days attribute." },
  { id: "m11-ex1", moduleOrder: 11, prompt: "Create a class BankAccount with a balance, and deposit()/withdraw() methods. withdraw() should refuse to overdraw the account.", hint: "Check the amount against self.balance before subtracting inside withdraw()." },
  { id: "m11-ex2", moduleOrder: 11, prompt: "Create a base class Animal with a speak() method, then two subclasses Dog and Cat that override speak() with their own sound.", hint: "Each subclass just needs its own def speak(self): with different return text — that's polymorphism in action." },
  { id: "m12-ex1", moduleOrder: 12, prompt: "Implement binary search yourself as a function (don't use a library) that returns the index of a target value in a sorted list, or -1 if not found.", hint: "Track a low and high boundary, check the middle each time, and narrow the range based on whether the target is higher or lower." },
  { id: "m12-ex2", moduleOrder: 12, prompt: "Implement a simple stack using a Python list (push = append, pop = pop) and use it to check whether a string of brackets like '(())' is balanced.", hint: "Push on every opening bracket, pop on every closing one — if you ever try to pop an empty stack, or the stack isn't empty at the end, it's unbalanced." },
  { id: "m13-ex1", moduleOrder: 13, prompt: "Rewrite one of your Module 5 or 6 exercises using a list comprehension instead of a for loop.", hint: "The pattern is [expression for item in iterable if condition] — the 'if' part is optional." },
  { id: "m13-ex2", moduleOrder: 13, prompt: "Use zip() and a loop to print each student's name next to their grade, given two separate lists (names and grades) in matching order.", hint: "for name, grade in zip(names, grades): print(f'{name}: {grade}')" },
  { id: "m14-ex1", moduleOrder: 14, prompt: "Create a SQLite database with a 'students' table (id, name, grade), insert three rows, then write a query that selects everyone with a grade above 70.", hint: "Use a parameterized query even though you're hardcoding the value here — it's the habit that matters." },
  { id: "m14-ex2", moduleOrder: 14, prompt: "Write a function update_grade(student_id, new_grade) that updates a single student's grade in the database.", hint: "UPDATE students SET grade = ? WHERE id = ? — don't forget conn.commit() after an UPDATE or the change won't actually save." },
  { id: "m15-ex1", moduleOrder: 15, prompt: "Use requests to fetch data from a free public API (e.g. a joke API or a weather API) and print one field from the JSON response.", hint: "Print response.json() first and look at the actual structure before writing code that assumes a specific key exists." },
  { id: "m15-ex2", moduleOrder: 15, prompt: "Add error handling to your API call from the previous exercise: check status_code and handle the case where the request fails or times out.", hint: "requests.get(url, timeout=5) with a try/except around it, checking response.status_code == 200 before parsing." },
  { id: "m16-ex1", moduleOrder: 16, prompt: "Write docstrings for the three most important functions in your current project, and one unit test for whichever function has the trickiest logic.", hint: "A docstring is a triple-quoted string right under the def line — it should explain what the function does, its parameters, and what it returns." },
  { id: "m16-ex2", moduleOrder: 16, prompt: "If you haven't already, initialize a git repository for your current project, make at least 3 separate commits with clear messages, and push it to GitHub.", hint: "git init, git add ., git commit -m 'message', then create a repo on GitHub and git push." },
];

export function getLessonsForModule(moduleOrder: number): JourneyLesson[] {
  return JOURNEY_LESSONS.filter((l) => l.moduleOrder === moduleOrder);
}

export function getExercisesForModule(moduleOrder: number): JourneyExercise[] {
  return JOURNEY_EXERCISES.filter((e) => e.moduleOrder === moduleOrder);
}

export function getLessonById(id: string): JourneyLesson | undefined {
  return JOURNEY_LESSONS.find((l) => l.id === id);
}

export function getExerciseById(id: string): JourneyExercise | undefined {
  return JOURNEY_EXERCISES.find((e) => e.id === id);
}
