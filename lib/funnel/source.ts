/**
 * lib/funnel/source.ts — where a landing-page visitor came from, and who they are across pages.
 * Pure helpers plus a small browser store. First touch wins: the source is kept from the first visit,
 * so a signup a day later is still credited to the post or search that brought the visitor.
 */
export interface Touch { source: string; medium: string; campaign?: string }

const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|brave)\./;

const clean = (v: string | null | undefined, n = 40) => (v ?? "").toLowerCase().trim().replace(/[^a-z0-9._-]/g, "-").slice(0, n);

/** utm_source / ref / src first, then the referring site, otherwise direct. Own-site referrers count as direct. */
export function touchFrom(search: string, referrer: string, ownHost: string): Touch {
  const p = new URLSearchParams(search);
  const tagged = clean(p.get("utm_source") || p.get("ref") || p.get("src"));
  const medium = clean(p.get("utm_medium"), 30);
  const campaign = clean(p.get("utm_campaign"), 40) || undefined;
  if (tagged) return { source: tagged, medium: medium || "tagged", campaign };
  let host = "";
  try { host = new URL(referrer).hostname.replace(/^www\./, ""); } catch { /* no referrer */ }
  if (!host || host === ownHost.replace(/^www\./, "")) return { source: "direct", medium: "none", campaign };
  if (SEARCH.test(host)) return { source: host.split(".").slice(-2, -1)[0] || host, medium: "search", campaign };
  return { source: clean(host), medium: "referral", campaign };
}

const KEY = "bm_first_touch";
const QA_KEY = "bm_qa";

export interface StoredTouch extends Touch { vid: string }

/** Browser only. Returns the stored first touch, creating it on the first visit. */
export function firstTouch(): StoredTouch | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved) return JSON.parse(saved) as StoredTouch;
    const t: StoredTouch = { ...touchFrom(window.location.search, document.referrer, window.location.hostname), vid: (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 40) };
    window.localStorage.setItem(KEY, JSON.stringify(t));
    return t;
  } catch { return null; }
}

/** ?qa=1 marks this browser as QA for good, so test visits never count. ?qa=0 undoes it. */
export function isQaBrowser(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search).get("qa");
    if (q === "1") window.localStorage.setItem(QA_KEY, "1");
    if (q === "0") window.localStorage.removeItem(QA_KEY);
    return window.localStorage.getItem(QA_KEY) === "1";
  } catch { return false; }
}

export const BOT_UA = /bot|crawl|spider|headless|lighthouse|preview|slurp|monitor|curl|python-requests/i;
