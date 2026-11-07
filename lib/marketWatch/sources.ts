/**
 * lib/marketWatch/sources.ts — which web addresses Market Watch is allowed to watch.
 * Pure. A competitor is a company's own website, never an article, a review, a social post or a news story.
 * Every address is cut down to the homepage, and sites that are not company sites are refused.
 */
import { isSafePublicUrl } from "@/lib/pageReader";

export const MAX_COMPETITORS = 5;

/** Social, news, review and community sites: they talk about companies, they are not the company. */
const NOT_COMPETITOR_SITES = [
  "medium.com", "substack.com", "wordpress.com", "blogspot.com", "tumblr.com", "hashnode.dev", "dev.to", "hackernoon.com",
  "wikipedia.org", "reddit.com", "quora.com", "news.ycombinator.com", "indiehackers.com",
  "linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com", "youtu.be", "tiktok.com", "pinterest.com", "threads.net",
  "github.com", "gitlab.com", "producthunt.com", "g2.com", "capterra.com", "trustpilot.com", "crunchbase.com", "sourceforge.net", "alternativeto.net",
  "techcrunch.com", "forbes.com", "businessinsider.com", "bloomberg.com", "reuters.com", "theverge.com", "wired.com", "cnbc.com", "nytimes.com", "wsj.com", "ft.com", "bbc.com", "bbc.co.uk",
  "google.com", "bing.com", "duckduckgo.com", "play.google.com", "apps.apple.com",
];

export type CleanedSource = { ok: true; url: string; host: string } | { ok: false; message: string };

export const hostOf = (url: string): string => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };

export function isNotCompanySite(host: string): boolean {
  return NOT_COMPETITOR_SITES.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Turns what a person typed (or what a search found) into the competitor's homepage, or says why not. */
export function cleanCompetitorUrl(raw: string): CleanedSource {
  const text = (raw ?? "").trim().slice(0, 300);
  if (!text) return { ok: false, message: "Paste the competitor's website address." };
  let u: URL;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`); } catch { return { ok: false, message: "That does not look like a website address." }; }
  if (!isSafePublicUrl(u.toString())) return { ok: false, message: "That is not a public website address." };
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (isNotCompanySite(host)) return { ok: false, message: "That is a social, news or review site, not the competitor's own website. Paste their own homepage." };
  return { ok: true, url: `${u.protocol}//${u.hostname.toLowerCase()}/`, host };
}

/** A readable name from an address, for when the person did not type one: "app.acme.io" becomes "Acme". */
export function nameFromHost(host: string): string {
  const parts = host.replace(/^www\./, "").split(".");
  const core = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  return core ? core.charAt(0).toUpperCase() + core.slice(1) : host;
}

export interface WatchSource { name: string; url: string }

/** Manual competitors first, then the stress test's own list; one per website, at most five. */
export function mergeSources(manual: WatchSource[], derived: WatchSource[]): WatchSource[] {
  const out: WatchSource[] = [];
  const seen = new Set<string>();
  for (const s of [...manual, ...derived]) {
    const c = cleanCompetitorUrl(s.url);
    if (!c.ok || seen.has(c.host)) continue;
    seen.add(c.host);
    out.push({ name: (s.name || nameFromHost(c.host)).trim().slice(0, 80), url: c.url });
    if (out.length >= MAX_COMPETITORS) break;
  }
  return out;
}
