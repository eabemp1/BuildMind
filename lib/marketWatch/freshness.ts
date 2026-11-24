/**
 * lib/marketWatch/freshness.ts — is a source evidence of what changed THIS WEEK, background, or neither.
 *
 * Pure. Dates are the page's own claims (a published time in its markup), never the day BuildMind
 * looked at it: checking an old article today does not make it recent. Rules:
 *   - this_week : published inside the stated week, names the competitor, and its opening does not
 *                 describe an older dated event. Only these count as changes.
 *   - context   : published within the last 90 days (before the week), shown separately as background.
 *   - excluded  : older than 90 days, undated, unreadable, or not about the competitor. Never counted.
 */

export const CONTEXT_DAYS = 90;

export type Freshness = "this_week" | "context" | "excluded";
export type ExcludeReason = "older" | "undated" | "unreadable" | "off_topic" | "repeats_old_event";

export interface FreshnessVerdict { status: Freshness; reason?: ExcludeReason; publishedAt?: string }

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MON_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const monthIndex = (m: string) => MONTHS.findIndex((x) => x.startsWith(m.toLowerCase().slice(0, 3)));

const day = (y: number, m: number, d: number) => Date.UTC(y, m, d);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** A YYYY-MM-DD from a markup value like "2026-11-20T09:00:00Z", or null when it is not a real date. */
export function toIsoDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1995 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = day(y, mo - 1, d);
  return new Date(t).getUTCMonth() === mo - 1 ? iso(t) : null;
}

/** Explicit dates written in text: "12 May 2022", "May 12, 2022", "2022-05-12", "May 2022" (read as the 1st). */
export function datesInText(text: string): string[] {
  const out: string[] = [];
  const push = (y: number, m: number, d: number) => { if (y >= 1995 && y <= 2100 && m >= 0) out.push(iso(day(y, m, d))); };
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) { const t = toIsoDate(m[0]); if (t) out.push(t); }
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON_RE}\\.?,?\\s+(\\d{4})\\b`, "gi"))) push(+m[3], monthIndex(m[2]), +m[1]);
  for (const m of text.matchAll(new RegExp(`\\b${MON_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "gi"))) push(+m[3], monthIndex(m[1]), +m[2]);
  for (const m of text.matchAll(new RegExp(`\\b${MON_RE}\\.?,?\\s+(\\d{4})\\b`, "gi"))) push(+m[2], monthIndex(m[1]), 1);
  return out;
}

/** Does the page talk about this competitor at all? A match on the name is the minimum for "supports the claim". */
export function mentionsCompetitor(text: string, title: string, name: string): boolean {
  const n = name.trim().toLowerCase();
  if (n.length < 2) return false;
  return `${title} ${text}`.toLowerCase().includes(n);
}

export interface FreshnessInput {
  publishedAt?: string | null;   // the page's own publication time, if its markup had one
  readable: boolean;             // the page loaded and had text
  title: string;
  text: string;                  // readable page text
  competitor: string;
  weekStart: string;             // Monday, YYYY-MM-DD
  now: Date;
}

export function classifySource(i: FreshnessInput): FreshnessVerdict {
  if (!i.readable) return { status: "excluded", reason: "unreadable" };
  const published = toIsoDate(i.publishedAt);
  if (!published) return { status: "excluded", reason: "undated" };
  if (!mentionsCompetitor(i.text, i.title, i.competitor)) return { status: "excluded", reason: "off_topic", publishedAt: published };

  const nowMs = i.now.getTime();
  const pubMs = Date.parse(`${published}T00:00:00Z`);
  const weekStartMs = Date.parse(`${i.weekStart}T00:00:00Z`);
  const weekEndMs = weekStartMs + 7 * 86_400_000;
  const contextStartMs = weekStartMs - CONTEXT_DAYS * 86_400_000;

  if (pubMs > nowMs + 86_400_000) return { status: "excluded", reason: "undated", publishedAt: published }; // a date in the future is not trustworthy
  if (pubMs < contextStartMs) return { status: "excluded", reason: "older", publishedAt: published };
  if (pubMs < weekStartMs || pubMs >= weekEndMs) return { status: "context", publishedAt: published };

  // Published this week. A fresh article can still be about an old event: look at the title and opening.
  const opening = `${i.title} . ${i.text.slice(0, 500)}`;
  const mentioned = datesInText(opening).map((d) => Date.parse(`${d}T00:00:00Z`));
  if (mentioned.some((t) => t < contextStartMs)) return { status: "excluded", reason: "repeats_old_event", publishedAt: published };
  return { status: "this_week", publishedAt: published };
}

export const REASON_LABEL: Record<ExcludeReason, string> = {
  older: "older than 90 days",
  undated: "no publication date",
  unreadable: "could not be read",
  off_topic: "does not mention the competitor",
  repeats_old_event: "repeats an older event",
};
