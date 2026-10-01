/**
 * lib/breakMyStartupFocusAreas.ts
 *
 * Shared between app/api/ai/break-my-startup/route.ts (both the idea-only
 * and project-based pipelines) and app/(dashboard)/break-my-startup/page.tsx.
 * One definition of the 7 focus areas, what each one actually examines, and
 * one deterministic function for deciding whether a piece of text relates to
 * one — used for two different things:
 *
 *   1. THE PREVIEW (non-Builder plan). Used to reach: pick a focus area,
 *      get a flat +2-per-area score bump and a response that never mentions
 *      which areas you picked. Now the preview text is actually built from
 *      what you selected — cheap and deterministic (no LLM call, so it
 *      doesn't cost anything extra to run), but still honestly a preview:
 *      it explains what full analysis on that dimension would examine and
 *      whether your own description already touches on it, not an
 *      idea-specific verdict. That's still gated behind Builder.
 *
 *   2. VISIBLE TAGGING (Builder plan). The 5 agents were already being told
 *      to prioritize the founder's selected areas (see focusAreaLine() in
 *      lib/agents/index.ts) — that part worked. What was missing: nothing in
 *      the response showed the founder THAT it happened. tagFocusAreas()
 *      is run over each generated risk/opportunity/pivot after the fact, so
 *      the UI can show "relates to: Unit Economics" on the ones that do.
 *
 * Keyword matching, not a model call, on purpose: reliable across every
 * provider in the free-tier rotation, and it's tagging BuildMind's own
 * already-generated text, not writing new claims about the founder's idea.
 */

export interface FocusAreaDefinition {
  name: string;
  /** Shown in the free preview — what a real run would examine on this axis. */
  examines: string;
  /** Lowercase, matched as substrings against lowercased text. */
  keywords: string[];
}

export const FOCUS_AREA_LIBRARY: FocusAreaDefinition[] = [
  {
    name: "Business Model",
    examines: "Whether the core value exchange is priced against what customers will actually pay, not just what you'd like to charge.",
    keywords: ["business model", "monetiz", "revenue model", "pricing model", "value exchange", "value proposition", "how you make money", "how they make money", "subscription", "freemium"],
  },
  {
    name: "Unit Economics",
    examines: "Whether CAC and LTV support the business at the scale you're describing, not just at your first 10 customers.",
    keywords: ["unit econom", "cac", "ltv", "customer acquisition cost", "lifetime value", "gross margin", "contribution margin", "payback period", "churn rate", "burn rate"],
  },
  {
    name: "Market Size",
    examines: "Whether the addressable market is big enough at the price point you're describing to build a real business, not just a hobby.",
    keywords: ["market size", "tam", "sam", "som", "addressable market", "total addressable", "market is too small", "niche market", "market opportunity"],
  },
  {
    name: "Competitive Moat",
    examines: "Whether there's anything here a well-funded copycat couldn't replicate in 90 days.",
    keywords: ["moat", "competitive advantage", "differentiat", "defensib", "network effect", "switching cost", "barrier to entry", "easily replicat", "easily copied", "copycat"],
  },
  {
    name: "Founder-Market Fit",
    examines: "Whether you have information, access, or credibility advantages here that someone else attempting this wouldn't.",
    keywords: ["founder-market fit", "founder market fit", "domain expertise", "unfair advantage", "insider knowledge", "why you're the right", "why you are the right", "your background", "industry experience"],
  },
  {
    name: "Tech Risk",
    examines: "Whether the hardest technical problem here is one you've actually validated is solvable, not one you're assuming will work out.",
    keywords: ["tech risk", "technical risk", "technically feasible", "technical feasibility", "engineering challenge", "scalab", "infrastructure cost", "ai model", "algorithm", "hardest technical", "hardest engineering"],
  },
  {
    name: "Regulatory Risk",
    examines: "Whether a compliance, licensing, or legal requirement could block launch or add months of delay you haven't planned for.",
    keywords: ["regulat", "complian", "licens", "gdpr", "hipaa", "data privacy", "legal requirement", "government approval", "restricted industry"],
  },
];

const BY_NAME = new Map(FOCUS_AREA_LIBRARY.map((f) => [f.name.toLowerCase(), f]));

export function focusAreaDefinition(name: string): FocusAreaDefinition | null {
  return BY_NAME.get(name.trim().toLowerCase()) ?? null;
}

/** Case-insensitive substring match against a text-only description — best
 *  match wins when a founder's own focus-area label doesn't line up exactly
 *  with the library (kept lenient since the API doesn't validate this field
 *  against a fixed enum). */
export function closestFocusAreaDefinition(name: string): FocusAreaDefinition | null {
  const exact = focusAreaDefinition(name);
  if (exact) return exact;
  const n = name.trim().toLowerCase();
  if (!n) return null;
  return FOCUS_AREA_LIBRARY.find((f) => f.name.toLowerCase().includes(n) || n.includes(f.name.toLowerCase())) ?? null;
}

/**
 * Which of `selectedAreas` does `text` actually touch on? Order-preserving,
 * deduplicated, only ever returns names from `selectedAreas` — never
 * invents a tag for an area the founder didn't pick.
 */
export function tagFocusAreas(text: string, selectedAreas: string[]): string[] {
  if (!text || selectedAreas.length === 0) return [];
  const t = text.toLowerCase();
  const tags: string[] = [];
  for (const selected of selectedAreas) {
    const def = closestFocusAreaDefinition(selected);
    if (!def) continue;
    if (def.keywords.some((kw) => t.includes(kw)) && !tags.includes(def.name)) tags.push(def.name);
  }
  return tags;
}

/** Tags a whole list at once, index-aligned with the input — for building
 *  the *_tags parallel arrays the API returns alongside kill_reasons etc. */
export function tagFocusAreasForList(texts: string[], selectedAreas: string[]): string[][] {
  return texts.map((t) => tagFocusAreas(t, selectedAreas));
}

export interface FocusAreaCoverage {
  selected: string[];
  /** Selected areas that at least one tagged item actually touched on. */
  addressed: string[];
  /** Selected areas nothing in the output touched on — worth knowing, not
   *  hidden: it means the model didn't surface anything on that axis, not
   *  that BuildMind silently dropped the founder's request. */
  unaddressed: string[];
}

export function buildFocusAreaCoverage(selectedAreas: string[], allTagLists: string[][]): FocusAreaCoverage | null {
  if (selectedAreas.length === 0) return null;
  const touched = new Set(allTagLists.flat());
  return {
    selected: selectedAreas,
    addressed: selectedAreas.filter((a) => touched.has(a)),
    unaddressed: selectedAreas.filter((a) => !touched.has(a)),
  };
}

/**
 * Builds the free-preview's focus-area-aware kill/survive reasons.
 * `ideaText` is whatever the founder typed (idea text, or project context) —
 * used only to say whether they've already touched on a dimension, never to
 * generate a claim about their specific idea (that stays behind Builder).
 */
export function buildPreviewFocusInsights(selectedAreas: string[], ideaText: string): { killReasons: string[]; surviveReasons: string[] } {
  const killReasons: string[] = [];
  const surviveReasons: string[] = [];
  for (const selected of selectedAreas) {
    const def = closestFocusAreaDefinition(selected);
    if (!def) continue;
    const mentioned = tagFocusAreas(ideaText, [def.name]).length > 0;
    if (mentioned) {
      surviveReasons.push(`${def.name}: your description already touches on this — the full run checks whether it actually holds up.`);
    } else {
      killReasons.push(`${def.name}: not addressed yet in what you've described. ${def.examines}`);
    }
  }
  return { killReasons, surviveReasons };
}
