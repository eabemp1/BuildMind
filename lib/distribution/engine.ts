/**
 * lib/distribution/engine.ts — the Distribution engine for Today tasks.
 *
 * It drafts, it corrects, and it records what happened so the next draft is
 * better:
 *   draft    writes the first version of any content task, told what this
 *            founder's own edits and results have shown (lib/prep/learning.ts)
 *   correct  the Distribution Studio's diagnosis (lib/distribution/diagnose.ts):
 *            what works, what weakens, and sharper versions, with every quote
 *            checked against the draft
 *   record   lives in /api/ai/prep/record and the prepared_work table
 *
 * Every model output passes deterministic guards before it is shown. Nothing
 * here publishes or sends anything.
 */
import { callModelJSON } from "@/lib/ai-providers";
import { analyseText, type Platform } from "@/lib/distribution/textSignals";
import { runDiagnosis, type Diagnosis } from "@/lib/distribution/diagnose";
import { learningPromptBlock } from "@/lib/prep/learning";
import { normalizePrepared, hasContent, type PrepFact, type PrepKind, type Prepared, type PrepVariant } from "@/lib/prep/kinds";

export interface ProjectCtx { name: string; description: string; problem: string; targetUsers: string; stage: string }
export interface SerpHit { title: string; url: string; snippet: string }

export interface ContentCtx {
  kind: PrepKind;
  task: string;
  firstStep?: string;
  platform: Platform;
  project: ProjectCtx;
  lessons: string[];
  facts?: PrepFact[];
  /** Real work from the founder's connected GitHub repo (merged pull request titles). */
  shipped?: string[];
  /** From lib/prep/context.ts: the founder's own recent record. */
  inferred?: string;
  serp?: SerpHit[];
}

// ── Guards ──────────────────────────────────────────────────────────────────

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
const CLICHES = [/i hope this (?:message |email )?finds you well/i, /pick your brain/i, /i came across your profile/i, /quick call\?*$/i, /synergy/i, /game[- ]?changer/i, /revolutioni[sz]e/i];
const HYPOTHETICAL = /^\s*(?:would you|do you think you would|if i (?:built|made|created)|would it be|can you imagine|how likely)\b/i;

export function cleanText(text: string, keepEmoji = false): string {
  const t = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim();
  return keepEmoji ? t : t.replace(EMOJI, "").replace(/ {2,}/g, " ").trim();
}

const MAX_WORDS: Partial<Record<PrepKind, number>> = { outreach: 110, post: 320, video_script: 260, investor_update: 260, launch_plan: 16 };

/** Why a draft should not be shown. Empty means it passes. */
export function variantProblems(kind: PrepKind, text: string, platform: Platform = "other"): string[] {
  const p: string[] = [];
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (!words) return ["empty"];
  const max = MAX_WORDS[kind];
  if (max && words > max) p.push(`over ${max} words`);
  if (kind === "launch_plan") {
    if (text.length > 100) p.push("title too long");
    if (/!|\b(revolutionary|game[- ]?chang\w*|best ever|ultimate)\b/i.test(text)) p.push("hype");
  }
  if (kind === "outreach" || kind === "post") {
    if (CLICHES.some((r) => r.test(text))) p.push("stock phrase");
    if (analyseText(text, platform).platitudes.length) p.push("platitude");
    if (analyseText(text, platform).overLimitBy > 0) p.push("over platform limit");
    if (/\[[^\]]{40,}\]/.test(text)) p.push("long placeholder");
  }
  return p;
}

/** Numbers that carry a claim (2+ digits, %, $) and are not in the allowed text. */
export function unsupportedNumbers(text: string, allowed: string): string[] {
  const ok = allowed.toLowerCase();
  const found = text.match(/[$€£]?\d[\d,]*(?:\.\d+)?%?/g) ?? [];
  return found.filter((n) => {
    const bare = n.replace(/[$€£,]/g, "");
    if (!/%/.test(n) && !/^[$€£]/.test(n) && bare.replace(/\.\d+/, "").length < 2) return false;
    return !ok.includes(n.toLowerCase()) && !ok.includes(bare);
  });
}

export function filterVariants(kind: PrepKind, platform: Platform, variants: PrepVariant[], allowedNumbers?: string): PrepVariant[] {
  const seen = new Set<string>();
  return variants
    .map((v) => ({ ...v, text: cleanText(v.text, kind === "video_script") }))
    .filter((v) => {
      const key = v.text.toLowerCase().replace(/\W+/g, " ").slice(0, 80);
      if (seen.has(key)) return false;
      seen.add(key);
      if (variantProblems(kind, v.text, platform).length) return false;
      if (allowedNumbers !== undefined && unsupportedNumbers(v.text, allowedNumbers).length) return false;
      return true;
    })
    .map((v, i) => ({ ...v, id: `v${i + 1}` }));
}

/** Drops hypothetical interview questions; asks about the past, not about a product that does not exist. */
export function keepPastBehaviourQuestions(qs: string[]): string[] {
  return qs.filter((x) => x && !HYPOTHETICAL.test(x));
}

// ── Prompts ─────────────────────────────────────────────────────────────────

const PERSONA = `You prepare first drafts for a solo founder. Use only the facts you are given. Never invent statistics, customers, quotes, testimonials or links. No hype, no flattery, no emojis. Write plainly, in the founder's voice. The founder reviews and sends or publishes everything themselves.`;

function projectBlock(p: ProjectCtx): string {
  return `PROJECT: ${p.name || "the founder's startup"}
What it is: ${p.description || "not stated"}
Problem: ${p.problem || "not stated"}
Who it is for: ${p.targetUsers || "not stated"}
Stage: ${p.stage || "not stated"}`;
}

const SHAPE = `Return JSON: {"title":"","summary":"one sentence on what this is","variants":[{"label":"","text":"","why":"one sentence"}],"sections":[{"heading":"","body":"","bullets":[""]}]}`;

function kindInstructions(ctx: ContentCtx): string {
  switch (ctx.kind) {
    case "outreach":
      return `Write THREE different first-touch messages for ${ctx.platform === "other" ? "the channel the task names" : ctx.platform}, labelled "Personal", "Curious" and "Direct". Each is 70 words or fewer, opens with something about THEM or their situation (never the product), makes no pitch in the first sentence, and ends with one specific question. Use [brackets] only for the person's name or one detail the founder must add. Add one section "Before you send" with 2-3 bullets: who to send to, and the one real detail to personalise.`;
    case "post":
      return `Write TWO drafts of a post for ${ctx.platform}, labelled "Story" (a concrete moment) and "Observation" (a claim backed by something the founder actually saw). Do not mention the product unless the task asks. Add a section "Other first lines" with 3 bullets, and a section "After you post" with 2 bullets on how to engage with replies.`;
    case "landing":
      return `Write landing page copy. Variants: THREE headline options, each as "Headline\\nSubheadline" labelled "Plain", "Outcome", "Contrast". Sections: "Three benefits" (bullets, each tied to the problem), "How it works" (3 bullets), "Call to action" (body, one line), "Questions to answer" (3 bullets: a real objection and a short answer). Add a section "Proof to add" listing what real evidence the page still needs (numbers, quotes). Invent none.`;
    case "seo": {
      const serp = (ctx.serp ?? []).map((s, i) => `[${i + 1}] ${s.title} — ${s.snippet.slice(0, 180)}`).join("\n");
      return `Write an SEO brief grounded ONLY in these current search results:\n${serp || "(no results available; say so in the summary and keep claims general)"}\nVariants: TWO title/meta pairs, each as "Title: ...\\nMeta: ..." (title 60 characters or fewer, meta 155 or fewer), labelled "Plain" and "Question". Sections: "Target keyword" (body: one primary keyword and 3 related phrases implied by the results), "Outline" (bullets of H2 headings), "What ranks now" (bullets, each naming a result by number), "Gap you can own" (body).`;
    }
    case "investor_update": {
      const facts = (ctx.facts ?? []).map((f) => `- ${f.label}: ${f.value}`).join("\n");
      return `Write a short investor update using ONLY these real facts from the founder's own BuildMind record:\n${facts || "- (none available)"}\nVariants: "Short email" (under 160 words) and "Five lines" (five short lines). Where a useful number is missing, write [add: what] instead of inventing it. Sections: "What we did" (bullets from the facts), "What we learned" (2 bullets, only from facts), "The ask" (body: one specific ask, or [add: your ask]).`;
    }
    case "build_plan":
      return `Cut today's build task down to the smallest version that still teaches the founder something. No variants (return an empty "variants" array). Sections: "Smallest version" (body: what to build and what to leave out, in two sentences), "Steps" (3 to 5 bullets, each doable in under an hour), "Done when" (bullets: 2 checks the founder can verify without asking anyone), "Skip for now" (2 bullets of tempting extras), "Biggest risk" (body: the one thing most likely to waste the day, and how to notice early). Base everything on the task and the project. Mention no tools or frameworks the founder did not name.`;
    case "launch_plan":
      return `Prepare a launch for ${ctx.platform === "other" ? "the channel the task names (Show HN, Product Hunt or Reddit)" : ctx.platform}. Variants: THREE title options, each ONE line of 80 characters or fewer, labelled "Plain", "Problem" and "Curious". No exclamation marks, no superlatives, no "revolutionary". Sections: "First comment" (body: 90 words or fewer, written by the founder, saying who built it, why, and one thing they want feedback on), "Timeline" (bullets: before, the first hour, the first day), "Rules to respect" (bullets: what that community dislikes, such as asking for upvotes), "After you post" (bullets on replying). Invent no numbers, users or testimonials.`;
    case "video_script":
      return `Write a script for a 20-30 second vertical video that shows the product to ${ctx.project.targetUsers || "founders"}. One variant "Script" with timestamps like "0-3s: ..." on separate lines, opening on the viewer's problem, not the logo. Sections: "Shot list" (bullets, what is on screen at each moment), "Captions" (bullets, on-screen text, 8 words or fewer each), "End card" (body: one line and the link to show).`;
    default:
      return "";
  }
}

export function contentPrompt(ctx: ContentCtx): string {
  return `${PERSONA}

${projectBlock(ctx.project)}

TASK TODAY: ${ctx.task}
${ctx.firstStep ? `First step: ${ctx.firstStep}\n` : ""}
${learningPromptBlock(ctx.lessons)}
${ctx.inferred ? `${ctx.inferred}\n` : ""}${ctx.shipped?.length ? `WHAT THE FOUNDER ACTUALLY SHIPPED RECENTLY (real, from their repository). Build on these. Do not claim anything beyond them:\n${ctx.shipped.map((x) => `- ${x}`).join("\n")}\n` : ""}
${kindInstructions(ctx)}

${SHAPE}`;
}

// ── Drafting ────────────────────────────────────────────────────────────────

function factsText(facts: PrepFact[] = []): string { return facts.map((f) => `${f.label} ${f.value}`).join(" "); }

export function investorFallback(facts: PrepFact[], project: ProjectCtx, shipped: string[] = []): Prepared {
  const hasRevenue = facts.some((f) => /recurring revenue/i.test(f.label));
  const lines = facts.map((f) => `${f.label}: ${f.value}`);
  return normalizePrepared({
    title: "Investor update",
    summary: "Built only from your BuildMind record. Add your revenue and user numbers where marked.",
    variants: [{ label: "Short email", text: `Hi [name],\n\nQuick update on ${project.name || "the startup"}.\n\n${lines.map((l) => `- ${l}`).join("\n")}${shipped?.length ? `\n\nShipped:\n${shipped.slice(0, 5).map((x) => `- ${x}`).join("\n")}` : ""}${hasRevenue ? "" : "\n- [add: revenue, users or signups]"}\n\nThe one thing I'd value your view on: [add: your ask].\n\nThanks,\n[your name]` }],
    sections: [...(lines.length ? [{ heading: "What we did", bullets: lines }] : []), ...(shipped.length ? [{ heading: "What we shipped", bullets: shipped.slice(0, 6) }] : [])],
  }, "investor_update");
}

/** Drafts content for any content-engine kind. Returns null when nothing usable survives the guards. */
export async function draftContent(ctx: ContentCtx): Promise<Prepared | null> {
  let raw: unknown;
  try {
    raw = await callModelJSON<unknown>([{ role: "user", content: contentPrompt(ctx) }], { maxTokens: 2200 });
  } catch {
    return ctx.kind === "investor_update" && ctx.facts?.length ? investorFallback(ctx.facts, ctx.project, ctx.shipped) : null;
  }
  const base = normalizePrepared(raw, ctx.kind, { platform: ctx.platform, learned: ctx.lessons });
  const allowedNumbers = ctx.kind === "investor_update" ? `${factsText(ctx.facts)} ${ctx.task}` : undefined;
  let variants = filterVariants(ctx.kind, ctx.platform, base.variants, allowedNumbers);
  if (ctx.kind === "seo") variants = variants.filter((v) => { const t = /title:\s*(.+)/i.exec(v.text)?.[1] ?? ""; const m = /meta:\s*(.+)/i.exec(v.text)?.[1] ?? ""; return t.length > 0 && t.length <= 60 && m.length > 0 && m.length <= 155; }).map((v, i) => ({ ...v, id: `v${i + 1}` }));
  const out: Prepared = { ...base, variants, facts: ctx.facts ?? [] };
  if (ctx.kind === "investor_update" && !variants.length && ctx.facts?.length) return { ...investorFallback(ctx.facts, ctx.project, ctx.shipped), learned: ctx.lessons };
  const needsVariants = ctx.kind === "outreach" || ctx.kind === "post" || ctx.kind === "video_script" || ctx.kind === "launch_plan";
  if (needsVariants && !variants.length) return null;
  return hasContent(out) ? out : null;
}

// ── Correction (the Distribution Studio's diagnosis) ────────────────────────

export async function correctDraft(text: string, platform: Platform, audience: string, outcome: string): Promise<Diagnosis> {
  return runDiagnosis({ body: text, platform, audience, outcome });
}
