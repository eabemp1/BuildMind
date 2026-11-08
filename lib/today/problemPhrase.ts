/**
 * lib/today/problemPhrase.ts — the short phrase that fills "ask about ___" in a fallback task. Pure.
 *
 * Founders type a product description, or the AI writes a market summary, into the project's problem field. Cut
 * to eight words it read like "ask about Our distribution engine is a scalable, repeatable growth", which is
 * gibberish. A phrase is used only when it names a problem; otherwise the task says "this problem", which always reads.
 */
const DESCRIPTION_RE = /\b(?:is|are|was|were|that|which|designed|helps?|allows?|enables?|provides?|offers?|solves?|lets?|gives?|makes?|builds?|uses?|platform|tool|software|system|framework|engine|solution|market|saturated)\b/i;
const OPENER_RE = /^(?:our|my|the|a|an|this|we|i|it)\b/i;
const MAX_WORDS = 9;
const MAX_CHARS = 72;

/** The phrase if it names a problem; null if it is a description, a paragraph, or empty. */
export function cleanProblem(text: string | null | undefined): string | null {
  const t = (text ?? "").replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim().replace(/[.!?,;:]+$/, "");
  if (!t) return null;
  if (t.length > MAX_CHARS || t.split(" ").length > MAX_WORDS) return null;
  if (/[.;]/.test(t) || DESCRIPTION_RE.test(t) || OPENER_RE.test(t)) return null;
  return t;
}

export function inferProjectProblem(problem: string, title: string, description = ""): string {
  const haystack = `${title} ${description}`.toLowerCase();
  return cleanProblem(problem) ?? (/(consent|privacy|gdpr|compliance|audit)/.test(haystack) ? "verifiable consent tracking and audit logging" : cleanProblem(description)) ?? "this problem";
}
