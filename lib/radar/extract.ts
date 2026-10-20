/**
 * lib/radar/extract.ts — turn a pasted link or text into a typed Radar item.
 * The model fills fields; code decides what is kept. A date, place or
 * eligibility line survives only if its quoted source text really appears in
 * what was read, and a date must agree with that quote. The kind comes from
 * classify.ts, not the model.
 */
import { readPage } from "@/lib/pageReader";
import { callModelJSON } from "@/lib/ai-providers";
import { classifyOpportunity, classifyRole, isMeetingUrl, isProfileUrl } from "@/lib/radar/classify";
import { typeOfKind, type RadarKind, type PersonRole } from "@/lib/radar/types";

export interface Draft {
  kind: RadarKind; kind_confirmed: boolean; alternatives: RadarKind[]; why: string;
  title: string; organizer: string | null; url: string | null; location: string | null; is_virtual: boolean; meeting_url: string | null;
  starts_at: string | null; ends_at: string | null; deadline_at: string | null; eligibility: string | null; cost: string | null;
  role: PersonRole | null; source_text: string; dropped: string[];
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const norm = (s: string) => s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim();

/** The quote must literally appear in the source. */
export function quoteInSource(quote: unknown, source: string): boolean {
  const q = norm(String(quote ?? ""));
  return q.length >= 4 && norm(source).includes(q);
}

/** The ISO date must agree with the quote: same day number and same month (name or number). */
export function quoteMatchesDate(quote: string, iso: string): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  const d = new Date(t);
  const day = String(d.getUTCDate()), mon = d.getUTCMonth();
  const q = norm(quote);
  const dayHit = new RegExp(`(?:^|[^0-9])0?${day}(?:st|nd|rd|th)?(?:[^0-9]|$)`).test(q);
  const monHit = q.includes(MONTHS[mon]) || new RegExp(`(?:^|[^0-9])0?${mon + 1}(?:[^0-9]|$)`).test(q);
  return dayHit && monHit;
}

export function plausibleDate(iso: unknown, now = Date.now()): string | null {
  const t = Date.parse(String(iso ?? ""));
  if (Number.isNaN(t)) return null;
  if (t < now - 2 * 86_400_000 || t > now + 3 * 365 * 86_400_000) return null;
  return new Date(t).toISOString();
}

const MEETING_URL_RE = /https?:\/\/[^\s"'<>)]+/gi;
export function findMeetingUrl(text: string, url?: string | null): string | null {
  if (url && isMeetingUrl(url)) return url;
  for (const m of text.match(MEETING_URL_RE) ?? []) if (isMeetingUrl(m)) return m.replace(/[.,;]+$/, "");
  return null;
}

const PROMPT = `You read a page about an opportunity (event, program, meeting or a person) and extract fields. Return ONLY JSON:
{"title":"","organizer":"","starts_at":"ISO 8601 or null","ends_at":"ISO 8601 or null","deadline_at":"ISO 8601 or null","location":"city/venue or null","is_virtual":false,"eligibility":"who can join/apply, or null","cost":"price or fee, or null","quotes":{"starts_at":"exact words from the text that give the start date","deadline_at":"exact words that give the deadline","location":"exact words that give the place","eligibility":"exact words","cost":"exact words"}}
Rules: use ONLY the text. If a field is not stated, use null. Every non-null date, location, eligibility and cost needs a quote copied exactly from the text. Never guess a year or a place. starts_at is when it happens, deadline_at is the last day to apply or register.`;

export async function extractDraft(input: { url?: string | null; text?: string | null }, now = Date.now()): Promise<Draft | null> {
  const url = input.url?.trim() || null;
  let source = (input.text ?? "").trim();
  let title = "";
  if (url && isProfileUrl(url)) {
    const handle = url.replace(/\/+$/, "").split("/").pop() ?? "";
    return { kind: "person", kind_confirmed: true, alternatives: [], why: "The link is a personal profile.", title: source.split("\n")[0]?.slice(0, 80) || handle, organizer: null, url, location: null, is_virtual: false, meeting_url: null, starts_at: null, ends_at: null, deadline_at: null, eligibility: null, cost: null, role: classifyRole(source), source_text: source.slice(0, 4000), dropped: [] };
  }
  if (url && !source) {
    const page = await readPage(url);
    if (page.ok) { title = page.title; source = [page.title, page.description, page.headings.join(". "), page.text].filter(Boolean).join("\n"); }
  }
  if (!source && !url) return null;
  const cls = classifyOpportunity({ title: title || source.split("\n")[0], text: source, url: url ?? undefined });
  const dropped: string[] = [];
  let ai: Record<string, unknown> = {};
  if (source.length >= 20) {
    try {
      ai = await callModelJSON<Record<string, unknown>>([{ role: "system", content: PROMPT }, { role: "user", content: source.slice(0, 6000) }], { role: "fast", temperature: 0.1, maxTokens: 700 });
    } catch { /* classify-only draft */ }
  }
  const q = (ai.quotes ?? {}) as Record<string, unknown>;
  const keep = (key: string, val: unknown): string | null => {
    const v = typeof val === "string" ? val.trim() : "";
    if (!v) return null;
    if (!quoteInSource(q[key], source)) { dropped.push(`${key}: not found in the source text`); return null; }
    return v.slice(0, 300);
  };
  const date = (key: "starts_at" | "ends_at" | "deadline_at"): string | null => {
    const iso = plausibleDate(ai[key], now);
    if (!iso) return null;
    const qk = key === "ends_at" ? "starts_at" : key;
    if (key !== "ends_at" && !(quoteInSource(q[qk], source) && quoteMatchesDate(String(q[qk]), iso))) { dropped.push(`${key}: the date did not match the text`); return null; }
    return iso;
  };
  const kind = cls.kind;
  const meetingUrl = findMeetingUrl(source, url);
  const virtual = Boolean(meetingUrl) || (ai.is_virtual === true && /\b(?:online|virtual|zoom|webinar|remote)\b/i.test(source));
  const dTitle = String(ai.title ?? "").trim() || title || source.split("\n")[0] || url || "Untitled";
  return {
    kind, kind_confirmed: cls.confirmed, alternatives: cls.alternatives, why: cls.why,
    title: dTitle.slice(0, 140), organizer: typeof ai.organizer === "string" && ai.organizer.trim() ? ai.organizer.trim().slice(0, 100) : null,
    url, location: virtual && !ai.location ? null : keep("location", ai.location), is_virtual: virtual, meeting_url: meetingUrl,
    starts_at: date("starts_at"), ends_at: date("ends_at"), deadline_at: typeOfKind(kind) === "program" || ai.deadline_at ? date("deadline_at") : null,
    eligibility: keep("eligibility", ai.eligibility), cost: keep("cost", ai.cost),
    role: kind === "person" ? classifyRole(source) : null, source_text: source.slice(0, 4000), dropped,
  };
}
