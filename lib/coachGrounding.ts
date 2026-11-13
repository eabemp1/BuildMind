/**
 * lib/coachGrounding.ts: the coach may only state numbers and time spans it was given.
 * A model asked to "name the pattern" will otherwise invent one ("no outreach in 14 days").
 */
export const COACH_GROUNDING_RULE =
  "- Never state a duration, count, percentage or date (for example \"in 14 days\" or \"80% of the time\") unless that exact figure is in the FOUNDER CONTEXT below. If he asks about customer contact, evidence or how long something has gone on and the context does not say, say you cannot see it and ask him, instead of guessing";
