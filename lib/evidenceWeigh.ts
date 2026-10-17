/**
 * lib/evidenceWeigh.ts — deterministic weighing of what a founder tells BuildMind.
 *
 * Used before two founder inputs change the product's picture of them:
 *   - "I faced this" on an avoided area (raises Avoidance Resistance)
 *   - a Founder Mirror correction (lowers confidence in a belief)
 *
 * Both are self-reported, so both can be tweaked in the founder's favour. We
 * do not trust the claim; we weigh the evidence behind it with fixed rules
 * (the model is not asked, because it tends to accept what it is told):
 *
 *   specificity   0-40  numbers, named places/people, concrete past-tense action
 *   relevance     0-30  does it actually concern the area or belief in question
 *   corroboration 0-30  did BuildMind itself see matching activity (completed tasks,
 *                       reflections), independent of the founder's wording
 *
 * Penalties: copy/paste of an earlier entry, bare absolutes ("never", "always")
 * with nothing observed behind them.
 *
 * Strict: the founder's own account is never enough. "I faced this" needs a
 * matching task BuildMind recorded as completed; a mirror correction without
 * backing counts at 20% at most.
 */

export type EvidenceKind = "avoidance_faced" | "mirror_correction";
export type Verdict = "accepted" | "partial" | "needs_more";

export interface Observed {
  text: string;
  actionType?: string | null;
}

export interface WeighInput {
  kind: EvidenceKind;
  /** The zone or belief being decided. */
  claim: string;
  /** What the founder wrote as evidence. */
  text: string;
  /** Activity BuildMind recorded itself (recent completed tasks, reflections). */
  observed?: Observed[];
  /** Earlier evidence texts from this founder, to catch copy/paste reuse. */
  previousTexts?: string[];
  /** Words that make text relevant to the claim (e.g. "post", "linkedin" for Visibility). */
  relatedWords?: string[];
  /** Caller-computed: a recorded action already matches this area (e.g. zoneMatchesActions). */
  observedMatch?: boolean;
}

export interface Weighed {
  verdict: Verdict;
  score: number;
  /** Multiplier the caller applies to the effect: 1 accepted, 0.4 partial, 0 needs_more. */
  weight: number;
  corroborated: boolean;
  reasons: string[];
  hints: string[];
}

export const ACCEPT_AT = 60;
export const PARTIAL_AT = 35;
export const PARTIAL_WEIGHT = 0.4;
export const UNBACKED_PARTIAL_AT = 45;
export const UNBACKED_WEIGHT = 0.2;

const STOP = new Set(["the", "and", "for", "with", "your", "from", "that", "this", "have", "into", "about", "what", "when", "been", "were", "they", "them", "then", "than", "just", "really", "also", "some", "more", "very", "much"]);

function tokens(s: string): string[] {
  return (s ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((w) => w.length > 3 && !STOP.has(w))
    .map((w) => w.replace(/(ing|ed|es|s)$/u, ""));
}

const FLUFF_RE = /^\s*(?:yes|yeah|yep|ok(?:ay)?|done|did it|i did it|i did|i faced it|faced it|trust me|just because|it'?s wrong|that'?s wrong|not true|wrong|no|nope|nah|whatever|because)[\s.!]*$/i;
const NUMBER_RE = /\b\d+(?:[.,]\d+)?\s*(?:%|x|k|m)?\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|dozen)\b/i;
const ACTION_RE = /\b(?:posted|sent|published|shipped|launched|emailed|called|messaged|dm'?d|interviewed|spoke|talked|met|joined|wrote|drafted|submitted|pitched|asked|booked|scheduled|deployed|fixed|built|charged|invoiced|signed|recorded|tested|ran|did|completed|finished|started|reached\s+out|cold[\s-]emailed)\b/i;
const NAMED_RE = /https?:\/\/\S+|\b[a-z0-9-]+\.(?:com|io|app|co|ai|live|dev)\b|@\w{2,}|#\w{2,}|\br\/\w+|\b(?:linkedin|twitter|reddit|whatsapp|slack|discord|telegram|gmail|instagram|tiktok|facebook|youtube|product\s*hunt|hacker\s*news|stripe|paystack|notion|figma)\b|\b[A-Z][a-z]{2,}\b(?=.*\b[a-z])/;
const ABSOLUTE_RE = /\b(?:always|never|completely|totally|entirely|nothing|everything|100%|obviously|clearly|literally)\b/i;

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export function weighEvidence(input: WeighInput): Weighed {
  const text = (input.text ?? "").trim();
  const reasons: string[] = [];
  const hints: string[] = [];

  const textTokens = tokens(text);
  const claimTokens = tokens(input.claim);

  // Copy/paste of an earlier entry carries no new information.
  for (const prev of input.previousTexts ?? []) {
    if (prev && jaccard(textTokens, tokens(prev)) >= 0.8) {
      return {
        verdict: "needs_more", score: 0, weight: 0, corroborated: false,
        reasons: ["This matches something you already submitted."],
        hints: ["Describe what is new since then: what you did, and what happened."],
      };
    }
  }

  // ── Specificity
  let spec = 0;
  if (FLUFF_RE.test(text) || textTokens.length < 2) {
    reasons.push("Too short to check.");
  } else {
    spec += text.length >= 40 ? 14 : text.length >= 15 ? 8 : 0;
    if (NUMBER_RE.test(text)) spec += 10;
    if (ACTION_RE.test(text)) spec += 8;
    if (NAMED_RE.test(text)) spec += 8;
    spec = Math.min(40, spec);
  }
  if (spec < 24) hints.push("Say what you actually did, with a number or a name, e.g. \"DM'd 5 founders on LinkedIn, 2 replied\".");

  // ── Relevance
  const pool = new Set(textTokens);
  const hits = claimTokens.filter((t) => pool.has(t)).length;
  const lower = text.toLowerCase();
  const relHits = (input.relatedWords ?? []).filter((w) => lower.includes(w)).length;
  const all = hits + relHits;
  let rel = all >= 2 ? 30 : all === 1 ? 20 : 0;
  if (claimTokens.length === 1 && hits === 1) rel = 30;
  // A general statement has nothing specific to be relevant to.
  if (claimTokens.length === 0 && !(input.relatedWords ?? []).length) rel = 20;
  if (input.observedMatch && rel < 15) rel = 15; // the action type itself fits the area
  if (rel < 20) hints.push(`Tie it to "${input.claim.slice(0, 60)}": how does this relate to it?`);

  // ── Corroboration (what BuildMind saw itself)
  let corr = 0;
  if (input.observedMatch) corr = 30;
  else {
    const combined = new Set([...textTokens, ...claimTokens]);
    const matching = (input.observed ?? []).filter((o) => {
      const t = tokens(o.text);
      let n = 0;
      for (const x of t) if (combined.has(x)) n++;
      return n >= 2;
    }).length;
    corr = matching >= 2 ? 30 : matching === 1 ? 15 : 0;
  }
  const corroborated = corr >= 15;
  if (!corroborated) hints.push("Finish a task in BuildMind that tackles this and it counts automatically. A written claim alone does not.");

  let score = spec + rel + corr;
  // Self-report alone cannot exceed just above the line.
  if (!corroborated) score = Math.min(score, 66);
  // Bare absolutes with nothing observed behind them.
  if (ABSOLUTE_RE.test(text) && !corroborated && !NUMBER_RE.test(text)) {
    score -= 15;
    reasons.push("A sweeping claim with nothing to check it against.");
  }
  score = Math.max(0, Math.min(100, score));

  // Strict by design: a founder's own account never settles it alone. The point
  // of these checks is to make the founder face what the record shows, not what
  // he would like it to show.
  let verdict: Verdict;
  let weight: number;
  if (corroborated) {
    verdict = score >= ACCEPT_AT ? "accepted" : score >= PARTIAL_AT ? "partial" : "needs_more";
    weight = verdict === "accepted" ? 1 : verdict === "partial" ? PARTIAL_WEIGHT : 0;
  } else if (input.kind === "avoidance_faced") {
    verdict = "needs_more";
    weight = 0;
    reasons.push("Nothing in your recorded activity shows this area was tackled.");
  } else if (score >= UNBACKED_PARTIAL_AT) {
    verdict = "partial";
    weight = UNBACKED_WEIGHT;
    reasons.push("Your records don't back this yet, so it counts very lightly.");
  } else {
    verdict = "needs_more";
    weight = 0;
  }
  if (verdict === "accepted") reasons.push("Backed by activity BuildMind recorded.");
  // The most useful next step first: for an unbacked claim, that is doing the work.
  const ordered = corroborated ? hints : [hints.find((h) => h.startsWith("Finish")) ?? "", ...hints.filter((h) => !h.startsWith("Finish"))].filter(Boolean);
  return { verdict, score, weight, corroborated, reasons, hints: verdict === "accepted" ? [] : ordered.slice(0, 3) };
}

/** Plain-language summary for the UI. */
export function verdictMessage(w: Pick<Weighed, "verdict" | "hints" | "reasons">): string {
  if (w.verdict === "accepted") return "Counted.";
  const lead = w.verdict === "partial" ? "Counted lightly. " : "Not enough to count yet. ";
  return lead + (w.hints[0] ?? w.reasons[0] ?? "");
}
