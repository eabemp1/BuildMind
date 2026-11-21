/**
 * lib/break/review.ts: the final review of a Break My Startup report. Pure.
 * A strong model is asked, per claim, whether the evidence in the report supports it. Claims it does not confirm are
 * removed, and so are claims that fail a rule that needs no model (a number or an invented experience that is nowhere in
 * the evidence). The rules run whether or not the model answered, so a timeout never lets an unsupported claim through.
 * The report is labelled by what really happened: reviewed, or partial / not reviewed.
 */
import { unsupportedNumbers } from "@/lib/distribution/engine";
import { inventedExperience } from "@/lib/prep/experienceGuard";

export type ReviewStatus = "pending" | "reviewed" | "partial" | "unavailable";
export interface ReviewBlock {
  status: ReviewStatus;
  /** How many analysis steps of the five finished. Shown next to the review label so a reviewed verdict is not read as a complete one. */
  agents: { succeeded: number; total: number } | null;
  /** How many times the review model was called for this report (capped). */
  attempts: number;
  /** What was asked for and what answered. */
  requested_model: string | null;
  actual_model: string | null;
  ms: number | null;
  reason: string | null;
  removed_by_model: number;
  removed_by_rule: number;
  missing_evidence: string[];
  label: string;
}

type Data = Record<string, unknown>;
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const text = (v: unknown) => (typeof v === "string" ? v : "");
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);

export interface Claim { id: string; text: string }

/** Every statement in the report that says something about the world. Ids point back into the report. */
export function claimsOf(d: Data): Claim[] {
  const out: Claim[] = [];
  if (text(d.verdict)) out.push({ id: "verdict", text: text(d.verdict) });
  strs(d.kill_reasons).forEach((t, i) => out.push({ id: `kill:${i}`, text: t }));
  strs(d.survive_reasons).forEach((t, i) => out.push({ id: `survive:${i}`, text: t }));
  strs(d.differentiation_plan).forEach((t, i) => out.push({ id: `diff:${i}`, text: t }));
  if (text(d.competitor_summary)) out.push({ id: "competitors", text: text(d.competitor_summary) });
  return out;
}

/** The evidence the reviewer may rely on: what the report itself gathered. Nothing else counts. */
export function dossierOf(d: Data, idea: string): string {
  const comps = (Array.isArray(d.competitors) ? d.competitors : []).slice(0, 8).map((c) => {
    const o = (c ?? {}) as Record<string, unknown>;
    return `- ${clip(text(o.name), 80)} ${clip(text(o.url), 120)} ${clip(text(o.summary) || text(o.description) || text(o.snippet), 240)}`;
  });
  const agents = Object.entries((d.agent_outputs ?? {}) as Record<string, unknown>).map(([k, v]) => `${k}: ${clip(JSON.stringify(v ?? {}), 1600)}`);
  return [
    `FOUNDER'S IDEA: ${clip(idea, 1200)}`,
    comps.length ? `COMPETITORS FOUND:\n${comps.join("\n")}` : "COMPETITORS FOUND: none",
    `AGENT FINDINGS:\n${agents.join("\n") || "none"}`,
    // The tests BuildMind proposes are generated text, not evidence, so they are left out of what claims are checked against.
    d.evidence_layer ? `EVIDENCE LAYER: ${clip(JSON.stringify({ ...(d.evidence_layer as object), falsifiers: undefined }), 3000)}` : "",
    d.signal_summary ? `SIGNALS: ${JSON.stringify(d.signal_summary)}` : "",
  ].filter(Boolean).join("\n\n");
}

export const REVIEW_SCHEMA = {
  name: "break_review",
  schema: {
    type: "object", additionalProperties: false,
    required: ["claims", "missing_evidence"],
    properties: {
      claims: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "supported", "reason"], properties: { id: { type: "string" }, supported: { type: "boolean" }, reason: { type: "string" } } } },
      missing_evidence: { type: "array", items: { type: "string" } },
    },
  },
} as const;

export function reviewPrompt(dossier: string, claims: Claim[]): string {
  return `You review a startup stress-test report before the founder sees it. For EACH claim, decide whether the EVIDENCE below supports it. A claim is supported only if the evidence states it or clearly implies it. Judgement about the founder's idea (a risk, a recommendation) is supported if it follows from the evidence. A claim is NOT supported if it states a fact, name, number, customer, price, competitor behaviour or result that the evidence does not contain. Use only the evidence. Do not use what you know about the world. Answer for every claim id. In "missing_evidence" list up to 3 things the founder should find out that would settle weak claims.

EVIDENCE
${dossier}

CLAIMS
${claims.map((c) => `${c.id}: ${clip(c.text, 500)}`).join("\n")}`;
}

export interface Judgement { claims: Array<{ id: string; supported: boolean; reason: string }>; missing_evidence: string[] }

/** Rules that need no model. A claim fails if it has a number, or an experience, that is nowhere in the evidence. */
export function failsRules(claim: string, dossier: string): boolean {
  return unsupportedNumbers(claim, dossier).length > 0 || inventedExperience(claim, dossier).length > 0;
}

const removeAt = (arr: unknown, drop: Set<number>) => (Array.isArray(arr) ? arr.filter((_, i) => !drop.has(i)) : arr);

/**
 * Remove every claim that failed (by rule, or because the model did not confirm it), keeping tag arrays in step.
 * `judgement` is null when the model did not answer: only the rules apply.
 */
export function applyReview(d: Data, dossier: string, judgement: Judgement | null): { data: Data; removedByModel: number; removedByRule: number; unjudged: number } {
  const claims = claimsOf(d);
  const said = new Map((judgement?.claims ?? []).map((c) => [c.id, c.supported]));
  const drop = new Set<string>();
  let byModel = 0, byRule = 0, unjudged = 0;
  for (const c of claims) {
    if (failsRules(c.text, dossier)) { drop.add(c.id); byRule++; continue; }
    if (!judgement) continue;
    const v = said.get(c.id);
    if (v === undefined) { unjudged++; continue; }
    if (v === false) { drop.add(c.id); byModel++; }
  }
  const idxs = (prefix: string) => new Set(claims.filter((c) => c.id.startsWith(prefix) && drop.has(c.id)).map((c) => Number(c.id.split(":")[1])));
  const out: Data = { ...d };
  const prices = competitorPrices(d);
  const mark = (arr: unknown) => (Array.isArray(arr) ? arr.map((x) => (typeof x === "string" ? annotatePrices(x, prices, dossier) : x)) : arr);
  const k = idxs("kill:"), s = idxs("survive:"), f = idxs("diff:");
  out.kill_reasons = removeAt(mark(d.kill_reasons), k); out.kill_reason_tags = removeAt(d.kill_reason_tags, k);
  out.survive_reasons = removeAt(mark(d.survive_reasons), s); out.survive_reason_tags = removeAt(d.survive_reason_tags, s);
  out.differentiation_plan = removeAt(mark(d.differentiation_plan), f); out.differentiation_plan_tags = removeAt(d.differentiation_plan_tags, f);
  // The tests the founder is told to run: every price in them is sourced or replaced.
  const layer = d.evidence_layer as { falsifiers?: Array<Record<string, unknown>> } | undefined;
  if (layer && Array.isArray(layer.falsifiers)) {
    out.evidence_layer = { ...(d.evidence_layer as object), falsifiers: layer.falsifiers.map((fl) => ({ ...fl, test: typeof fl.test === "string" ? annotatePrices(fl.test, prices, dossier) : fl.test })) };
  }
  if (drop.has("competitors")) out.competitor_summary = "Not shown: the competitor summary was not supported by what was found.";
  if (drop.has("verdict")) out.verdict = "The first verdict was not supported by the evidence, so it is not shown. Use the findings below.";
  return { data: out, removedByModel: byModel, removedByRule: byRule, unjudged };
}

/** Count the analysis steps that finished, from the report's own statuses. Null when the report carries none. */
export function agentCounts(d: Data): { succeeded: number; total: number } | null {
  const st = d.agent_statuses;
  if (!st || typeof st !== "object") return null;
  const v = Object.values(st as Record<string, unknown>);
  return v.length ? { succeeded: v.filter((x) => x === "success").length, total: v.length } : null;
}

/** Prices that a competitor's own page showed, from the report's competitor brief: [{ name, price }]. */
export function competitorPrices(d: Data): Array<{ name: string; price: string }> {
  const brief = ((d.agent_outputs ?? {}) as Record<string, unknown>).competitor as { brief?: unknown } | null | undefined;
  const list = Array.isArray(brief?.brief) ? (brief!.brief as Array<Record<string, unknown>>) : [];
  const out: Array<{ name: string; price: string }> = [];
  for (const c of list) {
    const m = /^Seen on their site:\s*(.+)$/i.exec(text(c.pricing));
    if (!m) continue;
    for (const price of m[1].split(",").map((x) => x.trim()).filter(Boolean)) out.push({ name: text(c.name), price });
  }
  return out;
}
const AMOUNT = /(?:[$£€]|\bGHS\b|\bUSD\b)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:\/\s?(?:month|mo|year|yr)|per month))?/gi;
const norm = (t: string) => t.toLowerCase().replace(/\s+/g, "");

/**
 * Say where a price came from. A price that is a competitor's listed price gets that said next to it. A price nobody
 * published anywhere in the evidence is replaced, because it would read as something a customer agreed to.
 */
export function annotatePrices(t: string, prices: Array<{ name: string; price: string }>, dossier: string): string {
  const notes: string[] = [];
  const out = t.replace(AMOUNT, (m) => {
    const hit = prices.find((p) => norm(p.price).includes(norm(m)) || norm(m).includes(norm(p.price)));
    if (hit) { const n = `${m.trim()} is ${hit.name}'s listed price, not a price a customer told you`; if (!notes.includes(n)) notes.push(n); return m; }
    return norm(dossier).includes(norm(m)) ? m : "a price you choose";
  });
  return notes.length ? `${out} (${notes.join("; ")}.)` : out;
}

export function labelFor(status: ReviewStatus, model: string | null, agents: { succeeded: number; total: number } | null = null): string {
  const partialAgents = agents && agents.succeeded < agents.total ? ` Only ${agents.succeeded} of ${agents.total} analysis steps finished, so the rest of the report used built-in defaults.` : "";
  switch (status) {
    case "reviewed": return `Reviewed by ${model ?? "the review model"}.${partialAgents}`;
    case "pending": return "First draft. The final review is still running.";
    case "unavailable": return `Partial: not reviewed. The review model is not set up.${partialAgents}`;
    default: return `Partial: not reviewed by ${model ?? "the review model"}.${partialAgents}`;
  }
}

export const initialReview = (enabled: boolean, model: string): ReviewBlock => ({
  agents: null, attempts: 0,
  status: enabled ? "pending" : "unavailable", requested_model: enabled ? model : null, actual_model: null, ms: null, reason: enabled ? null : "review model not configured",
  removed_by_model: 0, removed_by_rule: 0, missing_evidence: [], label: labelFor(enabled ? "pending" : "unavailable", model),
});
