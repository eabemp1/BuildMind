/**
 * Google Search Console, read-only. Turns a site's own search data into
 * opportunities an SEO brief can start from: queries it almost ranks for,
 * and queries people see but never click. All numbers are computed in code.
 */
import type { PrepFact } from "@/lib/prep/kinds";

export const SC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export interface SearchRow { query: string; clicks: number; impressions: number; ctr: number; position: number }
export interface SearchSummary {
  asOf: string;
  site: string;
  range: { start: string; end: string };
  clicks: number;
  impressions: number;
  topQueries: SearchRow[];
  /** Ranks just off page one or low on it, with real demand. The best SEO targets. */
  nearMisses: SearchRow[];
  /** Seen often, never clicked. Usually a title or snippet problem. */
  unclicked: SearchRow[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function summariseSearch(rows: SearchRow[], site: string, range: { start: string; end: string }, now = new Date()): SearchSummary {
  const clean = rows.filter((r) => r.query && Number.isFinite(r.impressions));
  const clicks = clean.reduce((a, r) => a + (r.clicks || 0), 0);
  const impressions = clean.reduce((a, r) => a + (r.impressions || 0), 0);
  const tidy = (r: SearchRow): SearchRow => ({ query: r.query.slice(0, 100), clicks: r.clicks, impressions: r.impressions, ctr: Math.round(r.ctr * 1000) / 10, position: r1(r.position) });
  return {
    asOf: now.toISOString(), site, range, clicks, impressions,
    topQueries: [...clean].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 8).map(tidy),
    nearMisses: clean.filter((r) => r.position >= 5 && r.position <= 20 && r.impressions >= 10).sort((a, b) => b.impressions - a.impressions).slice(0, 8).map(tidy),
    unclicked: clean.filter((r) => r.clicks === 0 && r.impressions >= 20 && r.position <= 10).sort((a, b) => b.impressions - a.impressions).slice(0, 5).map(tidy),
  };
}

export function searchFacts(s: SearchSummary): PrepFact[] {
  return [
    { label: `Search clicks, ${s.range.start} to ${s.range.end}`, value: String(s.clicks) },
    { label: "Search impressions, same period", value: String(s.impressions) },
  ];
}

const line = (r: SearchRow) => `"${r.query}": position ${r.position}, ${r.impressions} impressions, ${r.clicks} clicks`;

/** Deterministic bullets for the brief. Not model output. */
export function searchSections(s: SearchSummary): Array<{ heading: string; bullets: string[] }> {
  const out: Array<{ heading: string; bullets: string[] }> = [];
  if (s.nearMisses.length) out.push({ heading: "From your own Search Console: almost ranking", bullets: s.nearMisses.slice(0, 6).map(line) });
  if (s.unclicked.length) out.push({ heading: "From your own Search Console: seen but never clicked", bullets: s.unclicked.slice(0, 4).map(line) });
  return out;
}

export function searchPromptBlock(s: SearchSummary): string {
  if (!s.nearMisses.length && !s.unclicked.length && !s.topQueries.length) return "";
  const l = (title: string, rows: SearchRow[]) => (rows.length ? `${title}\n${rows.map((r) => `- ${line(r)}`).join("\n")}` : "");
  return `THIS FOUNDER'S REAL SEARCH CONSOLE DATA (${s.range.start} to ${s.range.end}). Target these queries first. Use only these numbers:\n${[l("Almost ranking:", s.nearMisses), l("Seen but never clicked:", s.unclicked), l("Already earning clicks:", s.topQueries.filter((r) => r.clicks > 0).slice(0, 4))].filter(Boolean).join("\n")}`;
}

// ── Google API ──────────────────────────────────────────────────────────────

export async function refreshAccessToken(refreshToken: string): Promise<{ ok: true; token: string } | { ok: false; kind: "auth" | "network" }> {
  const id = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) return { ok: false, kind: "auth" };
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refreshToken, grant_type: "refresh_token" }), signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (r.status === 400 || r.status === 401) return { ok: false, kind: "auth" };
    if (!r.ok) return { ok: false, kind: "network" };
    const j = (await r.json()) as { access_token?: string };
    return j.access_token ? { ok: true, token: j.access_token } : { ok: false, kind: "auth" };
  } catch { return { ok: false, kind: "network" }; }
}

export interface SiteEntry { url: string; level: string }

export async function listSites(access: string): Promise<SiteEntry[]> {
  try {
    const r = await fetch("https://www.googleapis.com/webmasters/v3/sites", { headers: { Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!r.ok) return [];
    const j = (await r.json()) as { siteEntry?: Array<{ siteUrl: string; permissionLevel: string }> };
    return (j.siteEntry ?? []).filter((s) => s.permissionLevel !== "siteUnverifiedUser").map((s) => ({ url: s.siteUrl, level: s.permissionLevel }));
  } catch { return []; }
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function fetchSearchSummary(refreshToken: string, site: string): Promise<{ ok: true; summary: SearchSummary } | { ok: false; kind: "auth" | "network" | "site" }> {
  const t = await refreshAccessToken(refreshToken);
  if (!t.ok) return t;
  const end = new Date(Date.now() - 2 * 86400000); // Search Console data lags about two days
  const start = new Date(end.getTime() - 27 * 86400000);
  try {
    const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
      method: "POST", headers: { Authorization: `Bearer ${t.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: ymd(start), endDate: ymd(end), dimensions: ["query"], rowLimit: 250 }), signal: AbortSignal.timeout(10000), cache: "no-store",
    });
    if (r.status === 401) return { ok: false, kind: "auth" };
    if (r.status === 403 || r.status === 404) return { ok: false, kind: "site" };
    if (!r.ok) return { ok: false, kind: "network" };
    const j = (await r.json()) as { rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }> };
    const rows: SearchRow[] = (j.rows ?? []).map((x) => ({ query: x.keys?.[0] ?? "", clicks: x.clicks, impressions: x.impressions, ctr: x.ctr, position: x.position }));
    return { ok: true, summary: summariseSearch(rows, site, { start: ymd(start), end: ymd(end) }) };
  } catch { return { ok: false, kind: "network" }; }
}

/** One plain sentence about what the numbers mean, decided in code so the card never over-reads thin data. */
export function describeSearch(s: SearchSummary): string {
  if (s.impressions === 0) return "Google has not shown this site in search results in this period. A new site, or one not indexed yet, looks like this. Nothing to act on yet.";
  if (s.clicks === 0) return `Shown ${s.impressions} times, never clicked. Titles and descriptions are the first thing to look at.`;
  const ctr = Math.round((s.clicks / s.impressions) * 1000) / 10;
  if (s.impressions < 100) return `${s.clicks} click${s.clicks === 1 ? "" : "s"} from ${s.impressions} impressions (${ctr}%). Too little data to draw conclusions yet.`;
  return `${s.clicks} clicks from ${s.impressions} impressions (${ctr}%).`;
}
