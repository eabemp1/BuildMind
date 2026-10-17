/**
 * lib/today/loops.ts — follow-up loops.
 *
 * A founder posts, DMs or ships something and says "I'll know in a day".
 * Today must bring that back at the right moment and ask for the evidence.
 * Everything about WHEN is deterministic here: due dates, overdue levels,
 * snoozing, and the text the generator sees. The model never decides when a
 * loop is due, so it can't forget one.
 */

export type LoopStatus = "open" | "recorded" | "dismissed";
export type LoopResult = "worked" | "mixed" | "failed";

export interface Loop {
  id: string;
  user_id?: string;
  project_id?: string | null;
  task_text: string;
  measure: string;
  due_at: string;
  status: LoopStatus;
  snooze_count: number;
  notified_at?: string | null;
  evidence?: string | null;
  result?: LoopResult | null;
  created_at: string;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const DURATION_CHOICES = {
  "4h": { ms: 4 * HOUR, label: "In 4 hours" },
  "1d": { ms: DAY, label: "Tomorrow" },
  "3d": { ms: 3 * DAY, label: "In 3 days" },
  "1w": { ms: 7 * DAY, label: "In a week" },
} as const;
export type DurationChoice = keyof typeof DURATION_CHOICES;

export function isDurationChoice(v: unknown): v is DurationChoice {
  return typeof v === "string" && v in DURATION_CHOICES;
}

export const MAX_SNOOZES = 3;
export const MAX_OPEN_LOOPS = 8;

export function dueAtFor(choice: DurationChoice, now = Date.now()): string {
  return new Date(now + DURATION_CHOICES[choice].ms).toISOString();
}

/** Free-text duration the founder wrote ("in 2 days", "tomorrow", "a full day", "next week"). */
export function parseDuration(text: string): DurationChoice | null {
  const t = (text ?? "").toLowerCase();
  if (!t) return null;
  if (/\b(?:next\s+week|in\s+a\s+week|1\s*week|one\s+week|7\s*days?)\b/.test(t)) return "1w";
  const days = /\b(?:in\s+)?(\d+|two|three|four|five)\s*days?\b/.exec(t);
  if (days) {
    const n = ({ two: 2, three: 3, four: 4, five: 5 } as Record<string, number>)[days[1]] ?? Number(days[1]);
    if (n >= 5) return "1w";
    if (n >= 2) return "3d";
    return "1d";
  }
  if (/\b(?:tomorrow|a\s+full\s+day|24\s*(?:h|hrs?|hours?)|one\s+day|1\s+day|overnight|next\s+day)\b/.test(t)) return "1d";
  if (/\b(?:few\s+hours|couple\s+(?:of\s+)?hours|(?:2|3|4|two|three|four)\s*(?:h|hrs?|hours?))\b/.test(t)) return "4h";
  return null;
}

/** A sensible default when the reflection looks like it has an open loop but names no time. */
export function defaultChoiceFor(text: string): DurationChoice {
  return parseDuration(text) ?? "1d";
}

export function isDue(l: Pick<Loop, "status" | "due_at">, now = Date.now()): boolean {
  return l.status === "open" && Date.parse(l.due_at) <= now;
}

export type Urgency = "due" | "overdue" | "stale";

/** due: just came up; overdue: >1 day late; stale: >5 days late (ask once more, then let it go). */
export function urgencyOf(l: Pick<Loop, "due_at">, now = Date.now()): Urgency {
  const late = now - Date.parse(l.due_at);
  if (late > 5 * DAY) return "stale";
  if (late > DAY) return "overdue";
  return "due";
}

export function partitionLoops(loops: Loop[], now = Date.now()): { due: Loop[]; upcoming: Loop[] } {
  const open = loops.filter((l) => l.status === "open" && !Number.isNaN(Date.parse(l.due_at)));
  const due = open.filter((l) => isDue(l, now)).sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
  const upcoming = open.filter((l) => !isDue(l, now)).sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
  return { due, upcoming };
}

export function canSnooze(l: Pick<Loop, "snooze_count">): boolean {
  return l.snooze_count < MAX_SNOOZES;
}

export function snoozedDueAt(choice: DurationChoice, now = Date.now()): string {
  // Snoozing never shortens a loop below 4 hours.
  return dueAtFor(choice, now);
}

/** The question shown to the founder, built from what they said they'd measure. */
export function loopQuestion(l: Pick<Loop, "task_text" | "measure">): string {
  const m = l.measure.trim().replace(/[.?!]+$/, "");
  return m ? `You said you'd check: ${m}. What happened?` : "What happened?";
}

/** Default "what to measure" derived from the task text and the founder's own note. */
export function defaultMeasure(task: string, note = ""): string {
  const n = note.trim();
  const waiting = /(?:waiting\s+(?:for|on)\s+[^.\n]{3,80}|haven'?t\s+(?:yet\s+)?(?:recei\w*|heard)[^.\n]{0,60}|to\s+measure\s+[^.\n]{3,60})/i.exec(n);
  if (waiting) return waiting[0].trim();
  if (/\b(post|posted|publish|published|tweet|linkedin)\b/i.test(task)) return "likes, comments, replies and profile views on the post";
  if (/\b(dm|message|email|emailed|messaged|reached\s+out|outreach|invite)\b/i.test(task)) return "who replied, and what they said";
  if (/\b(ship|launch|deploy|publish(?:ed)?\s+(?:the\s+)?(?:page|app|feature))\b/i.test(task)) return "who used it and what they did";
  return "what came back from this";
}

/** Prompt block: a due loop outranks starting something new. */
export function loopsPromptBlock(due: Loop[], now = Date.now()): string {
  if (!due.length) return "";
  const lines = ["DUE FOLLOW-UPS (the founder asked to be reminded; the Today screen is already asking them for the result):"];
  for (const l of due.slice(0, 3)) {
    const lateH = Math.max(0, Math.round((now - Date.parse(l.due_at)) / HOUR));
    lines.push(`- ${l.task_text.slice(0, 140)} (measure: ${l.measure.slice(0, 100)}; ${lateH}h past due)`);
  }
  lines.push("-> Do not repeat these tasks. Build today's task on their result: if it worked, do more of it; if it failed, change one thing.");
  return lines.join("\n");
}

/** Reflection row created when a loop's evidence is recorded, so the generator and ledger see it. */
export function evidenceAsReflection(l: Pick<Loop, "task_text" | "measure">, evidence: string, result?: LoopResult | null) {
  return {
    outcome: "learned" as const,
    today_action: l.task_text,
    what_tried: `Follow-up on: ${l.task_text.slice(0, 200)}`,
    what_happened: evidence.trim().slice(0, 800),
    what_learned: result === "worked" ? "This worked; repeat it." : result === "failed" ? "This did not work; change one thing." : result === "mixed" ? "Mixed result; keep the part that moved." : null,
    note: `Follow-up result (${l.measure.slice(0, 120)}): ${evidence.trim().slice(0, 300)}`,
  };
}

const OPEN_LOOP_RE = /(?:waiting\s+(?:for|on)|haven'?t\s+(?:yet\s+)?(?:recei|heard|got)|no\s+(?:reply|response|replies)\s+yet|still\s+waiting|awaiting|to\s+measure|check\s+back|see\s+how\s+it\s+(?:goes|performs))/i;

/** True when the founder's own words suggest a result is still on its way. */
export function looksLikeOpenLoop(...texts: string[]): boolean {
  return texts.some((t) => OPEN_LOOP_RE.test(t ?? ""));
}
