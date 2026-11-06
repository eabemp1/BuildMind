/**
 * lib/founderMirrorSummary.ts — one short plain-language reading of the Founder Mirror. Pure.
 * One model call turns the mirror's own beliefs into a few sentences. The result is cached against a hash of what it
 * was written from, so the model is asked again only when the mirror actually changes.
 */
export interface MirrorSummaryInput {
  beliefs: string[];
  strengthening: string[];
  weakening: string[];
  recent: string[];
  mayBeWrong: string[];
}

const strs = (v: unknown, n: number, max: number): string[] =>
  (Array.isArray(v) ? v : []).map((x) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, max) : "")).filter(Boolean).slice(0, n);

/** Takes the mirror as the page holds it and keeps only the text the summary may use. */
export function summaryInput(mirror: unknown): MirrorSummaryInput {
  const m = (mirror ?? {}) as Record<string, unknown>;
  const beliefs = (Array.isArray(m.beliefs) ? m.beliefs : []).map((b) => (b as { belief?: unknown })?.belief);
  return {
    beliefs: strs(beliefs, 6, 220),
    strengthening: strs(m.strengthening_patterns, 3, 200),
    weakening: strs(m.weakening_patterns, 3, 200),
    recent: strs(m.recent_changes, 3, 200),
    mayBeWrong: strs(m.may_be_wrong_about, 3, 200),
  };
}

export const hasEnough = (i: MirrorSummaryInput) => i.beliefs.length >= 2;

/** Small stable hash (FNV-1a) so the cache can tell whether the mirror changed. */
export function inputKey(i: MirrorSummaryInput): string {
  const s = JSON.stringify(i);
  let h = 0x811c9dc5;
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

export function summaryPrompt(i: MirrorSummaryInput): string {
  const list = (t: string, a: string[]) => (a.length ? `${t}:\n${a.map((x) => `- ${x}`).join("\n")}\n` : "");
  return `Below is what a founder tool has observed about how one founder works. Write a reading of it for that founder: 3 to 4 plain sentences, second person ("you"), no headings, no bullet points.
RULES
- Use only what is listed. Do not add traits, causes, feelings or advice that are not in it.
- Say what is observed and what is still uncertain. If "may be wrong" items are given, mention the most important one honestly.
- Do not diagnose, label their personality, or give a score.
${list("OBSERVED", i.beliefs)}${list("GETTING STRONGER", i.strengthening)}${list("GETTING WEAKER", i.weakening)}${list("RECENT CHANGES", i.recent)}${list("MAY BE WRONG", i.mayBeWrong)}
Return JSON only: {"summary":"..."}`;
}

export function normalizeSummary(raw: unknown): string | null {
  const t = (raw as { summary?: unknown })?.summary;
  if (typeof t !== "string") return null;
  const s = t.replace(/\s+/g, " ").trim();
  return s.length >= 40 ? s.slice(0, 700) : null;
}
