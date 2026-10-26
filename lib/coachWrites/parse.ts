/**
 * Coach write requests: what the founder asked the coach to CHANGE.
 *
 * Pure and deterministic. A match only produces a proposal; nothing is written until the founder taps Confirm on the
 * card and the server re-validates. Conservative on purpose: a miss falls through to normal coaching, a false match
 * would put a confirm card in front of someone who only asked a question.
 */

import { parseDuration, type DurationChoice } from "@/lib/today/loops";

export type WriteKind = "add_task" | "set_task" | "log_outreach" | "remind";

export type WriteRequest =
  | { kind: "add_task"; title: string }
  | { kind: "set_task"; query: string; outcome: "done" | "blocked" }
  | { kind: "log_outreach"; text: string }
  | { kind: "remind"; text: string; choice: DurationChoice };

const clean = (s: string) =>
  s.replace(/\s+/g, " ").replace(/^["'“”‘’\s:,-]+|["'“”‘’\s.!,-]+$/g, "").trim();

const MAX_TITLE = 140;

export function parseCoachWrite(raw: string): WriteRequest | null {
  const message = String(raw ?? "").trim();
  if (!message || message.length > 400 || message.includes("?")) return null;
  const m = message.replace(/^(?:please|pls|hey|ok|okay|coach)[,\s]+/i, "").trim();

  // Reminder: "remind me tomorrow to email Sam", "remind me to post the thread in 3 days", "remind me in a week".
  const rem = m.match(/^remind me\b[,\s]*(.*)$/i);
  if (rem) {
    const rest = rem[1];
    const choice = parseDuration(rest) ?? "1d";
    const what = clean(
      rest
        .replace(/\b(?:in\s+)?(?:\d+|two|three|four|five)\s*days?\b/gi, " ")
        .replace(/\b(?:next\s+week|in\s+a\s+week|tomorrow|overnight|in\s+(?:a\s+few|a\s+couple\s+of)\s+hours|in\s+\d+\s*(?:h|hrs?|hours?))\b/gi, " ")
        .replace(/^\s*(?:to|about|that|of)\s+/i, ""),
    ).replace(/^(?:to|about)\s+/i, "");
    return what.length >= 3 ? { kind: "remind", text: what.slice(0, 200), choice } : null;
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
