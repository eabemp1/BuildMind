/**
 * lib/work/shape.ts — the pure half of the work engine: validate the form, build the writer's prompt,
 * clean what comes back, and flag anything the founder must check. No network, no database, so it is
 * fully testable. The server half is lib/work/engine.ts.
 */
import type { PrepNeed, PrepSection, PrepVariant } from "@/lib/prep/kinds";
import type { WorkSpec } from "@/lib/work/registry";

export interface WorkProject { name: string; description: string; problem: string; targetUsers: string; stage: string }
export interface WorkResult { title: string; summary: string; variants: PrepVariant[]; sections: PrepSection[]; needs: PrepNeed[] }

const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Removes control characters and caps length. Used on anything the founder types that reaches a prompt. */
export function sanitizeText(input: unknown, max: number): string {
  if (typeof input !== "string") return "";
  let out = "";
  for (const ch of input) {
    const c = ch.codePointAt(0) ?? 0;
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c !== 127)) out += ch;
  }
  return out.replace(/[ \t]+\n/g, "\n").trim().slice(0, max);
}

export function cleanInputs(spec: WorkSpec, raw: unknown): { values: Record<string, string>; error?: string } {
  const src = (raw ?? {}) as Record<string, unknown>;
  const values: Record<string, string> = {};
  for (const f of spec.fields) {
    const v = sanitizeText(src[f.key], f.max ?? 300);
    if (f.type === "choice" && v && !(f.options ?? []).includes(v)) return { values, error: `Choose one of the options for "${f.label}".` };
    if (!v && !f.optional) return { values, error: `Please fill in: ${f.label}` };
    if (v) values[f.key] = v;
  }
  return { values };
}

export function buildPrompt(spec: WorkSpec, values: Record<string, string>, project: WorkProject): string {
  const brief = spec.fields.map((f) => `${f.label}: ${values[f.key] ?? "(not given)"}`).join("\n");
  const shape = spec.shape === "variants"
    ? `Fill "variants" with exactly ${spec.count ?? 3} items. Use "sections" only for at most 2 short sections such as "Before you send". Leave nothing else.`
    : `Fill "sections" (each with a heading and a body or bullets). Leave "variants" empty.`;
  return `You are BuildMind's work engine. You prepare a first draft for a solo founder, who will review it and do the final step themselves. Nothing you write is sent or posted by anyone but the founder.

RULES
- Use only facts found in PROJECT and BRIEF. Never invent customers, results, numbers, prices, quotes, names, awards or links.
- Where a needed fact is missing, write [add: exactly what is needed] instead of guessing.
- Plain, specific language. No buzzwords, no flattery, no hype. No emojis unless the text is a WhatsApp message.
- Write for the founder's real audience in their real market. Do not assume US conventions, currency or channels.
- Do exactly the job below and nothing else.

JOB: ${spec.label}
${spec.instruction}

PROJECT
Name: ${project.name || "(not given)"}
What it is: ${project.description || "(not given)"}
Problem: ${project.problem || "(not given)"}
Who it is for: ${project.targetUsers || "(not given)"}
Stage: ${project.stage || "(not given)"}

BRIEF
${brief}

${shape}
Return JSON only: {"title":"short title","summary":"one sentence on what this is and how to use it","variants":[{"label":"short label","text":"the full text","why":"one sentence on when to use this one"}],"sections":[{"heading":"","body":"","bullets":[""]}]}`;
}

function cleanBody(t: string): string {
  return t.replace(/```[a-z]*\n?|```/gi, "").replace(/\*\*/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Numbers that are counts or timings written by the template itself ("10 slides", "15-minute", "Day 3") are not claims. */
const BENIGN = /\b(?:slide|day|week|email|step|question|option|version)\s*\d+\b|\b\d+[- ]?(?:minutes?|mins?|words?|days?|hours?|weeks?|slides?|questions?|emails?|steps?|seconds?)\b/gi;

export function figuresToCheck(text: string, allowed: string, unsupported: (t: string, a: string) => string[]): string[] {
  return Array.from(new Set(unsupported(text.replace(BENIGN, " "), allowed)));
}

export function normalizeWork(
  raw: unknown,
  spec: WorkSpec,
  allowedText: string,
  unsupported: (t: string, a: string) => string[],
): WorkResult | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const variants: PrepVariant[] = arr(r.variants).slice(0, 4).map((v, i) => {
    const o = (v ?? {}) as Record<string, unknown>;
    return { id: `v${i + 1}`, label: str(o.label, 40) || `Option ${i + 1}`, text: cleanBody(str(o.text, 5000)), why: str(o.why, 300) || undefined };
  }).filter((v) => v.text);
  const sections: PrepSection[] = arr(r.sections).slice(0, 14).map((s) => {
    const o = (s ?? {}) as Record<string, unknown>;
    const bullets = arr(o.bullets).slice(0, 12).map((b) => cleanBody(str(b, 500))).filter(Boolean);
    const body = cleanBody(str(o.body, 2500));
    return { heading: str(o.heading, 140), body: body || undefined, bullets: bullets.length ? bullets : undefined };
  }).filter((s) => s.heading && (s.body || s.bullets));

  const useful = spec.shape === "variants" ? variants.length > 0 : sections.length > 0;
  if (!useful) return null;

  const all = [...variants.map((v) => v.text), ...sections.flatMap((s) => [s.body ?? "", ...(s.bullets ?? [])])].join("\n");
  const needs: PrepNeed[] = [];
  const gaps = (all.match(/\[add:[^\]]*\]/gi) ?? []).length;
  if (gaps > 0) needs.push({ label: `Fill ${gaps} gap${gaps === 1 ? "" : "s"} marked [add: ...]`, why: "BuildMind did not have these facts, so it left a marker instead of guessing. Replace each one with something true before you use this." });
  if (spec.claims) {
    const odd = figuresToCheck(all, allowedText, unsupported);
    if (odd.length) needs.push({ label: "Check these figures", why: `These numbers were not in what you gave, so confirm or remove them before using this: ${odd.slice(0, 6).join(", ")}.` });
  }
  return {
    title: str(r.title, 100) || spec.label,
    summary: str(r.summary, 300),
    variants: spec.shape === "variants" ? variants : variants.slice(0, 0),
    sections,
    needs,
  };
}

export const REFINE_PRESETS = ["Shorter", "More direct", "Warmer", "More formal", "Simpler words", "Add a clear ask"] as const;

export function refinePrompt(text: string, instruction: string): string {
  return `Rewrite the text below following the instruction. Keep every fact in it. Do not add new claims, numbers, names, prices or links. Keep any [add: ...] markers exactly as they are. Change only what the instruction asks for. Keep the same language, and the same format (for example a 'Subject:' line stays).

INSTRUCTION: ${instruction}

TEXT:
${text}

Return JSON only: {"text":"the rewritten text"}`;
}

export function readRefined(raw: unknown): string | null {
  const t = cleanBody(str((raw as { text?: unknown } | null)?.text, 6000));
  return t.length >= 5 ? t : null;
}
