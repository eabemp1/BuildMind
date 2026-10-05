/**
 * lib/webResearchGate.ts — client-safe half of web research (no Node imports),
 * so the Coach page can show "Searching the web" while the server works.
 */

// ── Gate ──────────────────────────────────────────────────────────────────

export const URL_RE = /\bhttps?:\/\/[^\s<>"')]+/gi;
const LIVE_RE = /\b(search|look\s?up|google|find (me )?(info|out|data|examples?)|research|browse|check (the )?(web|internet|online|site|website|page)|latest|recent(ly)?|news|current(ly)?|right now|pricing|price of|how much (does|do|is)|competitors?|alternatives? to|who (is|are|runs|founded)|what is|what are|compare|vs\.?|versus|trend(s|ing)?|market size|funding|raised|launch(ed)?|review(s)?)\b/i;
const PERSONAL_RE = /^(show|open|export|how am i|what should i do|what('s| is) my|why (am|do) i|i feel|i'm (stuck|tired|overwhelmed))/i;

export function extractUrls(text: string): string[] {
  return Array.from(new Set((text.match(URL_RE) ?? []).map(u => u.replace(/[.,;:!?]+$/, ""))));
}

/** Cheap gate: does this message likely need information from outside BuildMind? */
export function needsWebResearch(message: string): boolean {
  const m = message.trim();
  if (m.length < 8) return false;
  if (extractUrls(m).length > 0) return true;
  if (PERSONAL_RE.test(m) && !LIVE_RE.test(m)) return false;
  return LIVE_RE.test(m);
}

