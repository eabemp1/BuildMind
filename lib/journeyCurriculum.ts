/**
 * lib/journeyCurriculum.ts — Developer Journey curriculum catalog
 *
 * Static, code-level source of truth for the 16-module Python curriculum.
 * Deliberately NOT a database table (Phase 1 rule: don't build a catalog
 * table for content that doesn't change per-user — mirrors how
 * lib/achievements.ts keeps ACHIEVEMENTS as a static array, not a table).
 *
 * Per-student *progress* against this catalog lives in the journey_* tables
 * (see supabase/migrations/20260808000000_developer_journey_phase1.sql).
 * Everything in this file is shared, read-only, identical for every student.
 */

export interface JourneyModule {
  order: number; // 1-16, matches journey_projects.module_order
  title: string;
  topics: string[];
  projectTitle: string;
  /** Skills primarily exercised by this module's project (see JOURNEY_SKILLS). */
  primarySkillIds: string[];
}

export const JOURNEY_MODULES: JourneyModule[] = [
  { order: 1, title: "Python Fundamentals", topics: ["variables", "data types", "operators", "input/output", "type conversion"], projectTitle: "Student Grade Calculator", primarySkillIds: ["fundamentals"] },
  { order: 2, title: "Decision Making", topics: ["booleans", "if/elif/else", "nested conditions", "match-case"], projectTitle: "ATM Simulation System", primarySkillIds: ["fundamentals", "control_flow"] },
  { order: 3, title: "Iteration and Repetition", topics: ["while", "for", "range", "nested loops", "break/continue"], projectTitle: "Quiz Game Application", primarySkillIds: ["control_flow", "loops"] },
  { order: 4, title: "Working with Strings", topics: ["indexing", "slicing", "string methods", "f-strings", "text processing"], projectTitle: "Text Analysis Tool", primarySkillIds: ["loops", "strings"] },
  { order: 5, title: "Lists and Sequence Processing", topics: ["lists", "traversal", "searching", "sorting", "tuples"], projectTitle: "Gradebook Management System", primarySkillIds: ["strings", "data_structures"] },
  { order: 6, title: "Dictionaries and Sets", topics: ["dictionaries", "nested dictionaries", "sets", "choosing data structures"], projectTitle: "Contact Management System", primarySkillIds: ["data_structures"] },
  { order: 7, title: "Functions and Program Decomposition", topics: ["parameters", "return values", "scope", "default/keyword args", "recursion"], projectTitle: "Banking Management System", primarySkillIds: ["data_structures", "functions"] },
  { order: 8, title: "Exception Handling and Debugging", topics: ["syntax/runtime/logic errors", "try/except/else/finally", "raising exceptions", "debugging"], projectTitle: "Fault-Tolerant Calculator", primarySkillIds: ["functions", "debugging"] },
  { order: 9, title: "File Handling and Persistent Data", topics: ["reading/writing files", "CSV", "JSON", "context managers"], projectTitle: "Personal Finance Tracker", primarySkillIds: ["debugging", "persistence"] },
  { order: 10, title: "Modules, Packages and Libraries", topics: ["imports", "creating modules", "standard library (math, random, datetime, os)"], projectTitle: "Utility Toolkit", primarySkillIds: ["persistence", "modular_design"] },
  { order: 11, title: "Object-Oriented Programming", topics: ["classes", "encapsulation", "inheritance", "polymorphism", "composition"], projectTitle: "Library Management System", primarySkillIds: ["modular_design", "oop"] },
  { order: 12, title: "Algorithms and Data Structures", topics: ["complexity", "linear/binary search", "sorting algorithms", "stacks/queues/trees"], projectTitle: "Task Scheduling System", primarySkillIds: ["oop", "algorithms"] },
  { order: 13, title: "Intermediate Python", topics: ["comprehensions", "lambda/map/filter", "iterators", "generators", "decorators"], projectTitle: "Data Processing Toolkit", primarySkillIds: ["algorithms"] },
  { order: 14, title: "Databases with Python", topics: ["relational databases", "SQLite", "CRUD", "Python/SQLite integration"], projectTitle: "Student Information System", primarySkillIds: ["algorithms", "databases"] },
  { order: 15, title: "Working with APIs", topics: ["HTTP fundamentals", "requests", "JSON responses", "API error handling"], projectTitle: "Weather Dashboard", primarySkillIds: ["databases", "apis"] },
  { order: 16, title: "Software Development Practices", topics: ["clean code", "docstrings", "unit testing", "Git/GitHub", "deployment prep"], projectTitle: "Complete Python Application Capstone", primarySkillIds: ["apis", "software_practices"] },
];

export interface JourneySkill {
  id: string;
  name: string;
  /** Order in the skill graph — used only for display grouping, not gating. */
  order: number;
  /**
   * Shown when a submission comes back "needs_reinforcement" for this skill
   * (master prompt §24 — remediation, not "repeat the whole module").
   * Deliberately short: a nudge toward what to revisit, not a full lesson.
   */
  remediationTip: string;
}

export const JOURNEY_SKILLS: JourneySkill[] = [
  { id: "fundamentals", name: "Python Basics", order: 1, remediationTip: "Re-check variable types and operator precedence — trace through your code by hand, line by line, before rerunning it." },
  { id: "control_flow", name: "Control Flow", order: 2, remediationTip: "Write out the conditions in plain English first, then translate to if/elif/else — most bugs here are logic bugs, not syntax bugs." },
  { id: "loops", name: "Loops", order: 3, remediationTip: "Add a print() inside the loop to see the variable's value on every iteration — that will show you exactly where it diverges from what you expect." },
  { id: "strings", name: "String Manipulation", order: 4, remediationTip: "Practice slicing on a few short example strings in isolation before using it inside your program — get comfortable with the indices first." },
  { id: "data_structures", name: "Data Structures", order: 5, remediationTip: "Before choosing list, dict, or set, write one sentence describing what you need to do with the data — the right structure usually falls out of that." },
  { id: "functions", name: "Functions & Modular Design", order: 6, remediationTip: "If a function is hard to explain in one sentence, it's doing too much — split it into two smaller functions." },
  { id: "debugging", name: "Debugging", order: 7, remediationTip: "Read the full traceback bottom to top before changing anything — the last line tells you the error, the lines above tell you where." },
  { id: "persistence", name: "Persistence (Files/CSV/JSON)", order: 8, remediationTip: "Always use `with open(...) as f:` — and check the file actually saved by re-opening and printing it back." },
  { id: "modular_design", name: "Modular Program Design", order: 9, remediationTip: "Sketch the program as boxes and arrows before writing code — what calls what, what data moves between them." },
  { id: "oop", name: "Object-Oriented Programming", order: 10, remediationTip: "Ask: is this really an 'is-a' relationship (inheritance) or a 'has-a' relationship (composition)? Mixing the two up is the most common OOP mistake here." },
  { id: "algorithms", name: "Algorithms", order: 11, remediationTip: "Trace your algorithm on paper with a tiny 3-4 item example before trusting it on real data." },
  { id: "databases", name: "Databases", order: 12, remediationTip: "Run your SQL directly in a SQLite browser first, outside Python, so you know the query itself is right before wiring it into code." },
  { id: "apis", name: "APIs", order: 13, remediationTip: "Print the raw response (status code + response.text) before parsing it — most API bugs are 'I assumed the shape of the JSON wrong.'" },
  { id: "software_practices", name: "Software Engineering Practices", order: 14, remediationTip: "Write one docstring and one test for the trickiest function in the project — that's usually enough to reveal what's unclear." },
];

export function getModuleByOrder(order: number): JourneyModule | undefined {
  return JOURNEY_MODULES.find((m) => m.order === order);
}

export function getSkill(id: string): JourneySkill | undefined {
  return JOURNEY_SKILLS.find((s) => s.id === id);
}

export const TOTAL_MODULES = JOURNEY_MODULES.length;

export const DEFAULT_RUBRIC_WEIGHTS = {
  requirements: 20,
  correctness: 20,
  code_quality: 15,
  structure: 15,
  error_handling: 10,
  problem_solving: 10,
  documentation: 5,
  testing: 5,
} as const;

export type RubricCategory = keyof typeof DEFAULT_RUBRIC_WEIGHTS;
