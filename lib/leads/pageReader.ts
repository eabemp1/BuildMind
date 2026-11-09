/**
 * lib/leads/pageReader.ts — fetch one public web page as plain text, safely. SERVER-SIDE ONLY.
 * Only http(s) on ports 80/443; refuses private, loopback and link-local addresses (checked after DNS).
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_BYTES = 600_000;

export function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::1" || v === "::" || v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd")) return true;
  const m = v.replace(/^::ffff:/, "").match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/** Cheap, synchronous checks on the URL itself. */
export function isAllowedUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  if (u.port && u.port !== "80" && u.port !== "443") return false;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (isIP(host) && isPrivateAddress(host)) return false;
  return true;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<svg[\s\S]*?<\/svg>|<!--[\s\S]*?-->/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ").split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
}

const SKIP_LINK_RE = /\.(jpe?g|png|gif|webp|svg|ico|css|js|zip|mp4|mp3)(\?|$)|\/(login|signin|sign-in|signup|register|privacy|terms|cookie|cart|checkout|account)(\/|$|\?)|^(mailto|tel|javascript):/i;
const SHARE_RE = /(facebook\.com\/sharer|twitter\.com\/intent|wa\.me\/\?text|linkedin\.com\/share|pinterest\.com\/pin)/i;

export interface PageLink { url: string; text: string }

/** Outbound links worth considering: absolute http(s), safe, not assets/login/share links, one per URL. */
export function extractLinks(html: string, base: string, max = 40): PageLink[] {
  const out: PageLink[] = [];
  const seen = new Set<string>();
  let baseHost = "";
  try { baseHost = new URL(base).hostname; } catch { return out; }
  const re = /<a\b[^>]*?href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < max) {
    let abs: string;
    try { abs = new URL(m[1].trim(), base).toString(); } catch { continue; }
    if (SKIP_LINK_RE.test(abs) || SHARE_RE.test(abs) || !isAllowedUrl(abs)) continue;
    const key = abs.replace(/#.*$/, "").replace(/\/$/, "");
    if (seen.has(key) || key === base.replace(/\/$/, "")) continue;
    const text = htmlToText(m[2]).slice(0, 80);
    // Links with no words and pointing back to the same site's root are navigation noise.
    if (!text && new URL(abs).hostname === baseHost) continue;
    seen.add(key);
    out.push({ url: abs, text });
  }
  return out;
}

async function fetchHtml(url: string, timeoutMs: number): Promise<{ html: string; finalUrl: string } | null> {
  if (!isAllowedUrl(url)) return null;
  try {
    const host = new URL(url).hostname;
    if (!isIP(host)) {
      const addrs = await lookup(host, { all: true });
      if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) return null;
    }
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
      headers: { "User-Agent": "BuildMindLeadFinder/1.0 (+https://buildmind.live)", Accept: "text/html,text/plain" },
    });
    if (!res.ok) return null;
    // A redirect may have landed somewhere internal.
    if (!isAllowedUrl(res.url)) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    let received = 0;
    const chunks: Uint8Array[] = [];
    while (received < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      received += value.length;
    }
    reader.cancel().catch(() => {});
    return { html: new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks)), finalUrl: res.url };
  } catch {
    return null;
  }
}

export async function readPage(url: string, maxChars = 3500, timeoutMs = 6000): Promise<string> {
  const got = await fetchHtml(url, timeoutMs);
  return got ? htmlToText(got.html).slice(0, maxChars) : "";
}

/** Text plus the links on the page, so a later round can follow the promising ones. */
export async function readPageWithLinks(url: string, maxChars = 3500, timeoutMs = 6000): Promise<{ text: string; links: PageLink[] }> {
  const got = await fetchHtml(url, timeoutMs);
  if (!got) return { text: "", links: [] };
  return { text: htmlToText(got.html).slice(0, maxChars), links: extractLinks(got.html, got.finalUrl) };
}
