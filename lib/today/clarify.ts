/**
 * lib/today/clarify.ts - turns the founder's late-night "tomorrow's first move" into a line
 * that still makes sense the next morning.
 *
 * Written at 10pm, "the pricing thing" is clear. At 8am it is not. The fix keeps the
 * founder's words but makes the line self-contained: one imperative sentence that names
 * the object, with the task it continues. A model may rewrite it, but only a rewrite that
 * passes `acceptRewrite` is used; otherwise this deterministic version ships.
 */

const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

const ACTION_VERBS = [
  "send", "write", "email", "call", "ask", "post", "publish", "build", "fix", "ship", "finish", "draft", "book", "schedule", "message", "dm",
  "talk", "interview", "review", "update", "create", "test", "launch", "record", "list", "research", "contact", "follow", "reply", "set", "add",
  "remove", "decide", "pick", "choose", "check", "open", "make", "start", "ping", "share", "cut", "reach", "pitch", "price", "charge", "sign",
];

const LEAD_FILLER = /^(?:\s*(?:ok(?:ay)?|so|well|um|uh|maybe|perhaps|probably|just|then|first|tomorrow|tmrw|i\s*(?:will|'ll|am going to|'m going to|should|need to|have to|want to|gotta|gonna|think i should)|we\s*(?:should|need to)|(?:need|have|want|try|trying|going|plan|planning)\s+to|gotta|gonna|try(?:ing)?\s+to|let'?s)\b[\s,:-]*)+/i;

const STOP = new Set(["the", "a", "an", "to", "and", "of", "for", "on", "in", "it", "my", "that", "this", "with", "is", "be", "i", "you", "your", "thing", "stuff"]);

export function contentWords(s: string): string[] {
  return (s.toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) ?? []).filter((w) => !STOP.has(w));
}

export function hasLeadingVerb(s: string): boolean {
  const first = (s.trim().toLowerCase().match(/^[a-z]+/) ?? [""])[0];
  return ACTION_VERBS.includes(first);
}

/** Strip hedges and "I'll"; keep what is left of the founder's own wording. */
export function stripFiller(raw: string): string {
  let t = clip(raw, 400).replace(LEAD_FILLER, "").replace(/\s+(?:maybe|i guess|or something|or whatever|if i can)\W*$/i, "").trim();
  t = t.replace(/[.!?\s]+$/, "");
  return t;
}

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The task a move continues, shortened to something that fits on one line. */
export function taskContext(task: string | null | undefined): string {
  const t = clip(task ?? "", 140);
  if (!t) return "";
  const cut = t.length > 90 ? `${t.slice(0, 90).replace(/\s+\S*$/, "")}...` : t;
  return cut;
}

export interface ClearMove { clear: string; vague: boolean; context: string }

/** Deterministic: the same words always give the same line. */
export function clarifyMove(raw: string | null | undefined, task?: string | null): ClearMove {
  const stripped = stripFiller(raw ?? "");
  const context = taskContext(task);
  if (!stripped) return { clear: "", vague: true, context };
  const words = stripped.split(/\s+/).length;
  const concrete = hasLeadingVerb(stripped) && words >= 3;
  if (concrete) return { clear: capital(stripped), vague: false, context };
  // Too thin to survive the night: say what it continues so the morning reader knows what "it" is.
  const base = capital(stripped);
  const clear = context ? `${base} (continuing: ${context})` : base;
  return { clear: clip(clear, 240), vague: true, context };
}

/** A model rewrite is only used when it is short, one sentence, and grounded in the founder's words or task. */
export function acceptRewrite(rewrite: unknown, raw: string, task?: string | null): string | null {
  if (typeof rewrite !== "string") return null;
  const r = clip(rewrite, 240);
  if (r.length < 8 || r.length > 220) return null;
  if (/[\[\]{}]|\n/.test(rewrite) || (r.match(/[.!?]\s+\S/g)?.length ?? 0) > 0) return null; // one sentence, no placeholders
  if (!hasLeadingVerb(r)) return null;
  const allowed = new Set([...contentWords(raw), ...contentWords(task ?? "")]);
  const used = contentWords(r);
  if (!used.length) return null;
  const grounded = used.filter((w) => allowed.has(w)).length;
  // Most of what it says must come from the founder's own words or task; no invented nouns.
  return grounded / used.length >= 0.6 ? r : null;
}
