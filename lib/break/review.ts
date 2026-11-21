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
    d.evidence_layer ? `EVIDENCE LAYER: ${clip(JSON.stringify(d.evidence_layer), 3000)}` : "",
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
  const k = idxs("kill:"), s = idxs("survive:"), f = idxs("diff:");
  out.kill_reasons = removeAt(d.kill_reasons, k); out.kill_reason_tags = removeAt(d.kill_reason_tags, k);
  out.survive_reasons = removeAt(d.survive_reasons, s); out.survive_reason_tags = removeAt(d.survive_reason_tags, s);
  out.differentiation_plan = removeAt(d.differentiation_plan, f); out.differentiation_plan_tags = removeAt(d.differentiation_plan_tags, f);
  if (drop.has("competitors")) out.competitor_summary = "Not shown: the competitor summary was not supported by what was found.";
  if (drop.has("verdict")) out.verdict = "The first verdict was not supported by the evidence, so it is not shown. Use the findings below.";
  return { data: out, removedByModel: byModel, removedByRule: byRule, unjudged };
}

export function labelFor(status: ReviewStatus, model: string | null): string {
  switch (status) {
    case "reviewed": return `Reviewed by ${model ?? "the review model"}`;
    case "pending": return "First draft. The final review is still running.";
    case "unavailable": return "Partial: not reviewed. The review model is not set up.";
    default: return `Partial: not reviewed by ${model ?? "the review model"}`;
  }
}

export const initialReview = (enabled: boolean, model: string): ReviewBlock => ({
  status: enabled ? "pending" : "unavailable", requested_model: enabled ? model : null, actual_model: null, ms: null, reason: enabled ? null : "review model not configured",
  removed_by_model: 0, removed_by_rule: 0, missing_evidence: [], label: labelFor(enabled ? "pending" : "unavailable", model),
});
