/**
 * lib/screenshotMetrics.ts - turn the text read from a screenshot into numbers a founder can use as proof.
 *
 * The screenshot is read on the founder's own device (see components/ScreenshotProof.tsx); only this text and
 * the numbers found in it are sent anywhere. Pure and deterministic: no model, no network.
 *
 * Honest limits: a screenshot can be edited, so what it supports is proof-level evidence, never "verified".
 * The same picture cannot be reused (its fingerprint is checked), and the founder reviews every number before use.
 */

export type MetricName = "views" | "likes" | "comments" | "replies" | "shares" | "bookmarks" | "clicks";
export interface Metric { name: MetricName; value: number }

export type ScreenshotPlatform = "x" | "linkedin" | "reddit" | "hn" | "instagram" | "whatsapp" | "unknown";

export interface ScreenshotReading {
  platform: ScreenshotPlatform;
  metrics: Metric[];
  /** The first readable words that are not statistics, so the proof says what the post was about. */
  excerpt: string;
  readable: boolean;
}

const LABELS: Array<[RegExp, MetricName]> = [
  [/^(?:views?|impressions?|plays?|reach)$/i, "views"],
  [/^(?:likes?|reactions?|upvotes?|points?|hearts?|loves?)$/i, "likes"],
  [/^(?:comments?)$/i, "comments"],
  [/^(?:repl(?:y|ies))$/i, "replies"],
  [/^(?:reposts?|retweets?|shares?|quotes?|quote\s+tweets?)$/i, "shares"],
  [/^(?:bookmarks?|saves?)$/i, "bookmarks"],
  [/^(?:clicks?|link\s+clicks?)$/i, "clicks"],
];

/** "1.2K" -> 1200, "3,456" -> 3456, "2M" -> 2000000. Returns null when it is not a plausible count. */
export function parseCount(raw: string): number | null {
  const m = String(raw).trim().replace(/\s+/g, "").match(/^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?([kKmM])?$/);
  if (!m) return null;
  const whole = Number(m[1].replace(/,/g, ""));
  const frac = m[2] ? Number(`0.${m[2]}`) : 0;
  const mult = m[3] ? (m[3].toLowerCase() === "k" ? 1_000 : 1_000_000) : 1;
  const v = Math.round((whole + frac) * mult);
  return Number.isFinite(v) && v >= 0 && v <= 2_000_000_000 ? v : null;
}

const WORD = "(?:views?|impressions?|plays?|reach|likes?|reactions?|upvotes?|points?|comments?|repl(?:y|ies)|reposts?|retweets?|shares?|quotes?|bookmarks?|saves?|clicks?)";
// "1.2K Views", "14 Replies", "48 upvotes"
const NUM_THEN_LABEL = new RegExp(`(^|[^\\w.,])(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)\\s?([kKmM])?\\s+(${WORD})\\b`, "gi");
// "Views 1.2K" (some apps put the label first)
const LABEL_THEN_NUM = new RegExp(`\\b(${WORD})\\s*[:·|-]?\\s+(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)\\s?([kKmM])?(?![\\w.,]*\\s?(?:${WORD}))`, "gi");

function nameOf(label: string): MetricName | null {
  for (const [re, name] of LABELS) if (re.test(label.trim())) return name;
  return null;
}

export function detectPlatform(text: string): ScreenshotPlatform {
  const t = text.toLowerCase();
  if (/\bwhatsapp\b|\btype a message\b|\bmessage yourself\b/.test(t)) return "whatsapp";
  if (/\blinkedin\b|\breactions?\b.*\bcomments?\b|\bconnections?\b|\bfollowers\b.*\bpost\b/.test(t)) return "linkedin";
  if (/\br\/[a-z0-9_]{2,}|\breddit\b|\bupvotes?\b|\bawards?\b/.test(t)) return "reddit";
  if (/\bhacker news\b|\bpoints by\b|\byc\b|\bnews\.ycombinator\b/.test(t) || /\d+\s+points?\s+by\b/.test(t)) return "hn";
  if (/\binstagram\b|\bliked by\b|\bview insights\b/.test(t)) return "instagram";
  if (/\breposts?\b|\bretweets?\b|\bquotes\b|\bviews?\b.*@|@\w+.*\bviews?\b|\btweet\b|\bx\.com\b/.test(t)) return "x";
  return "unknown";
}

export const PLATFORM_LABEL: Record<ScreenshotPlatform, string> = {
  x: "X", linkedin: "LinkedIn", reddit: "Reddit", hn: "Hacker News", instagram: "Instagram", whatsapp: "WhatsApp", unknown: "a social post",
};

/** Read counts like "14 Replies" out of OCR text. The same statistic seen twice is counted once (the larger). */
export function readScreenshotText(raw: string): ScreenshotReading {
  const text = String(raw ?? "").replace(/[|•]/g, " ").replace(/[ \t]+/g, " ");
  const best = new Map<MetricName, number>();
  const take = (label: string, num: string, suffix: string | undefined) => {
    const name = nameOf(label);
    const value = parseCount(`${num}${suffix ?? ""}`);
    if (!name || value === null) return;
    best.set(name, Math.max(best.get(name) ?? 0, value));
  };
  for (const m of text.matchAll(NUM_THEN_LABEL)) take(m[4], m[2], m[3]);
  for (const m of text.matchAll(LABEL_THEN_NUM)) take(m[1], m[2], m[3]);

  const metrics: Metric[] = [...best.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => a.name.localeCompare(b.name));
  const prose = text.split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 12 && /[a-z]{3,}/i.test(l))
    .filter((l) => !new RegExp(`\\d\\s?[kKmM]?\\s+${WORD}\\b`, "i").test(l))
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 140);
  return { platform: detectPlatform(text), metrics, excerpt: prose, readable: text.replace(/[^a-z]/gi, "").length >= 25 };
}

export function metricsLine(metrics: Metric[]): string {
  return metrics.map((m) => `${m.value} ${m.name}`).join(", ");
}

/** The signal a screenshot best supports: people who responded beat people who only looked. */
export function suggestSignal(metrics: Metric[]): { kind: "reply" | "other" | null; count: number } {
  const get = (n: MetricName) => metrics.find((m) => m.name === n)?.value ?? 0;
  const talk = get("comments") + get("replies");
  if (talk > 0) return { kind: "reply", count: Math.min(999, talk) };
  const other = get("likes") + get("shares") + get("bookmarks");
  if (other > 0) return { kind: "other", count: Math.min(999, other) };
  return { kind: null, count: 0 };
}

/**
 * The proof text saved with a reflection. It starts with the picture's fingerprint so the same screenshot
 * cannot back two tasks (see checkProof), and it names what was read so the founder can see it later.
 */
export function screenshotProofText(fingerprint: string, reading: ScreenshotReading): string {
  const stats = metricsLine(reading.metrics);
  const label = PLATFORM_LABEL[reading.platform];
  return `Screenshot ${fingerprint}: ${label} post${stats ? ` showing ${stats}` : ""}${reading.excerpt ? `. Text on screen: ${reading.excerpt}` : ""}`.slice(0, 1900);
}

/** First 16 hex characters of the SHA-256 of the image bytes. Works in the browser and in Node. */
export async function fingerprintBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
