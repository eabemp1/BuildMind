/**
 * lib/pageReader.ts — safe page fetch + readable-text extraction.
 *
 * Search snippets are 1-2 sentences. To judge a competitor you need what the
 * page actually says: headline, description, pricing hints, features. This
 * reads a page with an SSRF guard, size/time caps and no JS execution, and
 * returns a compact structured digest. Server-side only. Never throws.
 */

export interface PageDigest {
  url: string;
  ok: boolean;
  title: string;
  description: string;
  headings: string[];
  text: string;          // readable body, capped
  prices: string[];      // e.g. "$29/mo"
  hasPricingPage: boolean;
  status?: number;
}

const MAX_BYTES = 450_000;
const TIMEOUT = 6500;

/** Blocks non-http(s), credentials, localhost, private/link-local ranges. */
export function isSafePublicUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
  }
  if (h.startsWith("[") || h.includes(":")) return false;
  if (u.port && !["80", "443"].includes(u.port)) return false;
  return true;
}

const ENT: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " ", "&rsquo;": "'", "&ndash;": "-", "&mdash;": "-" };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|nbsp|rsquo|ndash|mdash);/g, (m) => ENT[m] ?? m);
const strip = (s: string) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

function meta(html: string, name: string): string {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, "i");
  return decode((html.match(re)?.[1] ?? html.match(re2)?.[1] ?? "").trim());
}

/** Pure: HTML -> digest. Exported for tests. */
export function digestHtml(url: string, html: string): PageDigest {
  const title = strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") || meta(html, "og:title");
  const description = meta(html, "description") || meta(html, "og:description");
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const headings = [...body.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map((m) => strip(m[1])).filter((h) => h.length > 3 && h.length < 140).slice(0, 12);
  const text = strip(body.replace(/<\/(p|div|li|h\d|tr|section)>/gi, ". ")).slice(0, 3500);
  const priceSet = new Set<string>();
  for (const m of html.matchAll(/(?:[$€£]|GH₵|USD\s?)\s?\d{1,4}(?:[.,]\d{1,2})?\s?(?:\/|per)?\s?(?:mo|month|yr|year|user|seat)?/gi)) {
    const v = m[0].replace(/\s+/g, " ").trim();
    if (/\d/.test(v)) priceSet.add(v);
    if (priceSet.size >= 6) break;
  }
  const hasPricingPage = /href=["'][^"']*pricing[^"']*["']/i.test(html);
  return { url, ok: true, title, description, headings, text, prices: [...priceSet], hasPricingPage };
}

export async function readPage(url: string): Promise<PageDigest> {
  const fail = (status?: number): PageDigest => ({ url, ok: false, title: "", description: "", headings: [], text: "", prices: [], hasPricingPage: false, status });
  if (!isSafePublicUrl(url)) return fail();
  try {
    // Follow redirects by hand so every hop is checked before it is requested.
    let cur = url;
    let res: Response | null = null;
    for (let hop = 0; hop < 4; hop++) {
      res = await fetch(cur, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BuildMindResearch/1.0; +https://buildmind.live)", Accept: "text/html,application/xhtml+xml", "Accept-Language": "en" },
        signal: AbortSignal.timeout(TIMEOUT),
        redirect: "manual",
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        let next = "";
        try { next = new URL(res.headers.get("location") as string, cur).toString(); } catch { return fail(); }
        if (!isSafePublicUrl(next)) return fail();
        cur = next;
        continue;
      }
      break;
    }
    if (!res || (res.status >= 300 && res.status < 400)) return fail(res?.status);
    if (!res.ok) return fail(res.status);
    const ct = res.headers.get("content-type") ?? "";
    if (ct && !/text\/html|application\/xhtml/i.test(ct)) return fail(res.status);
    const reader = res.body?.getReader();
    let html = "";
    if (reader) {
      const dec = new TextDecoder();
      let bytes = 0;
      while (bytes < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        html += dec.decode(value, { stream: true });
      }
      try { await reader.cancel(); } catch { /* ignore */ }
    } else html = (await res.text()).slice(0, MAX_BYTES);
    return { ...digestHtml(url, html), status: res.status };
  } catch { return fail(); }
}

/** Read several pages with bounded concurrency. */
export async function readPages(urls: string[], concurrency = 3): Promise<PageDigest[]> {
  const out: PageDigest[] = new Array(urls.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (i < urls.length) { const k = i++; out[k] = await readPage(urls[k]); }
  }));
  return out;
}
