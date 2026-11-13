/**
 * lib/coachGrounding.ts: the coach may only state numbers and time spans it was given.
 * A model asked to "name the pattern" will otherwise invent one ("no outreach in 14 days").
 */
export const COACH_GROUNDING_RULE =
  "- Never state a duration, count, percentage or date (for example \"in 14 days\" or \"80% of the time\") unless that exact figure is in the FOUNDER CONTEXT below. If he asks about customer contact, evidence or how long something has gone on and the context does not say, say you cannot see it and ask him, instead of guessing";

const FIGURE_RE = /\b(\d+(?:\.\d+)?)\s?(?:%|(?:percent|days?|weeks?|months?|hours?)\b)/gi;

/** Figures like "14 days" or "80%" in the reply whose number appears nowhere in what the coach was given. */
export function unsupportedFigures(reply: string, given: string): string[] {
  const givenNumbers = new Set(given.match(/\d+(?:\.\d+)?/g) ?? []);
  const out: string[] = [];
  for (const m of reply.matchAll(FIGURE_RE)) {
    if (!givenNumbers.has(m[1]) && !out.includes(m[0])) out.push(m[0]);
  }
  return out;
}

/**
 * Adds a one-line caveat when the reply states a figure the coach had no data for. It does not rewrite the reply.
 * Skipped when the coach cited web sources, since those can legitimately carry numbers.
 */
export function withFigureNote(reply: string, given: string, citedSources = false): string {
  if (citedSources) return reply;
  const bad = unsupportedFigures(reply, given);
  if (!bad.length) return reply;
  return `${reply}\n\nNote: I could not find "${bad.slice(0, 2).join('" or "')}" in your project data, so treat that as my guess, not a fact.`;
}
