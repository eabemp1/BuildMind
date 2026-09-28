/**
 * lib/coachActions/matcher.ts
 *
 * Deterministic intent matching for Coach Actions — zero tokens, works when
 * every AI provider is rate-limited or down. Pure (no server imports), so
 * the coach page runs the exact same function the server does, which is how
 * the client knows a free-plan founder's "show my open tasks" shouldn't be
 * blocked by the daily coaching-message cap.
 *
 * The bar for matching is deliberately HIGH. A false positive hijacks a real
 * coaching conversation ("my backlog is crushing me" must reach the coach, not
 * return a task list); a false negative just falls through to normal coaching,
 * which is harmless. So: explicit request phrasing only, short messages only,
 * and anything that reads as advice-seeking or emotional never matches.
 * Intents that are meta-questions about BuildMind itself ("why did you
 * recommend that") are checked before the advice filter, because their
 * phrasing overlaps it without being venting.
 *
 * Order matters and is tested: more specific intents are tried first
 * (backlog → execution log → milestones → signals → beliefs → momentum →
 * decision) with the generic data export last.
 *
 * This is the model-independent layer. A stronger model can later be added as
 * a second-stage router for phrasing this can't catch; it would return the
 * same { id, params } and nothing here needs to change.
 */

import type { CoachActionMatch } from "./types";

const MAX_MATCHABLE_LENGTH = 160;

// Reads as seeking advice or venting — coaching, not a data request.
const ADVICE_OR_EMOTION =
  /\b(should i|why (am|do|is|are|can'?t)|what do you think|do you think|advice|i feel|i'?m feeling|feeling|overwhelm\w*|stuck|afraid|scared|worried|anxious|stress\w*|frustrat\w*|behind on|too many|help me)\b/;

const EXPORT_VERB = /\b(export|download)\b/;
const REQUEST_VERB = /\b(give|send|get|show|pull(?: up)?|see|need|want|fetch|generate|display|list)\b/;
const LIST_VERB = /\b(show|list|see|give|pull(?: up)?|display|what|which|how many|any|get|fetch|export|download)\b/;
const FORMAT_PHRASE = /\b(json|csv)\b/;

// ── Backlog ────────────────────────────────────────────────────────────────
const BACKLOG_NOUN =
  /\b(backlog|open tasks?|pending tasks?|incomplete tasks?|unfinished tasks?|remaining tasks?|outstanding tasks?|to-?do list|todo list)\b/;
const TASK_STATE = "(?:open|pending|completed|done|finished|incomplete|unfinished|remaining|outstanding)";
const TASKS_NOUN = new RegExp(
  `\\b(?:(?:my|all|every)\\s+(?:${TASK_STATE}\\s+)?tasks?|${TASK_STATE}\\s+tasks?|tasks?\\s+(?:are\\s+|is\\s+)?(?:left|open|pending|remaining|outstanding))\\b`,
);

function extractMilestone(t: string): string | undefined {
  const patterns = [
    // The tempered group stops a preposition from being swallowed into the
    // capture: "in my backlog for the launch milestone" → "launch".
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

// ── Execution log ──────────────────────────────────────────────────────────
const EXECUTION_LOG_NOUN =
  /\b(execution (?:log|record|records|history|data)|action (?:log|history)|activity log|record of (?:my )?(?:execution|actions|activity))\b/;
const WHAT_I_DID =
  /\bwhat (?:did|have) i (?:complete|completed|finish|finished|ship|shipped|worked on|work on)\b|\bwhat (?:did|have) i (?:do|done)(?= (?:today|yesterday|this week|last week|this month|recently|lately|so far)\b|$)/;

function extractLogParams(t: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const n = t.match(/\b(?:last|past|previous)\s+(\d{1,2})\s+days?\b/);
  if (n) params.days = Math.min(Math.max(parseInt(n[1], 10), 1), 90);
  else if (/\byesterday\b/.test(t)) params.days = 2;
  else if (/\btoday\b/.test(t)) params.days = 1;
  else if (/\bthis week\b/.test(t)) params.days = 7;
  else if (/\blast week\b/.test(t)) params.days = 14;
  else if (/\b(this|last|past) month\b|\b30 days\b/.test(t)) params.days = 30;
  if (/\bcsv\b/.test(t)) params.format = "csv";
  else if (/\bjson\b/.test(t)) params.format = "json";
  return params;
}

// ── Milestones ─────────────────────────────────────────────────────────────
const MILESTONES_STRONG =
  /\b(?:milestone (?:progress|status|overview|pacing)|how are my milestones|(?:list|show)(?: me)?(?: (?:all|my|all my|all of my))? milestones?)\b/;
const MILESTONES_NOUN = /\b(?:my milestones?|all (?:of )?(?:my )?milestones?|milestones? (?:i have|do i have))\b/;

// ── Signals ────────────────────────────────────────────────────────────────
// Anchored to "you"/"my"/"active": "what signals do customers give when
// they're interested" is a question about the world, not this founder's data.
const SIGNALS_PHRASE =
  /\b(?:my (?:current |active )?signals|(?:any|the) (?:new |active |current )?signals (?:you|buildmind)|active signals|current signals|signals (?:are )?(?:you|buildmind)(?:'re| are)? (?:seeing|noticing|detecting|tracking|flagging)|what (?:are )?you (?:seeing|noticing|detecting|flagging)|any (?:new )?signals|what is buildmind (?:seeing|noticing|detecting))\b/;

// ── Beliefs ────────────────────────────────────────────────────────────────
const BELIEFS_PHRASE =
  /\bwhat (?:do|does) (?:you|buildmind) (?:believe|know|think you know)(?: about me)?\b|\bwhat (?:have you|has buildmind) (?:learned|found|noticed|detected|figured out) about me\b|\bwhat patterns (?:have|has) (?:you|buildmind)\b|\b(?:show|list|see|give|what are)(?: me)? my (?:strengths|avoidance patterns?|beliefs|founder model|behavioral profile)\b/;

// ── Momentum ───────────────────────────────────────────────────────────────
const MOMENTUM_PHRASE =
  /\b(?:what'?s|what is|whats|how'?s|how is|show(?: me)?|check|see|give me|tell me)\b[^.?!]{0,25}\b(?:momentum|streak|xp)\b|\bhow many xp\b|\bmomentum score\b/;

// ── Decision reasoning ─────────────────────────────────────────────────────
const DECISION_PHRASE =
  /\bwhy did you (?:recommend|suggest|pick|choose|give me)\b|\bwhy (?:is|was) (?:that|this|it) (?:my|the|today'?s) (?:recommendation|task|action|pick)\b|\bwhat (?:else|other options?|alternatives?) (?:did|were) you (?:consider\w*|weigh\w*|look\w*)\b|\bwhat did you (?:almost )?(?:recommend|consider|weigh)\b|\bhow did you (?:decide|choose|pick)\b|\bdecision reasoning\b|\breasoning behind (?:my|the|today'?s) (?:recommendation|task|action)\b/;

// ── Intelligence export ────────────────────────────────────────────────────
// No format words and no "execution" here: json/csv name a format, not the
// founder's data ("show me json examples for my API"), and execution records
// go to the execution log above.
const DATA_NOUN = /\b(data|report|records?|intelligence|history|progress|profile|everything)\b/;
const INTELLIGENCE_RECORD = /\bintelligence\s+(?:record|records|report|data|history)\b/;

export function matchCoachAction(message: string): CoachActionMatch | null {
  // Trailing punctuation off so "what have i done?" and "what have i done" match alike.
  const t = (message ?? "").trim().toLowerCase().replace(/[?.!]+$/, "");
  if (!t || t.length > MAX_MATCHABLE_LENGTH) return null;

  // Meta-questions about BuildMind's own reasoning — before the advice filter.
  if (DECISION_PHRASE.test(t)) return { id: "get_decision_reasoning", params: {} };

  const hasExportVerb = EXPORT_VERB.test(t);
  // "how do I export my data" is a request for the export itself, not advice.
  if (ADVICE_OR_EMOTION.test(t) && !hasExportVerb) return null;

  // Backlog wins over everything below when the noun is tasks/backlog:
  // "export my backlog as csv" means the backlog, and "…on the pricing
  // milestone" is a backlog filter, not a milestones request.
  const wantsBacklog = BACKLOG_NOUN.test(t) || (TASKS_NOUN.test(t) && LIST_VERB.test(t));
  if (wantsBacklog && (LIST_VERB.test(t) || t.startsWith("backlog"))) {
    return { id: "list_backlog", params: extractBacklogParams(t) };
  }

  if (
    (EXECUTION_LOG_NOUN.test(t) && (LIST_VERB.test(t) || REQUEST_VERB.test(t) || FORMAT_PHRASE.test(t))) ||
    WHAT_I_DID.test(t)
  ) {
    return { id: "get_execution_log", params: extractLogParams(t) };
  }

  if (MILESTONES_STRONG.test(t) || (MILESTONES_NOUN.test(t) && LIST_VERB.test(t))) {
    return { id: "list_milestones", params: {} };
  }

  if (SIGNALS_PHRASE.test(t)) return { id: "get_signals", params: {} };
  if (BELIEFS_PHRASE.test(t)) return { id: "get_beliefs", params: {} };
  if (MOMENTUM_PHRASE.test(t)) return { id: "get_momentum", params: {} };

  const wantsExport =
    (hasExportVerb && DATA_NOUN.test(t)) ||
    (INTELLIGENCE_RECORD.test(t) && (REQUEST_VERB.test(t) || FORMAT_PHRASE.test(t))) ||
    (FORMAT_PHRASE.test(t) && REQUEST_VERB.test(t) && /\bmy\b/.test(t) && DATA_NOUN.test(t));

  if (wantsExport) {
    const params: Record<string, unknown> = {};
    if (/\bcsv\b/.test(t)) params.format = "csv";
    if (/\b(history|30 days|past month|last month|snapshots|over time)\b/.test(t)) params.history = true;
    return { id: "export_intelligence", params };
  }

  return null;
}
