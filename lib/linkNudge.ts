/**
 * lib/linkNudge.ts - channel tags for tracked links, and the nudge to use one.
 * Pure. The point: results are counted on BuildMind's own links, so the founder should put one in the
 * post or message before it goes out, and should make one per channel to see which channel works.
 */

export const SOURCES = ["x", "linkedin", "reddit", "whatsapp", "indiehackers", "hn", "devto", "email", "other"] as const;
export type LinkSource = (typeof SOURCES)[number];

export const SOURCE_LABELS: Record<LinkSource, string> = {
  x: "X", linkedin: "LinkedIn", reddit: "Reddit", whatsapp: "WhatsApp", indiehackers: "Indie Hackers",
  hn: "Hacker News", devto: "dev.to", email: "Email", other: "Other",
};

export function isLinkSource(v: unknown): v is LinkSource {
  return typeof v === "string" && (SOURCES as readonly string[]).includes(v);
}

const RULES: Array<[LinkSource, RegExp]> = [
  ["indiehackers", /\bindie\s?hackers?\b|\bindiehackers\b/i],
  ["hn", /\bhacker\s?news\b|\bshow hn\b|\bhn\b/i],
  ["devto", /\bdev\.to\b/i],
  ["linkedin", /\blinked\s?in\b/i],
  ["whatsapp", /\bwhats\s?app\b/i],
  ["reddit", /\breddit\b|\br\/[a-z0-9_]{2,}/i],
  ["x", /\btwitter\b|\btweet\b|\bx\.com\b|\bon x\b|\bx thread\b|\bx post\b/i],
  ["email", /\be-?mail\b|\bcold email\b|\binbox\b/i],
];

/** The channel a task text is about, or null when it names none. */
export function inferSource(text: string | null | undefined): LinkSource | null {
  const t = String(text ?? "");
  for (const [src, re] of RULES) if (re.test(t)) return src;
  return null;
}

const OUTREACH = /\b(post|share|send|message|dm|publish|launch|announce|tweet|thread|reach out|contact|ask|invite|pitch|outreach|reply to|follow up|email|show)\b/i;

/** True when the task is about putting something in front of people, where a tracked link makes the result countable. */
export function needsTrackedLink(text: string | null | undefined): boolean {
  const t = String(text ?? "").trim();
  return t.length >= 12 && OUTREACH.test(t);
}

export interface ChannelRow { source?: LinkSource | null; kind: string; visits: number; signups: number; confirmed?: boolean; replies?: number }
export interface ChannelStat { source: LinkSource | "untagged"; visits: number; signups: number; confirmations: number; replies: number }

/** Totals per channel, best first, so the founder sees which channel produced real people. */
export function channelSummary(rows: ChannelRow[]): ChannelStat[] {
  const m = new Map<string, ChannelStat>();
  for (const r of rows ?? []) {
    const key = r.source ?? "untagged";
    const s = m.get(key) ?? { source: key as ChannelStat["source"], visits: 0, signups: 0, confirmations: 0, replies: 0 };
    s.visits += r.visits || 0;
    s.signups += r.signups || 0;
    s.replies += r.replies || 0;
    if (r.confirmed) s.confirmations += 1;
    m.set(key, s);
  }
  const weight = (s: ChannelStat) => s.signups * 15 + s.confirmations * 12 + s.replies * 12 + s.visits;
  return [...m.values()].filter((s) => s.visits + s.signups + s.confirmations + s.replies > 0).sort((a, b) => weight(b) - weight(a));
}
