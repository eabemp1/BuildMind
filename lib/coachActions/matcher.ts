/**
 * lib/coachActions/matcher.ts
 *
 * Deterministic intent matching for Coach Actions — zero tokens, works when
 * every AI provider is rate-limited or down. Pure (no server imports), so
 * the coach page can run the exact same function the server does, which is
 * how the client knows a free-plan founder's "show my open tasks" shouldn't
 * be blocked by the daily coaching-message cap.
 *
 * The bar for matching is deliberately HIGH. A false positive here hijacks a
 * real coaching conversation ("my backlog is crushing me" must reach the
 * coach, not return a task list), while a false negative just falls through
 * to normal coaching — which is harmless. So: explicit request phrasing only,
 * short messages only, and anything that reads as advice-seeking or
 * emotional never matches.
 *
 * This is the model-independent layer. A stronger model later can be added
 * as a second-stage router for phrasing this can't catch; nothing here
 * needs to change when that happens.
 */

import type { CoachActionMatch } from "./types";

const MAX_MATCHABLE_LENGTH = 160;

// Reads as seeking advice or venting — coaching, not a data request.
const ADVICE_OR_EMOTION =
  /\b(should i|why (am|do|is|are|can'?t)|what do you think|do you think|advice|i feel|i'?m feeling|feeling|overwhelm\w*|stuck|afraid|scared|worried|anxious|stress\w*|frustrat\w*|behind on|too many)\b/;

const EXPORT_VERB = /\b(export|download)\b/;
const REQUEST_VERB = /\b(give|send|get|show|pull(?: up)?|see|need|want|fetch|generate|display|list)\b/;
// Deliberately excludes the format words (json/csv): "show me json examples
// for my API" names a format, not the founder's own data.
const DATA_NOUN = /\b(data|report|records?|intelligence|execution|history|progress|profile|everything)\b/;
const FORMAT_PHRASE = /\b(json|csv)\b/;
const RECORD_PHRASE = /\b(execution|intelligence)\s+(record|records|report|data|history)\b|\brecord\s+of\s+(my\s+)?(execution|progress|work)\b/;

const BACKLOG_NOUN =
  /\b(backlog|open tasks?|pending tasks?|incomplete tasks?|unfinished tasks?|remaining tasks?|outstanding tasks?|to-?do list|todo list)\b/;
const TASK_STATE = "(?:open|pending|completed|done|finished|incomplete|unfinished|remaining|outstanding)";
const TASKS_NOUN = new RegExp(
  `\\b(?:(?:my|all|every)\\s+(?:${TASK_STATE}\\s+)?tasks?|${TASK_STATE}\\s+tasks?|tasks?\\s+(?:are\\s+|is\\s+)?(?:left|open|pending|remaining|outstanding))\\b`,
);
const LIST_VERB = /\b(show|list|see|give|pull(?: up)?|display|what|which|how many|any|get|fetch|export|download)\b/;

function extractMilestone(t: string): string | undefined {
  const patterns = [
    // The tempered group stops a preposition from being swallowed into the
    // capture: "in my backlog for the launch milestone" → "launch", not
    // "my backlog for the launch".
    /\b(?:on|for|in|under|from)\s+(?:the\s+)?["“']?((?:(?!\b(?:on|for|in|under|from)\b)[^"”'?.!,]){2,80}?)["”']?\s+milestone\b/,
    /\bmilestone\s*[:\-]?\s*["“']?([^"”'?.!,]{2,80})/,
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m?.[1]) {
      const cleaned = m[1].trim().replace(/^(the|my)\s+/, "");
      if (cleaned.length >= 2) return cleaned.slice(0, 80);
    }
  }
  return undefined;
}

function extractLimit(t: string): number | undefined {
  const m =
    t.match(/\b(?:top|first|latest|last)\s+(\d{1,3})\b/) ??
    t.match(/\b(\d{1,3})\s+(?:open\s+|pending\s+|oldest\s+)?tasks?\b/);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : undefined;
}

function extractBacklogParams(t: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (/\b(completed|done|finished)\s+tasks?\b|\btasks?\s+(i'?ve\s+|i have\s+)?(completed|done|finished)\b/.test(t)) {
    params.status = "completed";
  } else if (/\ball\s+(my\s+)?tasks?\b|\bevery task\b/.test(t)) {
    params.status = "all";
  }
  const milestone = extractMilestone(t);
  if (milestone) params.milestone = milestone;
  const limit = extractLimit(t);
  if (limit) params.limit = limit;
  return params;
}

export function matchCoachAction(message: string): CoachActionMatch | null {
  const t = (message ?? "").trim().toLowerCase();
  if (!t || t.length > MAX_MATCHABLE_LENGTH) return null;

  const hasExportVerb = EXPORT_VERB.test(t);

  // "how do I export my data" is a request for the export itself, not advice
  // about it — the advice filter shouldn't swallow it.
  if (ADVICE_OR_EMOTION.test(t) && !hasExportVerb) return null;

  const wantsBacklog = BACKLOG_NOUN.test(t) || (TASKS_NOUN.test(t) && LIST_VERB.test(t));

  // Backlog wins over the generic export when the noun is tasks/backlog:
  // "export my backlog as csv" means the backlog, not the intelligence report.
  if (wantsBacklog && (LIST_VERB.test(t) || t.startsWith("backlog"))) {
    return { id: "list_backlog", params: extractBacklogParams(t) };
  }

  const wantsExport =
    (hasExportVerb && DATA_NOUN.test(t)) ||
    (RECORD_PHRASE.test(t) && (REQUEST_VERB.test(t) || FORMAT_PHRASE.test(t))) ||
    (FORMAT_PHRASE.test(t) && REQUEST_VERB.test(t) && /\bmy\b/.test(t) && DATA_NOUN.test(t));

  if (wantsExport) {
    const params: Record<string, unknown> = {};
    if (/\bcsv\b/.test(t)) params.format = "csv";
    if (/\b(history|30 days|past month|last month|snapshots|over time)\b/.test(t)) params.history = true;
    return { id: "export_intelligence", params };
  }

  return null;
}
