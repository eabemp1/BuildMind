/**
 * Interview notes, read honestly. Every theme must carry a quote that is
 * really in the pasted notes, and BuildMind counts how many quotes describe
 * something the person actually did (past behaviour) versus what they said
 * they would do or like. The counts are computed in code, not by the model.
 */
export interface NoteTheme { theme: string; quote: string; behaviour: boolean }
export interface NotesRead { themes: NoteTheme[]; behaviourCount: number; opinionCount: number; surprise: string; nextQuestion: string }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const BEHAVIOUR = /\b(?:i|we|they|my team)\s+(?:have\s+|had\s+|just\s+|already\s+)?(?:used|tried|paid|bought|spent|built|switched|hired|stopped|quit|cancelled|canceled|tracked|made|did|wrote|asked|lost|missed|signed|started)\b|\blast (?:week|month|year|time|quarter)\b|\b(?:yesterday|this morning|two weeks ago|a month ago)\b|\bi(?:'ve| have) been\b/i;
const HYPOTHETICAL = /\b(?:would|might|could|probably|maybe|if (?:it|you|there)|i guess|sounds (?:good|great|interesting)|love to|nice to have)\b/i;

export const isBehaviour = (quote: string): boolean => BEHAVIOUR.test(quote) && !/^\s*(?:i|we)\s+would\b/i.test(quote);

export function guardNotes(raw: unknown, notes: string): NotesRead {
  const o = (raw ?? {}) as Record<string, unknown>;
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const hay = norm(notes);
  const themes: NoteTheme[] = [];
  const seen = new Set<string>();
  for (const t of (Array.isArray(o.themes) ? o.themes : []).slice(0, 6)) {
    const x = (t ?? {}) as Record<string, unknown>;
    const theme = s(x.theme, 140); const quote = s(x.quote, 260);
    if (!theme || quote.length < 12 || !hay.includes(norm(quote))) continue;
    const key = norm(quote);
    if (seen.has(key)) continue;
    seen.add(key);
    themes.push({ theme, quote, behaviour: isBehaviour(quote) });
  }
  const behaviourCount = themes.filter((t) => t.behaviour).length;
  const opinionCount = themes.filter((t) => !t.behaviour && HYPOTHETICAL.test(t.quote)).length;
  return { themes, behaviourCount, opinionCount, surprise: s(o.surprise, 240), nextQuestion: s(o.nextQuestion, 200) };
}
