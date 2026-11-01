/**
 * lib/today/platformInText.ts — which channel a task sentence already names.
 * Used so a task that says "on Twitter" is never given a second, different channel ("— on WhatsApp") just because the
 * separate platform field was missing or different. Pure.
 */
const OTHER_CHANNELS = ["Facebook", "TikTok", "YouTube", "Discord", "GitHub", "X", "Messenger", "SMS", "text message", "Zoom", "Google Meet", "call", "video call", "forum", "newsletter", "Quora", "Medium", "Substack"];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The first channel named in the text, from the allowed list first, then other common channels. Null if none. */
export function namedPlatform(text: string, allowed: readonly string[]): string | null {
  for (const p of [...allowed, ...OTHER_CHANNELS]) {
    if (new RegExp(`(^|[^a-z0-9])${esc(p)}($|[^a-z0-9])`, "i").test(text)) return p;
  }
  return null;
}

/** All distinct channels named in the text, from the allowed list first. */
export function allNamedPlatforms(text: string, allowed: readonly string[]): string[] {
  const found: string[] = [];
  for (const p of [...allowed, ...OTHER_CHANNELS]) {
    if (
      new RegExp(`(^|[^a-z0-9])${esc(p)}($|[^a-z0-9])`, "i").test(text) &&
      !found.some((existing) => existing.toLowerCase() === p.toLowerCase())
    ) {
      found.push(p);
    }
  }
  return found;
}
