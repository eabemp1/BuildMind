/**
 * lib/publishPage.ts - from a drafted landing copy to the fields of a live, signup-counting page.
 * Pure. The page itself is BuildMind's hosted interest page (/i/<code>); this only decides what goes on it.
 */

const LABEL = /^\s*(?:[#>*\-\s]*)(?:headline|title|hero(?: headline)?|h1|subheadline|sub-headline|subhead|tagline|cta|call to action)\s*[:\-–—]\s*/i;
const MARKDOWN = /^[#>*\-\s"“”']+|[*_"“”']+$/g;

function tidy(line: string): string {
  return line.replace(LABEL, "").replace(MARKDOWN, "").replace(/\s+/g, " ").trim();
}

export interface PageFields { headline: string; pitch: string }

/**
 * First usable line becomes the headline (5 to 120 characters, as the page requires); the next usable lines become
 * the pitch (up to 300). Returns null when the draft has no line long enough to be a headline.
 */
export function pageFromDraft(draft: string): PageFields | null {
  const lines = String(draft ?? "").split(/\r?\n/).map(tidy).filter((l) => l.length > 0);
  const i = lines.findIndex((l) => l.length >= 5);
  if (i < 0) return null;
  let headline = lines[i];
  if (headline.length > 120) headline = `${headline.slice(0, 119).replace(/\s+\S*$/, "").trimEnd()}…`;
  const rest = lines.slice(i + 1).join(" ").trim();
  let pitch = rest.length > 300 ? `${rest.slice(0, 299).replace(/\s+\S*$/, "").trimEnd()}…` : rest;
  return { headline, pitch };
}
