/**
 * lib/journeyContent.ts — Learn + Practice content for the Developer Journey.
 *
 * Second pass, deepened deliberately (first pass was 4 paragraphs + 2 flat
 * exercises per module — not enough to build real competence). Each
 * lesson now has: why the concept matters for actually becoming a
 * developer (not just passing the module), the concept explanation, one
 * real runnable code example, and the specific mistakes beginners make
 * with this exact material — not generic advice, things that actually
 * happen. Each module has 3 exercises on a graduated arc (warmup → core →
 * stretch) rather than 2 flat ones, so difficulty ramps within a module,
 * not just across modules.
 *
 * Still static content, not a database table — see file header rationale
 * in the original design (matches lib/achievements.ts's ACHIEVEMENTS
 * pattern). Ids are stable identifiers used for completion tracking in
 * lib/journey.ts — don't rename them without a migration plan for
 * existing completion history.
 */

export interface CodeExample {
  caption: string;
  code: string;
}

export interface JourneyLesson {
  id: string;
  moduleOrder: number;
  title: string;
  /** Why this concept matters for actually becoming a developer, not just passing the module. */
  whyItMatters: string;
  body: string[];
  codeExample: CodeExample;
  /** Specific, real mistakes beginners make with THIS material — not generic advice. */
  commonMistakes: string[];
  keyTakeaways: string[];
}

export type ExerciseDifficulty = "warmup" | "core" | "stretch";

export interface JourneyExercise {
  id: string;
  moduleOrder: number;
  difficulty: ExerciseDifficulty;
  prompt: string;
  hint: string;
}

export const JOURNEY_LESSONS: JourneyLesson[] = [
  {
    id: "m1-fundamentals",
    moduleOrder: 1,
    title: "Python Fundamentals",
    whyItMatters:
      "Every bug you'll ever debug eventually comes down to a variable holding the wrong type or the wrong value — getting this instinctively right now saves you hours of confusion later.",
    body: [
      "A Python program is a sequence of instructions the interpreter runs top to bottom. Variables are just names pointing at values — `age = 25` doesn't declare a type, it just points the name `age` at the integer 25. Python figures out the type from the value, which is convenient but also the source of most beginner bugs.",
      "The core types you'll use constantly: int (whole numbers), float (decimals), str (text, in quotes), and bool (True/False). Use `type()` on anything you're unsure about — `type(age)` tells you exactly what you're working with, and getting in the habit of checking early saves debugging time later.",
      "`input()` always returns a string, even if the person types a number — that's the single most common beginner bug. `age = input('Age: ')` then `age + 1` will crash, because you're adding an int to a string. You need `age = int(input('Age: '))` to convert it first.",
      "Operators (+, -, *, /, //, %, **) follow the math order of operations you already know: parentheses first, then power, then multiply/divide, then add/subtract. When in doubt, add parentheses — it costs nothing and removes ambiguity for you and anyone reading it later.",
    ],
    codeExample: {
      caption: "Converting input before doing math with it",
      code:
        "name = input('What is your name? ')\n" +
        "age_text = input('What is your age? ')\n" +
        "age = int(age_text)  # convert BEFORE doing math\n\n" +
        "years_to_100 = 100 - age\n" +
        "print(f'{name}, you will turn 100 in {years_to_100} years.')",
    },
    commonMistakes: [
      "Trying to do math on the raw result of input() without converting it first — crashes with a TypeError",
      "Confusing / (always gives a float) with // (integer division, drops the remainder)",
      "Forgetting that variable names are case-sensitive — Age and age are two different variables",
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
    whyItMatters:
      "Almost every real program is a pile of decisions — 'if the user is logged in,' 'if the payment succeeded,' 'if the file exists.' This is the first module where your code actually thinks.",
    body: [
      "if/elif/else lets your program take different paths depending on a condition. Only one branch runs — Python checks the if first, then each elif in order, and only falls to else if none matched. Order matters: put your most specific conditions first.",
      "Comparison operators (==, !=, <, >, <=, >=) produce a bool. A very common bug: using = (assignment) where you meant == (comparison) — Python will actually stop you here with a syntax error inside an if statement, which is one of the few times a crash is doing you a favor.",
      "Compound conditions combine with `and`, `or`, `not`. `and` requires both sides true; `or` needs just one. Python short-circuits — in `a and b`, if `a` is False, `b` is never even evaluated. That matters when `b` would otherwise crash (e.g. checking a list isn't empty before indexing into it).",
      "match-case (Python's newer switch-like statement) is worth knowing, but if/elif/else is what you'll reach for by default — match-case shines specifically when you're matching a value against many discrete options.",
    ],
    codeExample: {
      caption: "Short-circuiting to avoid a crash",
      code:
        "scores = []\n\n" +
        "# Safe: 'and' short-circuits, so len(scores) > 0 is checked first\n" +
        "if len(scores) > 0 and scores[0] > 90:\n" +
        "    print('Great start!')\n" +
        "else:\n" +
        "    print('No scores yet, or the first one was not above 90.')",
    },
    commonMistakes: [
      "Writing `if x = 5:` instead of `if x == 5:` (Python catches this one for you with a syntax error)",
      "Chaining conditions like `if 0 < x < 10 and 5:` where the intent is unclear even though it runs",
      "Checking `scores[0] > 90 and len(scores) > 0` — order matters, this crashes on an empty list because the index is checked first",
    ],
    keyTakeaways: [
      "Only one branch of if/elif/else ever runs, in order, top to bottom",
      "= is assignment, == is comparison — this typo is one of the most common beginner bugs",
      "and/or short-circuit — order your conditions so the safe check comes first",
    ],
  },
  {
    id: "m3-loops",
    moduleOrder: 3,
    title: "Iteration and Repetition",
    whyItMatters:
      "Repetition is where computers actually save you time over doing something by hand — processing a thousand rows, retrying a connection, validating every field in a form. Loops are the difference between a script and a calculator.",
    body: [
      "for loops iterate over something with a known, finite sequence — a range, a list, a string. `for i in range(5):` runs 5 times, with i going 0, 1, 2, 3, 4 (range stops one before the number you give it — another classic off-by-one trap).",
      "while loops run as long as a condition stays true. Use them when you don't know in advance how many times you'll loop — waiting for the right input, searching until found, etc. The #1 while-loop bug: forgetting to update the variable the condition depends on, which loops forever.",
      "break exits the loop immediately, no matter what. continue skips the rest of the current iteration and jumps to the next one. pass does nothing — it's a placeholder for a block you'll fill in later, not a real loop control tool.",
      "Nested loops (a loop inside a loop) are for grid-like or pairwise problems — printing a multiplication table, comparing every item to every other item. The inner loop completes fully for each single pass of the outer loop, so a 10x10 nested loop runs the inner body 100 times, not 20.",
    ],
    codeExample: {
      caption: "A while loop that correctly updates its own condition",
      code:
        "attempts = 0\n" +
        "max_attempts = 3\n" +
        "correct = False\n\n" +
        "while attempts < max_attempts and not correct:\n" +
        "    guess = input('Guess the number (1-10): ')\n" +
        "    correct = guess == '7'\n" +
        "    attempts += 1  # without this line, the loop never ends\n\n" +
        "print('Correct!' if correct else 'Out of attempts.')",
    },
    commonMistakes: [
      "Writing a while loop and forgetting to update the variable it depends on — an infinite loop",
      "Off-by-one errors with range() — using range(1, 5) when you meant 5 iterations, not 4",
      "Using break inside a nested loop expecting it to exit BOTH loops — it only exits the innermost one",
    ],
    keyTakeaways: [
      "range(5) gives 0-4, not 1-5 — always double check your loop boundaries",
      "A while loop needs something inside it that eventually makes the condition false, or it never ends",
      "break only exits the loop it's directly inside — a nested loop needs its own exit condition",
    ],
  },
  {
    id: "m4-strings",
    moduleOrder: 4,
    title: "Working with Strings",
    whyItMatters:
      "Almost every program touches text somewhere — usernames, file paths, error messages, user input. String manipulation is one of the most-used skills in real day-to-day programming, not a niche topic.",
    body: [
      "Strings are indexed starting at 0 — `word[0]` is the first character. Negative indices count from the end: `word[-1]` is the last character. Slicing `word[2:5]` gives characters from index 2 up to (not including) index 5.",
      "Strings are immutable — you can't change a character in place (`word[0] = 'x'` fails). Instead you build a new string, often with slicing and concatenation, or by using a method that returns a new string.",
      "The methods you'll use constantly: .lower()/.upper() for case, .strip() to remove surrounding whitespace, .split() to break a string into a list, .join() to do the reverse, .replace() to substitute text, and .find()/.count() to search within a string.",
      "f-strings (`f'Hello {name}, you are {age} years old'`) are the cleanest way to build strings with variables mixed in — far more readable than concatenating with +, and they let you do formatting inline, like `f'{price:.2f}'` for two decimal places.",
    ],
    codeExample: {
      caption: "Cleaning and formatting user input with strings",
      code:
        "raw = '  Ama OSAFO  '\n" +
        "clean = raw.strip().title()  # 'Ama Osafo'\n\n" +
        "first, last = clean.split(' ')\n" +
        "username = f'{first.lower()}.{last.lower()}'\n" +
        "print(username)  # ama.osafo",
    },
    commonMistakes: [
      "Trying to modify a string in place (`word[0] = 'X'`) instead of building a new one",
      "Forgetting .strip() on user input and getting mismatched comparisons because of trailing spaces",
      "Off-by-one confusion in slicing — word[2:5] does NOT include the character at index 5",
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
    whyItMatters:
      "Lists are how you hold a collection of anything — every row of a spreadsheet, every item in a shopping cart, every score in a gradebook. This is the module where 'a bunch of related data' becomes something you can actually work with.",
    body: [
      "Lists are ordered, mutable collections — unlike strings, you CAN change an item in place: `grades[0] = 95`. Indexing and slicing work the same way as strings.",
      ".append() adds one item to the end. .insert(index, item) puts it at a specific position. .remove(value) removes the first matching value; del list[index] removes by position. .sort() sorts in place (changes the original); sorted(list) returns a new sorted list without touching the original — knowing which one you're using matters.",
      "Traversal is just a for loop: `for grade in grades:`. If you need the index too, use enumerate: `for i, grade in enumerate(grades):` — much cleaner than manually tracking a counter variable.",
      "Tuples look like lists but are immutable — once created, you can't change them. Use a tuple when the collection shouldn't change after creation (coordinates, RGB values); use a list when it should (a running collection you build up or modify).",
    ],
    codeExample: {
      caption: "Finding the highest score and its position",
      code:
        "grades = [88, 95, 72, 95, 81]\n\n" +
        "highest = grades[0]\n" +
        "highest_index = 0\n" +
        "for i, grade in enumerate(grades):\n" +
        "    if grade > highest:\n" +
        "        highest = grade\n" +
        "        highest_index = i\n\n" +
        "print(f'Highest score: {highest} at position {highest_index}')",
    },
    commonMistakes: [
      "Using .sort() when you meant sorted() (or vice versa) — one mutates the original, the other doesn't",
      "Modifying a list while looping over it directly, which skips elements unpredictably",
      "Using a mutable list as a default function argument, which silently persists between calls (a well-known Python gotcha you'll hit eventually)",
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
    whyItMatters:
      "Real data is rarely a flat list — it's records with named fields (a contact has a name AND a phone AND an email). Dictionaries are how almost every API response and config file is shaped, so this module is directly transferable to real work.",
    body: [
      "A dictionary maps keys to values: `contact = {'name': 'Ama', 'phone': '024...'}`. Access with `contact['name']`, or safer, `contact.get('name')` — .get() returns None (or a default you specify) instead of crashing if the key doesn't exist.",
      "Iterate with `for key in contact:`, or `for key, value in contact.items():` when you need both. .keys() and .values() give you just one side when that's all you need.",
      "Sets store unique values with no order and no duplicates — `{1, 2, 2, 3}` becomes `{1, 2, 3}`. They're the right tool specifically when you need fast membership checks ('is this value already in here?') or to eliminate duplicates from a collection.",
      "Choosing the right structure is the actual skill here: use a list when order matters and duplicates are fine; a dict when you're looking things up by a key; a set when you only care about uniqueness and don't care about order.",
    ],
    codeExample: {
      caption: "Safely reading a dict field that might not exist",
      code:
        "contact = {'name': 'Ama', 'phone': '024-555-0100'}\n\n" +
        "email = contact.get('email', 'no email on file')\n" +
        "print(email)  # 'no email on file' -- no crash, even though 'email' isn't a key",
    },
    commonMistakes: [
      "Using contact['email'] on a key that might not exist and crashing with a KeyError, instead of using .get()",
      "Expecting a dict or set to preserve insertion order the way you'd rely on for a list (dicts do preserve order in modern Python, but sets do not)",
      "Trying to put a list inside a set — sets can only hold immutable (hashable) items",
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
    whyItMatters:
      "This is the module where you stop writing scripts and start writing software. Every real codebase is hundreds of small functions calling each other — learning to break a problem into functions is the actual core skill of programming, more than any specific syntax.",
    body: [
      "A function is a named, reusable block: `def greet(name):` ... `return f'Hello {name}'`. Parameters are the names inside the parentheses in the definition; arguments are the actual values you pass when calling it.",
      "return sends a value back to whoever called the function and immediately exits the function — code after a return in the same branch never runs. A function with no return statement returns None.",
      "Default parameters (`def greet(name, greeting='Hello'):`) let a caller omit an argument and get a sensible default. Keyword arguments (`greet(name='Ama', greeting='Hi')`) let you pass arguments by name instead of position — useful when a function takes several parameters and you want the call to stay readable.",
      "Scope: a variable created inside a function only exists inside that function (local scope) — it doesn't leak out, and it doesn't automatically see variables from outside unless they're passed in as parameters. This is a feature, not a limitation — it's what lets you reuse a function without it clashing with unrelated code.",
    ],
    codeExample: {
      caption: "Decomposing a problem into small functions",
      code:
        "def get_average(numbers):\n" +
        "    return sum(numbers) / len(numbers)\n\n" +
        "def describe_average(numbers):\n" +
        "    avg = get_average(numbers)\n" +
        "    if avg >= 70:\n" +
        "        return f'Average is {avg:.1f} — passing.'\n" +
        "    return f'Average is {avg:.1f} — needs improvement.'\n\n" +
        "print(describe_average([88, 95, 72, 60]))",
    },
    commonMistakes: [
      "Writing one giant function that does everything, instead of splitting it into smaller named pieces",
      "Forgetting return and being surprised the function 'did nothing' (it returned None silently)",
      "Assuming a variable defined inside a function is visible outside it",
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
    whyItMatters:
      "The difference between a toy script and something you'd trust with real users is how it behaves when things go wrong. Every production system spends real engineering effort on this exact module.",
    body: [
      "Three kinds of errors: syntax errors (the code isn't valid Python — caught before it even runs), runtime errors/exceptions (valid code that fails while running — dividing by zero, converting 'abc' to int), and logic errors (the code runs fine but produces the wrong answer — the hardest kind to catch, since nothing crashes).",
      "try/except catches exceptions so your program can recover instead of crashing: `try: risky_thing() except ValueError: handle_it()`. Catch specific exception types when you can — catching bare `except:` hides bugs you'd actually want to know about.",
      "else runs only if the try block succeeded with no exception; finally always runs, exception or not — the classic use is closing a file or connection regardless of what happened.",
      "Reading a traceback: read the LAST line first — that's the actual error and message. Then read upward — that's the call chain that led there. Most beginners read top to bottom and get lost; read bottom to top for the fastest diagnosis.",
    ],
    codeExample: {
      caption: "Catching a specific exception instead of hiding all errors",
      code:
        "def safe_divide(a, b):\n" +
        "    try:\n" +
        "        return a / b\n" +
        "    except ZeroDivisionError:\n" +
        "        print('Cannot divide by zero.')\n" +
        "        return None\n\n" +
        "print(safe_divide(10, 2))  # 5.0\n" +
        "print(safe_divide(10, 0))  # prints the message, returns None",
    },
    commonMistakes: [
      "Using a bare `except:` that swallows every error, including ones you'd want to know about",
      "Reading a traceback top-to-bottom instead of bottom-to-top, and getting lost in the call chain",
      "Wrapping way too much code in one try block, making it unclear which line actually failed",
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
    whyItMatters:
      "Without this module, everything your program does vanishes the moment it closes. Persistence is what turns a demo into a real tool someone can actually use day after day.",
    body: [
      "Without saving to a file, everything a program does disappears the moment it closes. `with open('data.txt', 'r') as f:` opens a file for reading; 'w' opens (and overwrites) for writing; 'a' appends without erasing existing content.",
      "Always use `with open(...) as f:` rather than a bare open()/close() pair — the `with` block automatically closes the file even if an error happens inside it, which a manual close() call won't do if the error happens before it.",
      "CSV files are just text with commas separating values — Python's csv module handles the parsing (quoted commas, etc.) so you don't hand-split on commas yourself, which breaks the moment a value contains a comma.",
      "JSON maps directly onto Python's dicts and lists — json.load()/json.dump() convert between a JSON file and Python data with almost no extra code, which makes it the natural choice for saving structured data like a list of contacts or settings.",
    ],
    codeExample: {
      caption: "Saving and reloading structured data with JSON",
      code:
        "import json\n\n" +
        "contacts = [{'name': 'Ama', 'phone': '024...'}]\n\n" +
        "with open('contacts.json', 'w') as f:\n" +
        "    json.dump(contacts, f)\n\n" +
        "with open('contacts.json', 'r') as f:\n" +
        "    loaded = json.load(f)\n\n" +
        "print(loaded == contacts)  # True",
    },
    commonMistakes: [
      "Opening a file in 'w' mode when you meant to append, and accidentally erasing existing data",
      "Hand-splitting a CSV line on commas instead of using the csv module, and breaking on quoted fields",
      "Forgetting the `with` block and leaving a file handle open, especially in a loop that opens many files",
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
    whyItMatters:
      "No real developer writes everything from scratch. Knowing what's already in the standard library — and how to structure your own code into reusable files — is what lets you build bigger things without the codebase collapsing under its own size.",
    body: [
      "A module is just a .py file you can import: `import math` gives you math.sqrt(), math.pi, etc. `from math import sqrt` imports just that one name, so you can call sqrt() directly without the math. prefix.",
      "You can write your own modules — any .py file can be imported by another as long as they're in the same project. This is how program decomposition (splitting into functions) extends to splitting into separate files as a project grows.",
      "The standard library ships with Python and covers an enormous amount of ground: random (randomness), datetime (dates/times), os and pathlib (filesystem), statistics (basic stats). Before writing something from scratch, check if the standard library already has it — it usually does, and it's already tested.",
      "A package is a folder of modules with an `__init__.py` file, letting you organize related modules together — you won't need this much yet, but it's the next step up once a single file starts feeling too large.",
    ],
    codeExample: {
      caption: "Splitting logic into its own module",
      code:
        "# file: helpers.py\n" +
        "def format_currency(amount):\n" +
        "    return f'GHS {amount:,.2f}'\n\n" +
        "# file: main.py\n" +
        "from helpers import format_currency\n\n" +
        "print(format_currency(1500))  # GHS 1,500.00",
    },
    commonMistakes: [
      "Writing a utility function from scratch that the standard library already provides (check first)",
      "Naming your own file the same as a standard library module (e.g. `random.py`), which shadows the real one",
      "Importing an entire large module when you only need one function from it, making the code harder to read",
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
    whyItMatters:
      "This is the biggest shift in how you think about code so far — from 'a sequence of steps' to 'a set of things that have data and behavior.' Most real-world Python codebases (and almost every popular framework) are built this way.",
    body: [
      "A class is a blueprint; an object (instance) is a specific thing built from it. `class Book:` with an `__init__(self, title, author):` constructor sets up what every Book has when created — `self` refers to the specific instance being built or used.",
      "Encapsulation means keeping an object's internal data and the methods that operate on it together, and controlling access to it — rather than scattering related data and functions across the program disconnected from each other.",
      "Inheritance lets one class build on another: `class EBook(Book):` gets everything Book has, plus whatever EBook adds or overrides. Use inheritance for a genuine 'is-a' relationship (an EBook IS a Book). If the relationship is really 'has-a' (a Library HAS Books), use composition instead — store Book objects inside Library rather than inheriting from Book.",
      "Polymorphism means different classes can respond to the same method call in their own way — if both Book and EBook define a display() method, calling display() on either works without the caller needing to know which specific type it's dealing with.",
    ],
    codeExample: {
      caption: "A class with a constructor and a method",
      code:
        "class BankAccount:\n" +
        "    def __init__(self, owner, balance=0):\n" +
        "        self.owner = owner\n" +
        "        self.balance = balance\n\n" +
        "    def deposit(self, amount):\n" +
        "        self.balance += amount\n" +
        "        return self.balance\n\n" +
        "acc = BankAccount('Ama')\n" +
        "acc.deposit(500)\n" +
        "print(acc.balance)  # 500",
    },
    commonMistakes: [
      "Forgetting `self` as the first parameter in a method definition",
      "Using inheritance for a 'has-a' relationship where composition would be clearer (e.g. inheriting Library from Book)",
      "Putting logic that belongs to one object inside another class entirely, breaking encapsulation",
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
    whyItMatters:
      "This is where 'I can write code that runs' becomes 'I can write code that runs well.' It's also the module most technical interviews focus on, so it matters beyond just this project.",
    body: [
      "Linear search checks every item one by one — simple, always works, but slow on large data (O(n)). Binary search is much faster (O(log n)) but only works on already-sorted data — it repeatedly halves the search range by comparing against the middle element.",
      "Sorting algorithms (bubble, selection, insertion) are worth implementing by hand once, purely to understand HOW sorting works — in real code you'll almost always just call .sort() or sorted(), which use a much faster algorithm than any of these three.",
      "A stack is last-in-first-out (like a stack of plates — you take from the top). A queue is first-in-first-out (like a line at a store). Python lists can act as either with .append()/.pop() for a stack, or collections.deque for an efficient queue.",
      "Complexity (Big O) is a way of describing how an algorithm's running time grows as the input grows — O(n) means roughly linear growth, O(n²) means it grows much faster (a loop inside a loop over the same data). You don't need to calculate it formally yet — just start noticing when you've nested a loop inside a loop over the same collection.",
    ],
    codeExample: {
      caption: "Binary search implemented by hand",
      code:
        "def binary_search(sorted_list, target):\n" +
        "    low, high = 0, len(sorted_list) - 1\n" +
        "    while low <= high:\n" +
        "        mid = (low + high) // 2\n" +
        "        if sorted_list[mid] == target:\n" +
        "            return mid\n" +
        "        elif sorted_list[mid] < target:\n" +
        "            low = mid + 1\n" +
        "        else:\n" +
        "            high = mid - 1\n" +
        "    return -1\n\n" +
        "print(binary_search([1, 3, 5, 7, 9, 11], 7))  # 3",
    },
    commonMistakes: [
      "Running binary search on unsorted data — it silently gives wrong answers instead of erroring",
      "Writing a nested loop over the same large collection without realizing it's O(n²) and will be slow at scale",
      "Reimplementing sort() by hand in real code instead of using the built-in, which is far faster",
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
    whyItMatters:
      "This is what separates code that 'works' from code that reads like a professional wrote it. These patterns show up constantly in real Python codebases you'll read and contribute to.",
    body: [
      "A list comprehension builds a list in one line: `[x * 2 for x in numbers]` instead of a 4-line for-loop with .append(). They can filter too: `[x for x in numbers if x > 0]`. Use them when they make the code clearer — if the comprehension itself is hard to read, a regular loop is the better choice.",
      "lambda creates a small, unnamed function inline: `lambda x: x * 2`. map() applies a function to every item in a collection; filter() keeps only items where a function returns True. These are most useful as arguments to other functions (like as the `key` in sorted()), less useful as a replacement for a normal named function.",
      "enumerate() (index + value) and zip() (pair up multiple sequences element-by-element) solve two extremely common looping needs — reach for them before writing a manual index counter or manually pairing lists yourself.",
      "A generator (using `yield` instead of `return`) produces values one at a time, on demand, instead of building a whole list in memory at once — useful once you're working with data too large to hold entirely in memory, which likely won't come up yet, but the concept is good to have seen.",
    ],
    codeExample: {
      caption: "A list comprehension replacing a 4-line loop",
      code:
        "numbers = [1, -2, 3, -4, 5, -6]\n\n" +
        "# Instead of a manual loop with .append():\n" +
        "positives_doubled = [n * 2 for n in numbers if n > 0]\n" +
        "print(positives_doubled)  # [2, 6, 10]",
    },
    commonMistakes: [
      "Writing a list comprehension so dense it's harder to read than the loop it replaced",
      "Using lambda for anything more than a one-line expression, instead of a named function",
      "Forgetting zip() stops at the shortest input list, silently dropping extra items from the longer one",
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
    whyItMatters:
      "Files and JSON work for small projects, but real applications need to query, filter, and update data reliably at scale, often from multiple places at once. Databases are the answer, and SQL is one of the most durable, widely-used skills in software.",
    body: [
      "A relational database stores data in tables (rows and columns), similar in shape to a spreadsheet, but with real query power. SQLite is a full relational database that lives in a single file — no server to set up, which makes it the right starting point.",
      "The CRUD operations map directly to SQL: CREATE (INSERT INTO), READ (SELECT), UPDATE (UPDATE ... SET), DELETE (DELETE FROM). Learning to read and write basic SQL is a genuinely separate skill from Python — worth practicing the SQL by itself before wiring it into Python code.",
      "Python's sqlite3 module (built into the standard library, no install needed) lets you run SQL from Python: connect to a file, get a cursor, execute() a query, and either commit() (for writes) or fetchall() (for reads).",
      "Always use parameterized queries (`cursor.execute('SELECT * FROM users WHERE name = ?', (name,))`) rather than building SQL strings with f-strings or +. Beyond being safer, it also correctly handles special characters in the data without you having to think about it.",
    ],
    codeExample: {
      caption: "A parameterized query, the safe way to include a variable in SQL",
      code:
        "import sqlite3\n\n" +
        "conn = sqlite3.connect('school.db')\n" +
        "cursor = conn.cursor()\n\n" +
        "name = 'Ama'\n" +
        "cursor.execute('SELECT * FROM students WHERE name = ?', (name,))\n" +
        "results = cursor.fetchall()\n" +
        "print(results)",
    },
    commonMistakes: [
      "Building SQL with f-strings (\"SELECT * FROM users WHERE name = '{name}'\") instead of a parameterized query",
      "Forgetting conn.commit() after an INSERT/UPDATE/DELETE, so the change doesn't actually persist",
      "Not closing the connection when done, which can leave the database file locked",
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
    whyItMatters:
      "This is how your program stops being isolated and starts talking to the rest of the internet — weather data, payment processing, maps, almost every modern app leans on APIs built by someone else.",
    body: [
      "An API lets your program request data from someone else's server over the internet. The `requests` library is the standard way to do this in Python: `response = requests.get(url)` sends the request and gets a response back.",
      "Always check response.status_code before trusting the data — 200 means success, 404 means not found, 401/403 mean an authorization problem, 500 means the server itself failed. Don't assume a request worked just because it didn't crash.",
      "response.json() converts a JSON response body into a Python dict/list you can work with directly. Before writing code that assumes a particular shape, print the raw response (or response.json()) once and actually look at it — assuming the shape wrong is the single most common API bug.",
      "Wrap API calls in try/except — the network can fail, time out, or return something unexpected, none of which is under your control, and your program should handle that gracefully rather than crashing.",
    ],
    codeExample: {
      caption: "Checking the status code before trusting the response",
      code:
        "import requests\n\n" +
        "response = requests.get('https://api.example.com/weather', timeout=5)\n\n" +
        "if response.status_code == 200:\n" +
        "    data = response.json()\n" +
        "    print(data['temperature'])\n" +
        "else:\n" +
        "    print(f'Request failed: {response.status_code}')",
    },
    commonMistakes: [
      "Calling response.json() without checking status_code first, and crashing on an error response with no JSON body",
      "Assuming the shape of the JSON response instead of printing it once to actually look",
      "Making an API call with no timeout, so a slow/hung server freezes the whole program",
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
    whyItMatters:
      "Everything before this module was about writing code that works. This module is about writing code someone else — including future you — can trust, maintain, and build on. It's the difference between a script and software.",
    body: [
      "Clean code means someone else (including future-you) can read it without you explaining it out loud. Consistent naming, small functions with one clear job, and comments that explain WHY (not what — the code already shows what) are the highest-leverage habits here.",
      "Docstrings (`\"\"\"Explains what this function does.\"\"\"` right under a def) document a function's purpose, parameters, and return value in a way tools and other developers can actually find, unlike a regular comment above it.",
      "Unit tests check that a specific piece of code produces the expected output for a given input, automatically, every time — instead of manually re-testing by hand after every change. Even a handful of tests on your trickiest functions catches regressions before they become a live bug.",
      "Git tracks every change to your code over time and lets you undo mistakes, work on features without breaking the working version, and (with GitHub) back your work up and share it. The core loop you'll use constantly: git add, git commit, git push. Commit often, with a message that says what changed and why.",
    ],
    codeExample: {
      caption: "A function with a docstring and a matching unit test",
      code:
        "def calculate_discount(price, percent):\n" +
        "    \"\"\"Returns the price after applying a percent discount.\"\"\"\n" +
        "    return price * (1 - percent / 100)\n\n" +
        "# In a test file:\n" +
        "def test_calculate_discount():\n" +
        "    assert calculate_discount(100, 10) == 90",
    },
    commonMistakes: [
      "Writing comments that just repeat what the code already says, instead of explaining why",
      "Committing one giant change with a message like 'updates' instead of small, clearly-described commits",
      "Skipping tests entirely because 'it's just a small project' — the tests that matter most are on the trickiest, most error-prone logic",
    ],
    keyTakeaways: [
      "Docstrings document what a function does in a way tools can surface — comments alone can't do that",
      "A few tests on your trickiest functions catch regressions automatically, without manual re-checking",
      "Commit often with clear messages — git history is only useful if you can actually tell what each commit did",
    ],
  },
];

export const JOURNEY_EXERCISES: JourneyExercise[] = [
  { id: "m1-ex1", moduleOrder: 1, difficulty: "warmup", prompt: "Write a program that asks for someone's name and birth year, then prints a sentence stating their approximate age (current year minus birth year).", hint: "Remember input() returns a string — you'll need int() before subtracting." },
  { id: "m1-ex2", moduleOrder: 1, difficulty: "core", prompt: "Ask for a temperature in Celsius and convert it to Fahrenheit (F = C * 9/5 + 32), printing the result rounded to 1 decimal place.", hint: "round(value, 1) rounds to one decimal place." },
  { id: "m1-ex3", moduleOrder: 1, difficulty: "stretch", prompt: "Build a simple tip calculator: ask for a bill amount and a tip percentage, then print the tip amount, the total, and each person's share if split among a number of people you also ask for.", hint: "You'll need three separate input() calls, each converted to the right type (float for money, int for the number of people)." },

  { id: "m2-ex1", moduleOrder: 2, difficulty: "warmup", prompt: "Write a program that takes a number and prints whether it's positive, negative, or zero, using if/elif/else.", hint: "Check the zero case first, or you might accidentally treat 0 as neither positive nor negative correctly." },
  { id: "m2-ex2", moduleOrder: 2, difficulty: "core", prompt: "Ask for a person's age and whether they have a student ID (yes/no), then decide if they qualify for a student discount (age under 25 AND has a student ID).", hint: "This needs an `and` — both conditions must be true." },
  { id: "m2-ex3", moduleOrder: 2, difficulty: "stretch", prompt: "Build a simple grading program: ask for a numeric score and print the letter grade (A: 90+, B: 80-89, C: 70-79, D: 60-69, F: below 60) using if/elif/else, in the correct order so no score gets misclassified.", hint: "Check from highest to lowest (90+ first) — if you check low thresholds first, a 95 would incorrectly match an earlier, looser condition." },

  { id: "m3-ex1", moduleOrder: 3, difficulty: "warmup", prompt: "Print the multiplication table for a number the user provides, from 1x to 10x, using a for loop.", hint: "for i in range(1, 11): — remember range's upper bound is exclusive." },
  { id: "m3-ex2", moduleOrder: 3, difficulty: "core", prompt: "Write a program that keeps asking the user to guess a secret number (pick one yourself) until they get it right, using a while loop, telling them 'higher' or 'lower' after each guess.", hint: "The while condition should check whether the guess equals the secret number." },
  { id: "m3-ex3", moduleOrder: 3, difficulty: "stretch", prompt: "Print a right triangle pattern of asterisks using nested loops, where the user chooses the height (e.g. height 4 prints '*', '**', '***', '****' on separate lines).", hint: "Outer loop controls the row number; inner loop prints that many asterisks before moving to the next line." },

  { id: "m4-ex1", moduleOrder: 4, difficulty: "warmup", prompt: "Write a function that takes a sentence and returns it with every word capitalized, without using .title() (use .split(), a loop, and .join()).", hint: "Split into words, capitalize each one's first letter, then join back with spaces." },
  { id: "m4-ex2", moduleOrder: 4, difficulty: "core", prompt: "Write a function that checks whether a given string is a palindrome (reads the same forwards and backwards), ignoring case and spaces.", hint: "Strip spaces and lowercase the string first, then compare it to its reverse (string[::-1])." },
  { id: "m4-ex3", moduleOrder: 4, difficulty: "stretch", prompt: "Write a function that counts how many times each word appears in a paragraph, ignoring punctuation and case, and prints the 3 most common words.", hint: "Strip punctuation with .replace() for each symbol, .lower() and .split() the text, then count occurrences before sorting." },

  { id: "m5-ex1", moduleOrder: 5, difficulty: "warmup", prompt: "Given a list of exam scores, write code that prints the highest, lowest, and average score without using max()/min() — loop through and track them yourself.", hint: "Start your 'highest so far' variable as the first item in the list, then compare each subsequent item to it." },
  { id: "m5-ex2", moduleOrder: 5, difficulty: "core", prompt: "Write a function that removes duplicate values from a list while preserving the original order (don't just convert to a set, which loses order).", hint: "Build a new empty list, and only append an item if it's not already in the new list." },
  { id: "m5-ex3", moduleOrder: 5, difficulty: "stretch", prompt: "Write a function that merges two sorted lists of numbers into a single sorted list, without using sort() or sorted() — compare the front of each list and take the smaller one each step.", hint: "Use two index pointers, one per list, and advance whichever pointer's current value you just took." },

  { id: "m6-ex1", moduleOrder: 6, difficulty: "warmup", prompt: "Build a dictionary counting how many times each word appears in a sentence.", hint: "For each word, use dict.get(word, 0) + 1 to handle both new and existing words in one line." },
  { id: "m6-ex2", moduleOrder: 6, difficulty: "core", prompt: "Given two lists of names, use sets to find which names appear in both lists.", hint: "Convert both lists to sets and use the & operator (or .intersection())." },
  { id: "m6-ex3", moduleOrder: 6, difficulty: "stretch", prompt: "Build a simple contact book as a dictionary of dictionaries (name -> {phone, email}), with functions to add a contact, look one up safely (no crash if missing), and list everyone alphabetically.", hint: "sorted(contacts.keys()) gives you the names in alphabetical order to loop over." },

  { id: "m7-ex1", moduleOrder: 7, difficulty: "warmup", prompt: "Write a function is_prime(n) that returns True if n is a prime number, False otherwise.", hint: "Check divisibility from 2 up to n — if nothing divides evenly, it's prime. (You can stop checking once you pass the square root of n, if you want the more efficient version.)" },
  { id: "m7-ex2", moduleOrder: 7, difficulty: "core", prompt: "Write a function that takes a list of numbers and returns a new list with only the even numbers, without using a list comprehension.", hint: "Build an empty result list, loop through the input, and append when number % 2 == 0." },
  { id: "m7-ex3", moduleOrder: 7, difficulty: "stretch", prompt: "Write a small program with three separate functions — one to collect a list of expenses from the user, one to calculate the total, and one to print a formatted summary — and call them in sequence from a main() function.", hint: "Each function should do exactly one job; main() should just be a short sequence of calls to the others, not contain logic itself." },

  { id: "m8-ex1", moduleOrder: 8, difficulty: "warmup", prompt: "Write a function safe_divide(a, b) that returns a/b, but catches ZeroDivisionError and returns None instead of crashing.", hint: "try: return a / b, except ZeroDivisionError: return None." },
  { id: "m8-ex2", moduleOrder: 8, difficulty: "core", prompt: "Write a loop that keeps asking the user for a number until they enter a valid one, catching ValueError if they type something that isn't a number.", hint: "Put the int(input(...)) call inside a try block, inside a while True loop, and break once it succeeds." },
  { id: "m8-ex3", moduleOrder: 8, difficulty: "stretch", prompt: "Build a calculator function that takes two numbers and an operator (+, -, *, /) and handles every failure case gracefully: division by zero, an unknown operator, and non-numeric input — each with its own specific error message.", hint: "You'll need multiple except clauses, or one that checks the operator string against a fixed set of valid values before doing the math." },

  { id: "m9-ex1", moduleOrder: 9, difficulty: "warmup", prompt: "Write a program that appends a new to-do item (as a line of text) to a file called todos.txt each time it runs, without erasing previous entries.", hint: "Open the file in 'a' (append) mode, not 'w' (write), which would erase it." },
  { id: "m9-ex2", moduleOrder: 9, difficulty: "core", prompt: "Write a program that saves a dictionary of settings to a JSON file, then a second function that loads it back and prints it.", hint: "json.dump(data, f) to save, json.load(f) to load — both need the file opened first." },
  { id: "m9-ex3", moduleOrder: 9, difficulty: "stretch", prompt: "Build a simple expense tracker that saves each expense (amount + category) to a JSON file, and on startup loads existing expenses and shows the running total by category.", hint: "Load the file at the start if it exists (handle the case where it doesn't yet), then save the full updated list back after each new expense." },

  { id: "m10-ex1", moduleOrder: 10, difficulty: "warmup", prompt: "Using the random module, write a simple dice-rolling function that returns a random integer between 1 and 6.", hint: "random.randint(1, 6) — note this is inclusive on both ends, unlike range()." },
  { id: "m10-ex2", moduleOrder: 10, difficulty: "core", prompt: "Using the datetime module, write a function that prints how many days remain until a given date.", hint: "Subtracting two datetime.date objects gives you a timedelta, which has a .days attribute." },
  { id: "m10-ex3", moduleOrder: 10, difficulty: "stretch", prompt: "Split a small program you've already built (e.g. the contact book from Module 6) into two files: one module with the logic functions, and a main file that imports and uses them.", hint: "The main file should be short — mostly import statements and calls to functions defined in the other file." },

  { id: "m11-ex1", moduleOrder: 11, difficulty: "warmup", prompt: "Create a class BankAccount with a balance, and deposit()/withdraw() methods. withdraw() should refuse to overdraw the account.", hint: "Check the amount against self.balance before subtracting inside withdraw()." },
  { id: "m11-ex2", moduleOrder: 11, difficulty: "core", prompt: "Create a base class Animal with a speak() method, then two subclasses Dog and Cat that override speak() with their own sound.", hint: "Each subclass just needs its own def speak(self): with different return text — that's polymorphism in action." },
  { id: "m11-ex3", moduleOrder: 11, difficulty: "stretch", prompt: "Model a simple Library using composition: a Library class that contains a list of Book objects, with methods to add a book, check one out (mark unavailable), and list only the currently available ones.", hint: "Library should NOT inherit from Book — it HAS books, it isn't one. Store them as a list attribute set in __init__." },

  { id: "m12-ex1", moduleOrder: 12, difficulty: "warmup", prompt: "Implement binary search yourself as a function (don't use a library) that returns the index of a target value in a sorted list, or -1 if not found.", hint: "Track a low and high boundary, check the middle each time, and narrow the range based on whether the target is higher or lower." },
  { id: "m12-ex2", moduleOrder: 12, difficulty: "core", prompt: "Implement a simple stack using a Python list (push = append, pop = pop) and use it to check whether a string of brackets like '(())' is balanced.", hint: "Push on every opening bracket, pop on every closing one — if you ever try to pop an empty stack, or the stack isn't empty at the end, it's unbalanced." },
  { id: "m12-ex3", moduleOrder: 12, difficulty: "stretch", prompt: "Implement selection sort by hand (repeatedly find the smallest remaining item and move it to the front), then compare its output against sorted() on the same list to confirm they match.", hint: "You'll need an outer loop for each position in the result, and an inner loop that searches the remaining unsorted portion for the minimum." },

  { id: "m13-ex1", moduleOrder: 13, difficulty: "warmup", prompt: "Rewrite one of your Module 5 or 6 exercises using a list comprehension instead of a for loop.", hint: "The pattern is [expression for item in iterable if condition] — the 'if' part is optional." },
  { id: "m13-ex2", moduleOrder: 13, difficulty: "core", prompt: "Use zip() and a loop to print each student's name next to their grade, given two separate lists (names and grades) in matching order.", hint: "for name, grade in zip(names, grades): print(f'{name}: {grade}')" },
  { id: "m13-ex3", moduleOrder: 13, difficulty: "stretch", prompt: "Write a generator function that yields Fibonacci numbers one at a time, forever, and use it to print the first 15 Fibonacci numbers without storing them all in a list upfront.", hint: "Use yield inside a while True loop, and use itertools.islice() or a manual counter to only take the first 15 from the caller's side." },

  { id: "m14-ex1", moduleOrder: 14, difficulty: "warmup", prompt: "Create a SQLite database with a 'students' table (id, name, grade), insert three rows, then write a query that selects everyone with a grade above 70.", hint: "Use a parameterized query even though you're hardcoding the value here — it's the habit that matters." },
  { id: "m14-ex2", moduleOrder: 14, difficulty: "core", prompt: "Write a function update_grade(student_id, new_grade) that updates a single student's grade in the database.", hint: "UPDATE students SET grade = ? WHERE id = ? — don't forget conn.commit() after an UPDATE or the change won't actually save." },
  { id: "m14-ex3", moduleOrder: 14, difficulty: "stretch", prompt: "Build a small CLI program with a menu (add student, view all students, update a grade, delete a student) that reads and writes to the same SQLite database across multiple runs.", hint: "Structure it as a loop that shows the menu, reads a choice, and calls a separate function per menu option — reuse the same connection across the whole session rather than reopening it each time." },

  { id: "m15-ex1", moduleOrder: 15, difficulty: "warmup", prompt: "Use requests to fetch data from a free public API (e.g. a joke API or a weather API) and print one field from the JSON response.", hint: "Print response.json() first and look at the actual structure before writing code that assumes a specific key exists." },
  { id: "m15-ex2", moduleOrder: 15, difficulty: "core", prompt: "Add error handling to your API call from the previous exercise: check status_code and handle the case where the request fails or times out.", hint: "requests.get(url, timeout=5) with a try/except around it, checking response.status_code == 200 before parsing." },
  { id: "m15-ex3", moduleOrder: 15, difficulty: "stretch", prompt: "Build a small weather-lookup program: ask the user for a city name, call a weather API, and print a formatted summary — handling the case where the city isn't found.", hint: "Check the response for an error field or a non-200 status before assuming the expected weather fields will be present." },

  { id: "m16-ex1", moduleOrder: 16, difficulty: "warmup", prompt: "Write docstrings for the three most important functions in your current project.", hint: "A docstring is a triple-quoted string right under the def line — it should explain what the function does, its parameters, and what it returns." },
  { id: "m16-ex2", moduleOrder: 16, difficulty: "core", prompt: "Write at least three unit tests for whichever function in your current project has the trickiest logic — including one test for a normal case and one for an edge case (empty input, zero, negative number).", hint: "An edge case test is just as important as a normal one — it's often where real bugs hide." },
  { id: "m16-ex3", moduleOrder: 16, difficulty: "stretch", prompt: "Initialize a git repository for your current project (if you haven't already), make at least 5 separate commits with clear, specific messages as you make small changes, and push it to GitHub with a short README explaining what the project does.", hint: "Each commit message should describe what changed and why — 'fix bug' is worse than 'fix: handle empty input in calculate_total()'." },
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
