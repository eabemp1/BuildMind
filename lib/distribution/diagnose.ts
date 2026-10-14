/**
 * lib/distribution/diagnose.ts — writing diagnosis for the Distribution Studio.
 *
 * Two clearly separated layers:
 *   observations  measured from the text (textSignals) — facts
 *   model view    AI judgment, every claim tied to a quote from the draft
 *                 that is checked against the draft; unverifiable quotes are dropped
 * Nothing here publishes or sends anything.
 */
import { callModelJSON } from "@/lib/ai-providers";
import { analyseText, observe, type Observation, type Platform } from "./textSignals";

export type Approach = "personal" | "provocative" | "analytical";
export interface Point { point: string; quote: string | null }
export interface Revision { approach: Approach; text: string; why: string; hypothesis: string; metric: string; changeIf: string }
export interface Diagnosis {
  observations: Observation[];
  working: Point[];
  weakening: Point[];
  insight: string;
  productFit: string;
  openings: { text: string; why: string }[];
  revisions: Revision[];
  followUps: string[];
  ai: boolean;
  note: string;
}

export interface DraftInput {
  body: string;
  platform: Platform;
  audience?: string;
  outcome?: string;
  context?: string;
}

const APPROACHES: Approach[] = ["personal", "provocative", "analytical"];

const s = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();

function points(v: unknown, body: string): Point[] {
  if (!Array.isArray(v)) return [];
  const nb = norm(body);
  return v.slice(0, 5).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const q = s(o.quote, 240);
    return { point: s(o.point, 400), quote: q && nb.includes(norm(q)) ? q : null };
  }).filter((p) => p.point);
}

/** Turns raw model JSON into a safe Diagnosis. Quotes that are not in the draft are dropped. */
export function normaliseDiagnosis(raw: unknown, input: DraftInput): Diagnosis {
  const r = (raw ?? {}) as Record<string, unknown>;
  const signals = analyseText(input.body, input.platform);
  const revs = Array.isArray(r.revisions) ? (r.revisions as Record<string, unknown>[]) : [];
  const revisions: Revision[] = APPROACHES.map((a) => {
    const m = revs.find((x) => s(x?.approach).toLowerCase() === a);
    return m ? { approach: a, text: s(m.text, 3200), why: s(m.why), hypothesis: s(m.hypothesis), metric: s(m.metric, 200), changeIf: s(m.changeIf ?? m.change_if) } : null;
  }).filter((x): x is Revision => !!x && !!x.text);
  return {
    observations: observe(signals, input.platform),
    working: points(r.working, input.body),
    weakening: points(r.weakening, input.body),
    insight: s(r.insight),
    productFit: s(r.productFit ?? r.product_fit),
    openings: (Array.isArray(r.openings) ? r.openings : []).slice(0, 4).map((o) => ({ text: s((o as Record<string, unknown>)?.text, 400), why: s((o as Record<string, unknown>)?.why) })).filter((o) => o.text),
    revisions,
    followUps: (Array.isArray(r.followUps ?? r.follow_ups) ? (r.followUps ?? r.follow_ups) as unknown[] : []).slice(0, 5).map((x) => s(x, 300)).filter(Boolean),
    ai: true,
    note: "Observations are measured from your text. Everything else is model judgment, not a measurement. Quotes were checked against your draft.",
  };
}

export function fallbackDiagnosis(input: DraftInput): Diagnosis {
  return {
    observations: observe(analyseText(input.body, input.platform), input.platform),
    working: [], weakening: [], insight: "", productFit: "", openings: [], revisions: [], followUps: [],
    ai: false,
    note: "The AI provider was unavailable, so this shows measured observations only. Try again for the full diagnosis.",
  };
}

function prompt(input: DraftInput): string {
  const sig = analyseText(input.body, input.platform);
  return `You are a candid writing editor for a solo founder. Diagnose this ${input.platform} draft. Do not flatter. Do not erase the author's natural voice.

Intended audience: ${input.audience || "not stated"}
Desired outcome: ${input.outcome || "start real conversations with founders"}
Extra context: ${input.context || "none"}

Measured facts (already computed, do not contradict): first line ${sig.firstLineWords} words; ${sig.questions} question marks; ${sig.productMentions} product mentions in ${sig.words} words.

DRAFT:
"""
${input.body}
"""

Rules:
- Every item in "working" and "weakening" must include an exact "quote" copied from the draft that supports it.
- Judge: hook, specificity, novelty, emotional tension, conversational potential, audience fit, and whether mentioning the product helps or weakens the conversation.
- Do not claim facts about the audience or market that the draft does not support.
- Write THREE revisions with genuinely different approaches: "personal" (a concrete first-person moment), "provocative" (a contradiction or challenge), "analytical" (a clear observation with evidence). Keep the author's voice. No hashtags, no hype, no emojis.
- Each revision needs a testable hypothesis, the single metric that would test it, and "changeIf": what result would change your next recommendation.
- "openings": three alternative first lines (not full posts), each with a short reason.
- "followUps": questions a reader could answer, which would reveal real experience.

Return JSON:
{"insight":"the underlying idea worth keeping","working":[{"point":"","quote":""}],"weakening":[{"point":"","quote":""}],"productFit":"should the product be mentioned here and why","openings":[{"text":"","why":""}],"revisions":[{"approach":"personal|provocative|analytical","text":"","why":"","hypothesis":"","metric":"","changeIf":""}],"followUps":[""]}`;
}

export async function runDiagnosis(input: DraftInput): Promise<Diagnosis> {
  try {
    const raw = await callModelJSON<unknown>([{ role: "user", content: prompt(input) }], { maxTokens: 2600 });
    const d = normaliseDiagnosis(raw, input);
    return d.revisions.length || d.weakening.length || d.working.length ? d : fallbackDiagnosis(input);
  } catch {
    return fallbackDiagnosis(input);
  }
}

export interface ReplyInput { excerpt: string; platform: string; segment?: string; relevance?: string; notes?: string }
export interface ReplyDraft { reply: string; followUps: string[]; why: string; ai: boolean }

export async function runReplyDraft(input: ReplyInput): Promise<ReplyDraft> {
  const p = `You help a solo founder join a public conversation. Read the post excerpt and draft ONE helpful reply grounded only in what it says.

Platform: ${input.platform}
Audience segment: ${input.segment || "founders"}
Why relevant: ${input.relevance || "not stated"}
Founder notes: ${input.notes || "none"}

POST EXCERPT:
"""
${input.excerpt.slice(0, 3000)}
"""

Rules: contribute something useful first. Do not pitch the product unless the post asks for tools. No flattery, no hype, no emojis. Short. Ask one genuine follow-up question that draws out the person's real experience. The founder reviews and posts it themselves.

Return JSON: {"reply":"","followUps":["up to 3 alternative questions"],"why":"one sentence on the approach"}`;
  try {
    const r = await callModelJSON<Record<string, unknown>>([{ role: "user", content: p }], { maxTokens: 700 });
    const reply = s(r.reply, 1500);
    if (!reply) throw new Error("empty");
    return { reply, followUps: (Array.isArray(r.followUps) ? r.followUps : []).slice(0, 3).map((x) => s(x, 250)).filter(Boolean), why: s(r.why, 300), ai: true };
  } catch {
    return { reply: "", followUps: [], why: "The AI provider was unavailable. Write this one yourself, or try again.", ai: false };
  }
}
