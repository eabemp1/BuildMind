import type { PrepKind } from "@/lib/prep/kinds";

export interface LearnRow {
  kind: PrepKind;
  original: string;
  final: string | null;
  outcome: string | null;
  status: string;
}

export interface LessonSet { lessons: string[]; samples: number }

const FAMILY: Partial<Record<PrepKind, string>> = { outreach: "conversation", post: "conversation" };
const familyMatches = (a: PrepKind, b: PrepKind) => a === b || (FAMILY[a] !== undefined && FAMILY[a] === FAMILY[b]);
const words = (s: string) => s.toLowerCase().match(/[a-z0-9']+/g) ?? [];

/** Share of the original draft's words that did not survive the founder's edit. */
export function editRatio(original: string, final: string): number {
  const before = words(original);
  const after = words(final);
  if (!before.length) return after.length ? 1 : 0;
  const remaining = new Map<string, number>();
  for (const word of after) remaining.set(word, (remaining.get(word) ?? 0) + 1);
  let common = 0;
  for (const word of before) {
    const n = remaining.get(word) ?? 0;
    if (n > 0) { common++; remaining.set(word, n - 1); }
  }
  return Math.max(0, Math.min(1, 1 - common / before.length));
}

function relevant(rows: LearnRow[], kind: PrepKind): LearnRow[] {
  return rows.filter((r) => familyMatches(r.kind, kind));
}

export function styleLessons(rows: LearnRow[], kind: PrepKind): LessonSet {
  const edited = relevant(rows, kind).filter((r) => r.final?.trim() && editRatio(r.original, r.final) >= 0.35);
  if (edited.length < 3) return { lessons: [], samples: edited.length };
  const shorter = edited.filter((r) => words(r.final ?? "").length < words(r.original).length * 0.7).length;
  const lessons = shorter >= Math.ceil(edited.length * 0.7)
    ? [`The founder consistently makes ${kind.replaceAll("_", " ")} drafts shorter (${shorter} of ${edited.length} edited drafts); start concise.`]
    : [`The founder substantially rewrites ${kind.replaceAll("_", " ")} drafts (${edited.length} examples); leave room for their own wording.`];
  return { lessons, samples: edited.length };
}

const POSITIVE = new Set(["replied", "call_booked", "got_comments", "got_response", "converted"]);
const NEGATIVE = new Set(["no_reply", "no_response"]);

export function performance(rows: LearnRow[], kind: PrepKind): { used: number; responded: number; waiting: number } {
  const usedRows = relevant(rows, kind).filter((r) => ["sent", "posted", "used", "completed"].includes(r.status) || r.outcome !== null);
  return {
    used: usedRows.length,
    responded: usedRows.filter((r) => POSITIVE.has(r.outcome ?? "")).length,
    waiting: usedRows.filter((r) => !r.outcome).length,
  };
}

export function outcomeLessons(rows: LearnRow[], kind: PrepKind): LessonSet {
  const results = relevant(rows, kind).filter((r) => r.outcome);
  if (results.length < 8) return { lessons: [], samples: results.length };
  const lengths = results.map((r) => words(r.original).length).sort((a, b) => a - b);
  const middle = Math.floor(lengths.length / 2);
  const midpoint = lengths.length % 2 ? lengths[middle] : (lengths[middle - 1] + lengths[middle]) / 2;
  const shorter = results.filter((r) => words(r.original).length <= midpoint);
  const longer = results.filter((r) => words(r.original).length > midpoint);
  const respondedShort = shorter.filter((r) => POSITIVE.has(r.outcome ?? "")).length;
  const respondedLong = longer.filter((r) => POSITIVE.has(r.outcome ?? "")).length;
  if (shorter.length < 4 || longer.length < 4 || Math.max(respondedShort, respondedLong) < 4) return { lessons: [], samples: results.length };
  return {
    lessons: [`Shorter drafts received a response in ${respondedShort} of ${shorter.length} cases; longer drafts received a response in ${respondedLong} of ${longer.length} cases. Keep testing which opening and ask work best.`],
    samples: results.length,
  };
}

export function learnedLessons(rows: LearnRow[], kind: PrepKind): string[] {
  return [...styleLessons(rows, kind).lessons, ...outcomeLessons(rows, kind).lessons].slice(0, 8);
}

export function learningPromptBlock(lessons: string[]): string {
  return lessons.length ? `WHAT THE FOUNDER'S OWN EDITS AND RESULTS SUGGEST (guidance, not facts):\n${lessons.slice(0, 8).map((x) => `- ${x}`).join("\n")}\n` : "";
}
