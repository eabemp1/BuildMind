/**
 * Coach write requests: what the founder asked the coach to CHANGE.
 *
 * Pure and deterministic. A match only produces a proposal; nothing is written until the founder taps Confirm on the
 * card and the server re-validates. Conservative on purpose: a miss falls through to normal coaching, a false match
 * would put a confirm card in front of someone who only asked a question.
 */

import { parseDuration, type ClockTime, type DurationChoice } from "@/lib/today/loops";

export type WriteKind = "add_task" | "set_task" | "log_outreach" | "remind";

export type WriteRequest =
  | { kind: "add_task"; title: string }
  | { kind: "set_task"; query: string; outcome: "done" | "blocked" }
  | { kind: "log_outreach"; text: string }
  | { kind: "remind"; text: string; choice: DurationChoice; at?: ClockTime };

const clean = (s: string) =>
  s.replace(/\s+/g, " ").replace(/^["'“”‘’\s:,-]+|["'“”‘’\s.!,-]+$/g, "").trim();

const MAX_TITLE = 140;

const DAYPARTS: Array<[RegExp, number, number]> = [
  [/\b(?:tonight)\b/i, 20, 0],
  [/\bthis\s+evening\b/i, 18, 0],
  [/\bthis\s+afternoon\b/i, 15, 0],
  [/\bthis\s+morning\b/i, 9, 0],
  [/\b(?:at\s+)?noon\b/i, 12, 0],
];

/** "at 5pm", "by 17:30", "tomorrow at 9", "tonight". Returns the time and the text with it removed. */
export function parseClock(text: string): { at: ClockTime; rest: string } | null {
  const tomorrow = /\btomorrow\b/i.test(text);
  const t = text.replace(/\btomorrow\b/gi, " ");
  const x = /\b(?:at|by|around|for)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/i.exec(t)
    ?? /\b(?:at|by|around)\s+(\d{1,2}):(\d{2})\b()/i.exec(t)
    ?? /\b(?:at|by)\s+(\d{1,2})\b()()(?!\s*(?:days?|hours?|hrs?|mins?|minutes?|%))/i.exec(t);
  if (x) {
    let h = Number(x[1]);
    const m = x[2] ? Number(x[2]) : 0;
    const ap = (x[3] ?? "").toLowerCase().replace(/\./g, "");
    if (m > 59 || h > 23) return null;
    if (ap === "pm" && h < 12) h += 12;
    else if (ap === "am" && h === 12) h = 0;
    else if (!ap && h >= 1 && h <= 6) h += 12; // a bare "at 5" in a reminder means the afternoon
    if (ap && (h > 23 || Number(x[1]) > 12 || Number(x[1]) < 1)) return null;
    return { at: { h, m, tomorrow }, rest: t.replace(x[0], " ") };
  }
  for (const [rx, h, m] of DAYPARTS) if (rx.test(t)) return { at: { h, m, tomorrow }, rest: t.replace(rx, " ") };
  return null;
}

export function parseCoachWrite(raw: string): WriteRequest | null {
  const message = String(raw ?? "").trim();
  if (!message || message.length > 400 || message.includes("?")) return null;
  const m = message.replace(/^(?:please|pls|hey|ok|okay|coach)[,\s]+/i, "").trim();

  // Reminder: "remind me tomorrow to email Sam", "remind me to post the thread in 3 days", "remind me in a week".
  const rem = m.match(/^remind me\b[,\s]*(.*)$/i);
  if (rem) {
    const clock = /\bin\s+(?:an?|\d+|two|three|four|five|a\s+few|a\s+couple\s+of)\s*(?:hours?|hrs?|h|days?|weeks?|week)\b/i.test(rem[1]) ? null : parseClock(rem[1]);
    const rest = clock ? clock.rest : rem[1];
    const choice = clock ? "1d" : parseDuration(rest) ?? "1d";
    const what = clean(
      rest
        .replace(/\b(?:in\s+)?(?:\d+|two|three|four|five)\s*days?\b/gi, " ")
        .replace(/\b(?:next\s+week|in\s+a\s+week|tomorrow|overnight|in\s+(?:a\s+few|a\s+couple\s+of)\s+hours|in\s+\d+\s*(?:h|hrs?|hours?))\b/gi, " ")
        .replace(/\b(?:today|later today)\b/gi, " ")
        .replace(/^\s*(?:to|about|that|of|at|by)\s+/i, ""),
    ).replace(/^(?:to|about)\s+/i, "");
    return what.length >= 3 ? { kind: "remind", text: what.slice(0, 200), choice, ...(clock ? { at: clock.at } : {}) } : null;
  }

  // Add a task: "add a task: email 5 founders", "add task to my list - fix pricing", "create a new task called X".
  const add = m.match(/^(?:add|create|put|make)\s+(?:a\s+|another\s+)?(?:new\s+)?task\b(?:\s+(?:to|on|in)\s+(?:my\s+)?(?:list|backlog|plan|today))?\s*(?:called|named|titled|that says|:|-|to)?\s*(.+)$/i);
  if (add) {
    const title = clean(add[1]);
    if (title.length >= 3) return { kind: "add_task", title: title.slice(0, MAX_TITLE) };
  }

  // Log an outreach result: "log that Sam replied and wants a demo", "record: ghosted by 3 founders".
  const log = m.match(/^(?:log|record|note(?:\s+down)?)\s*(?:that|this)?\s*[:,-]?\s*(.+)$/i);
  if (log) {
    const text = clean(log[1]);
    if (text.length >= 5) return { kind: "log_outreach", text: text.slice(0, 280) };
  }

  // Mark a task: "mark the pricing task as done", "set X to blocked".
  const mark = m.match(/^(?:mark|set|move)\s+(?:the\s+|my\s+)?(.+?)\s+(?:task\s+)?(?:as|to)\s+(done|complete|completed|finished|blocked|stuck)$/i);
  if (mark) {
    const query = clean(mark[1].replace(/\btask\b/gi, ""));
    if (query.length >= 3) return { kind: "set_task", query, outcome: /blocked|stuck/i.test(mark[2]) ? "blocked" : "done" };
  }
  // "I finished the landing page copy", "I've done X", "X is blocked", "I'm blocked on X".
  const fin = m.match(/^(?:i(?:'ve| have)?\s+)?(?:finished|completed|done with|just finished|just completed)\s+(?:the\s+|my\s+)?(.+)$/i);
  if (fin) {
    const query = clean(fin[1].replace(/\btask\b/gi, ""));
    if (query.length >= 3) return { kind: "set_task", query, outcome: "done" };
  }
  const blocked = m.match(/^(?:i(?:'m| am)\s+blocked\s+(?:on|by|with)\s+(?:the\s+|my\s+)?(.+)|(?:the\s+|my\s+)?(.+?)\s+is\s+blocked)$/i);
  if (blocked) {
    const query = clean((blocked[1] ?? blocked[2] ?? "").replace(/\btask\b/gi, ""));
    if (query.length >= 3) return { kind: "set_task", query, outcome: "blocked" };
  }
  return null;
}

// ── Finding the task the founder meant ─────────────────────────────────────────

const STOP = new Set(["the", "a", "an", "my", "to", "for", "of", "and", "on", "in", "with", "task", "this", "that", "it"]);
const tokens = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));

export interface MatchableTask {
  id: string;
  title: string;
}

/** Best open tasks for a phrase, best first. Score = share of the query's words found in the title. */
export function rankTasks<T extends MatchableTask>(query: string, tasks: T[], limit = 3): Array<T & { score: number }> {
  const q = tokens(query);
  if (!q.length) return [];
  return tasks
    .map((t) => {
      const words = new Set(tokens(t.title));
      const hit = q.filter((w) => words.has(w) || [...words].some((x) => x.length > 3 && w.length > 3 && (x.startsWith(w) || w.startsWith(x)))).length;
      return { ...t, score: hit / q.length };
    })
    .filter((t) => t.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Confident only when one task clearly wins; otherwise the founder is asked to pick. */
export function pickTask<T extends MatchableTask>(ranked: Array<T & { score: number }>): { task: T | null; ambiguous: boolean } {
  if (!ranked.length) return { task: null, ambiguous: false };
  const [first, second] = ranked;
  if (!second || first.score - second.score >= 0.25) return { task: first, ambiguous: false };
  return { task: null, ambiguous: true };
}
