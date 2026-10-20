/**
 * lib/today/facts.ts — the founder fact ledger.
 *
 * Reflections are free text, so a hard constraint ("I don't have any beta
 * users", "I have no access to Discord groups") used to live in one note and
 * then be forgotten: in a real account the generator told a founder with zero
 * users to "email three beta users" five times in three weeks.
 *
 * This module turns reflection text into explicit FACTS and OPEN LOOPS that
 * (a) are injected into the generator prompt as rules and (b) are enforced
 * deterministically on the generated task (contradictions → rejected).
 *
 * Pure and dependency-free so it is cheap to unit-test against real data.
 * Rule-based on purpose: it never invents a fact, and every fact carries the
 * founder's own words as evidence.
 */

export interface ReflectionText {
  created_at: string;
  outcome?: string | null;
  today_action?: string | null;
  note?: string | null;
  what_tried?: string | null;
  what_happened?: string | null;
  what_learned?: string | null;
  blocker?: string | null;
}

export type FactKind = "no_users" | "no_access" | "search_failed" | "already_done" | "direction" | "too_big" | "rejected";

export interface Fact {
  kind: FactKind;
  /** Platform / thing the fact is about (lowercase), when relevant. */
  subject?: string;
  /** Rule written for the generator. */
  rule: string;
  /** The founder's own words. */
  evidence: string;
  at: string;
  /** For already_done: the task text that was already done. */
  doneTask?: string;
}

export interface OpenLoop {
  text: string;
  at: string;
  task?: string;
}

const DAY = 24 * 60 * 60 * 1000;

/** How long each kind of fact is trusted before it should be re-checked. */
const TTL_DAYS: Record<FactKind, number> = {
  no_users: 30,
  no_access: 10,
  search_failed: 7,
  already_done: 45,
  direction: 21,
  too_big: 14,
  rejected: 14,
};

export const PLATFORMS = [
  "discord", "slack", "reddit", "linkedin", "whatsapp", "twitter", "x", "telegram", "facebook",
  "instagram", "tiktok", "youtube", "indie hackers", "product hunt", "hacker news", "email",
] as const;

function textOf(r: ReflectionText): string {
  return [r.what_tried, r.what_happened, r.what_learned, r.blocker, r.note]
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0 && s.trim().toLowerCase() !== "null")
    .join(" \n ");
}

function clip(s: string, n = 160): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function mentionedPlatform(s: string): string | undefined {
  const l = ` ${s.toLowerCase()} `;
  for (const p of PLATFORMS) {
    if (new RegExp(`[^a-z]${p.replace(/ /g, "\\s+")}[^a-z]`).test(l)) return p;
  }
  return undefined;
}

// "I don't (yet) have any (beta) users", "I have no users", "no beta users", "0 users"
const NO_USERS_RULE = "The founder has NO users yet. Never write a task that messages, emails, interviews, surveys or follows up 'your users', 'beta users', 'paying' customers, or anyone who 'used' or 'tried' the product. Tasks must find or reach people who have never used it, with the goal of getting the first 5 users.";
const noAccessRule = (subject: string) => `The founder has no access to ${subject} communities right now. Do not assign tasks that need ${subject} (joining, posting, DMing there) unless the task first gets access in a way that works today.`;

const NO_USERS_RE = new RegExp(
  [
    String.raw`\bi\s+(?:do\s*n[o']?t|don'?t|dont|haven'?t|have\s*n[o']?t|have\s+not)\s+(?:yet\s+)?(?:have|got)\s+(?:any\s+|a\s+single\s+)?(?:beta\s+|paying\s+|active\s+|real\s+)?(?:users?|customers?|signups?|sign-ups?|clients?|testers?)\b`,
    String.raw`\b(?:i\s+have|there\s+are|got)\s+(?:no|zero|0)\s+(?:beta\s+|paying\s+|active\s+|real\s+)?(?:users?|customers?|signups?|sign-ups?|clients?|testers?)\b`,
    String.raw`\bno\s+(?:beta\s+|paying\s+|active\s+|real\s+)?(?:users?|customers?|signups?)\s+(?:yet|so\s+far)\b`,
    String.raw`\bnobody\s+(?:has\s+)?(?:signed\s+up|used\s+it|joined)\b`,
  ].join("|"),
  "i",
);

// A later reflection that says they now HAVE users cancels the fact.
const GOT_USERS_RE = /\b(?:got|have|gained|landed|onboarded|first)\s+(?:my\s+)?(?:first\s+)?(?:\d+|one|two|three|four|five|several|a\s+few|new)?\s*(?:new\s+)?(?:beta\s+)?(?:users?|customers?|signups?|sign-ups?)\b(?!\s*(?:yet))/i;

const NO_ACCESS_RE = /(?:\bdon'?t|\bdo\s+not|\bdidn'?t|\bdid\s+not|\bcan'?t|\bcannot|\bcouldn'?t|\bhave\s+no|\bno)\s+(?:have\s+)?(?:any\s+)?access\s+to\s+([^.,;\n]{3,80})/i;
const SEARCH_FAILED_RE = /(?:looking|searching|searched|looked)\s+for\s+([^.,;\n]{3,90}?)\s+(?:and|but)\s+(?:i\s+)?(?:didn'?t|did\s+not|couldn'?t|could\s+not|never|can'?t)\s+(?:find|locate|get)/i;
const ALREADY_DONE_RE = /\balready\s+(?:implemented|built|done|drafted|created|finished|completed|published|shipped|written|set\s+up|added|made|have)\b/i;
const TOMORROW_RE = /tomorrow['’]s first move:\s*([^\n]{3,200})/i;
const DIRECTION_RE = /\b(?:current\s+)?(?:direction|focus|priority)\s+is\s+([^.\n]{3,100})/i;

const LOOP_RE = /\b(?:still\s+waiting|waiting\s+(?:for|on|a\s+full|to)|haven'?t\s+(?:yet\s+)?(?:recei|heard|got\s+a|gotten)|have\s+not\s+(?:yet\s+)?(?:recei|heard)|will\s+(?:check|measure|follow\s*up)|to\s+measure|no\s+reply\s+yet|awaiting)/i;

/** Split on sentence ends / newlines and return the sentence containing the match. */
function sentenceAround(text: string, m: RegExpExecArray): string {
  const start = Math.max(text.lastIndexOf(".", m.index), text.lastIndexOf("\n", m.index)) + 1;
  const endDot = text.indexOf(".", m.index + m[0].length);
  const endNl = text.indexOf("\n", m.index + m[0].length);
  const ends = [endDot, endNl].filter((i) => i >= 0);
  const end = ends.length ? Math.min(...ends) : text.length;
  return text.slice(start, end).trim();
}

export type FeedbackReason = "no_users" | "no_access" | "already_done" | "too_big" | "not_relevant" | "no_time" | "no_motivation";

/** A founder's one-tap "this task doesn't fit me" (today_feedback row). */
export interface FeedbackRow {
  task_text: string;
  reason: FeedbackReason;
  note?: string | null;
  created_at: string;
}

export interface LedgerOptions {
  now?: number;
  feedback?: FeedbackRow[];
}

export interface Ledger {
  facts: Fact[];
  openLoops: OpenLoop[];
}

/**
 * Build the ledger from reflections (any order). Newer evidence wins:
 * a later "I got my first users" cancels an earlier "I have no users".
 */
export function buildLedger(reflections: ReflectionText[], opts: LedgerOptions = {}): Ledger {
  const now = opts.now ?? Date.now();
  const sorted = [...reflections]
    .filter((r) => r && r.created_at && !Number.isNaN(Date.parse(r.created_at)))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)); // oldest → newest

  const facts: Fact[] = [];
  const loops: OpenLoop[] = [];
  const drop = (pred: (f: Fact) => boolean) => {
    for (let i = facts.length - 1; i >= 0; i--) if (pred(facts[i])) facts.splice(i, 1);
  };

  for (const r of sorted) {
    const text = textOf(r);
    if (!text) continue;
    const at = r.created_at;

    if (GOT_USERS_RE.test(text) && !NO_USERS_RE.test(text)) drop((f) => f.kind === "no_users");

    const nu = NO_USERS_RE.exec(text);
    if (nu) {
      drop((f) => f.kind === "no_users");
      facts.push({
        kind: "no_users",
        rule: NO_USERS_RULE,
        evidence: clip(sentenceAround(text, nu)),
        at,
      });
    }

    const na = NO_ACCESS_RE.exec(text);
    if (na) {
      const subject = mentionedPlatform(na[1]) ?? mentionedPlatform(text);
      if (subject) {
        drop((f) => f.kind === "no_access" && f.subject === subject);
        facts.push({
          kind: "no_access",
          subject,
          rule: noAccessRule(subject),
          evidence: clip(sentenceAround(text, na)),
          at,
        });
      }
    }

    const sf = SEARCH_FAILED_RE.exec(text);
    if (sf) {
      const subject = sf[1].trim().toLowerCase();
      facts.push({
        kind: "search_failed",
        subject,
        rule: `The founder already spent time looking for "${subject}" and could not find it. Do not ask them to find it again; name one specific alternative target instead.`,
        evidence: clip(sentenceAround(text, sf)),
        at,
      });
    }

    if (ALREADY_DONE_RE.test(text) && r.today_action) {
      facts.push({
        kind: "already_done",
        doneTask: r.today_action,
        rule: `Already done by the founder: "${clip(r.today_action, 120)}". Do not assign it, or a near copy of it, again. Build on it instead.`,
        evidence: clip(text.split("\n")[0]),
        at,
      });
    }

    const dr = DIRECTION_RE.exec(text);
    if (dr) {
      drop((f) => f.kind === "direction");
      facts.push({
        kind: "direction",
        subject: dr[1].trim().toLowerCase(),
        rule: `The founder states their current direction is: ${dr[1].trim()}. Keep today's task inside that direction.`,
        evidence: clip(sentenceAround(text, dr)),
        at,
      });
    }

    // The founder's own plan for tomorrow, written at close-out. Binding for ~40 hours.
    const tm = TOMORROW_RE.exec(text);
    if (tm && now - Date.parse(at) < 40 * 3600 * 1000) {
      drop((f) => f.kind === "direction" && f.evidence.startsWith("Tomorrow"));
      facts.push({
        kind: "direction",
        subject: tm[1].trim().toLowerCase(),
        rule: `The founder wrote their own first move for today: "${clip(tm[1].trim(), 140)}". Today's task must start from that, not from something else.`,
        evidence: `Tomorrow's first move: ${clip(tm[1].trim(), 140)}`,
        at,
      });
    }

    const lp = LOOP_RE.exec(text);
    if (lp) {
      // A newer reflection on the same task closes older loops about it.
      loops.push({ text: clip(sentenceAround(text, lp), 200), at, task: r.today_action ?? undefined });
    }
  }

  // One-tap feedback is the strongest signal: the founder said it directly.
  for (const fb of [...(opts.feedback ?? [])].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))) {
    if (!fb?.task_text || Number.isNaN(Date.parse(fb.created_at))) continue;
    const at = fb.created_at;
    const evidence = clip(fb.note?.trim() ? fb.note : `Marked "${fb.reason.replace(/_/g, " ")}" on: ${fb.task_text}`);
    if (fb.reason === "no_users") {
      drop((f) => f.kind === "no_users");
      facts.push({ kind: "no_users", rule: NO_USERS_RULE, evidence, at });
    } else if (fb.reason === "no_access") {
      const subject = mentionedPlatform(`${fb.note ?? ""} ${fb.task_text}`);
      if (subject) {
        drop((f) => f.kind === "no_access" && f.subject === subject);
        facts.push({ kind: "no_access", subject, rule: noAccessRule(subject), evidence, at });
      }
    } else if (fb.reason === "already_done") {
      facts.push({ kind: "already_done", doneTask: fb.task_text, rule: `Already done by the founder: "${clip(fb.task_text, 120)}". Do not assign it, or a near copy of it, again. Build on it instead.`, evidence, at });
    } else if (fb.reason === "too_big" || fb.reason === "no_time") {
      drop((f) => f.kind === "too_big");
      facts.push({ kind: "too_big", rule: "The founder said recent tasks were too big for the time they have. Keep today's task to ONE action that fits in 20 minutes, with the first step named.", evidence, at });
    } else if (fb.reason === "not_relevant") {
      facts.push({ kind: "rejected", doneTask: fb.task_text, rule: `The founder rejected this kind of task as not relevant: "${clip(fb.task_text, 120)}". Do not assign it or a near copy; choose a different approach.`, evidence, at });
    }
  }

  const fresh = facts.filter((f) => now - Date.parse(f.at) <= TTL_DAYS[f.kind] * DAY);
  const recentLoops = loops
    .filter((l) => now - Date.parse(l.at) <= 6 * DAY)
    .slice(-3)
    .reverse();
  return { facts: fresh, openLoops: recentLoops };
}

// ── Prompt blocks ───────────────────────────────────────────────────────────

export function factsPromptBlock(ledger: Ledger): string {
  const lines: string[] = [];
  if (ledger.facts.length) {
    lines.push("FOUNDER FACTS (stated by the founder in their own reflections; these are RULES, not suggestions):");
    for (const f of ledger.facts) lines.push(`- ${f.rule} (their words: "${f.evidence}")`);
    lines.push("-> A task that contradicts any fact above is wrong and will be rejected. Never write a task that pretends the opposite is true.");
  }
  if (ledger.openLoops.length) {
    lines.push("OPEN LOOPS (the founder is waiting on something; a good next task checks or follows up on it before starting something new):");
    for (const l of ledger.openLoops) lines.push(`- ${new Date(l.at).toISOString().slice(0, 10)}: "${l.text}"${l.task ? ` (task: "${clip(l.task, 100)}")` : ""}`);
  }
  return lines.join("\n");
}

// ── Enforcement on a generated task ─────────────────────────────────────────

// Always presumes existing users: "your/current/paying users", "people who used it".
const USERS_STRONG_RE = /\b(?:(?:your|our|current|existing|active|paying)\s+(?!(?:target|ideal|potential|prospective|future|new|first|early)\b)(?:[A-Za-z]+\s+)?(?:beta\s+)?(?:users?|customers?|testers?|founders?|members?)|(?:users?|founders?|people|customers?|testers?)\s+who\s+(?:used|tried|signed\s+up|joined|clicked|completed|use|have\s+used)|who\s+used\s+the\s+(?:referral|feature|app|product))\b/i;
// "beta users" alone is fine when the task is about GETTING them ("recruit 5 beta users").
const USERS_WEAK_RE = /\b(?:beta\s+(?:users?|founders?|testers?))\b/i;
// "DM 3 users", "email your users": contacting existing users, with no word that says they are new.
const CONTACT_USERS_RE = /\b(?:dm|message|email|call|interview|survey|ping|text|follow\s+up\s+with|schedule\s+(?:a\s+)?(?:[\w-]+\s+){0,3}(?:call|chat)\s+with)\s+(?:\d+|one|two|three|five|a|the|some)?\s*(?:[A-Za-z]+\s+){0,2}?(?:users?|customers?|testers?)\b/i;
const NEW_WORD_RE = /\b(?:new|potential|prospective|target|ideal|future|first|early)\b/i;
const ACQUIRE_RE = /\b(?:recruit|find|get|land|acquire|source|sign\s*up|onboard|convince|win|attract|reach\s+out\s+to\s+\d+\s+(?:new|potential|prospective))/i;
const ACCESS_ACTION_RE = /\b(?:join|post|dm|message|send|introduce|pitch|comment|reply|share|announce|invite)\b/i;

const STOP = new Set(["the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "with", "your", "my", "our", "is", "it", "that", "this", "at", "by", "as", "be", "you", "i", "today", "one", "two", "three"]);
function toks(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((t) => t.length > 2 && !STOP.has(t))
      .map((t) => t.replace(/(ing|ed|es|s)$/, "")),
  );
}
export function overlap(a: string, b: string): number {
  const A = toks(a), B = toks(b);
  if (!A.size || !B.size) return 0;
  let i = 0;
  A.forEach((x) => { if (B.has(x)) i++; });
  return i / Math.min(A.size, B.size);
}

export interface Contradiction {
  fact: FactKind;
  why: string;
}

/** Deterministic check of a generated task against the ledger. */
export function findContradictions(task: string, ledger: Ledger): Contradiction[] {
  const out: Contradiction[] = [];
  const t = task ?? "";
  for (const f of ledger.facts) {
    if (f.kind === "no_users" && (USERS_STRONG_RE.test(t) || (USERS_WEAK_RE.test(t) && !ACQUIRE_RE.test(t)) || (CONTACT_USERS_RE.test(t) && !NEW_WORD_RE.test(t) && !ACQUIRE_RE.test(t)))) {
      out.push({ fact: "no_users", why: "Task assumes users/beta founders exist, but the founder said they have none." });
    }
    if (f.kind === "no_access" && f.subject) {
      const platformHit = new RegExp(`\\b${f.subject.replace(/ /g, "\\s+")}\\b`, "i").test(t);
      if (platformHit && ACCESS_ACTION_RE.test(t)) {
        out.push({ fact: "no_access", why: `Task needs ${f.subject}, which the founder said they cannot access.` });
      }
    }
    if (f.kind === "search_failed" && f.subject && overlap(t, f.subject) >= 0.6) {
      out.push({ fact: "search_failed", why: `Asks the founder to find "${f.subject}" again after they could not.` });
    }
    if (f.kind === "already_done" && f.doneTask && overlap(t, f.doneTask) >= 0.7) {
      out.push({ fact: "already_done", why: "Repeats something the founder said they already did." });
    }
    if (f.kind === "rejected" && f.doneTask && overlap(t, f.doneTask) >= 0.7) {
      out.push({ fact: "rejected", why: "Repeats a task the founder marked as not relevant." });
    }
  }
  return out;
}
