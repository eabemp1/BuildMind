/**
 * lib/landing/design.ts: what a founder can control on a published landing page, and what is allowed on it. Pure.
 * The page is rendered from this one object, in the editor preview and on the public link, so they match.
 * Nothing here is invented: proof is shown only when the founder typed it, and every free-text field passes the
 * same guards as offer pages (no links, emails or phone numbers; nothing that looks like a login or payment page).
 */
import { looksPhishy, stripContactBits } from "@/lib/offers/page";
import { inventedExperience, inventedTerms } from "@/lib/prep/experienceGuard";
import { unsupportedNumbers } from "@/lib/distribution/engine";

export interface Item { title: string; text: string }
export interface PageDesign {
  brand: string;
  accent: string;            // #rrggbb
  logo: string;              // data URL, or ""
  screenshot: string;        // data URL, or ""
  screenshotAlt: string;
  cta: string;               // button label
  benefits: Item[];          // up to 3
  steps: Item[];             // up to 3
  whoFor: string;
  proofQuote: string;        // only what a real person said; "" hides the section
  proofWho: string;
  finalTitle: string;
  finalText: string;
}

export const DEFAULT_ACCENT = "#0E7C66";
export const MAX_IMAGE_BYTES = 400_000;
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/\s+/g, " ").trim().slice(0, n) : "");
const text = (v: unknown, n: number) => stripContactBits(clip(v, n));

export function cleanAccent(v: unknown): string {
  const t = typeof v === "string" ? v.trim() : "";
  return /^#[0-9a-f]{6}$/i.test(t) ? t.toLowerCase() : DEFAULT_ACCENT.toLowerCase();
}

/** Only png, jpeg or webp data URLs under the size cap. SVG is refused because it can carry script. */
export function cleanImage(v: unknown): string {
  const t = typeof v === "string" ? v.trim() : "";
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(t);
  if (!m) return "";
  return Math.floor((m[2].length * 3) / 4) <= MAX_IMAGE_BYTES ? t : "";
}

const items = (v: unknown): Item[] =>
  (Array.isArray(v) ? v : []).slice(0, 3).map((x) => { const o = (x ?? {}) as Record<string, unknown>; return { title: text(o.title, 60), text: text(o.text, 200) }; }).filter((i) => i.title && i.text);

/** Turn anything into a safe design. Returns null when the text looks like a login, payment or verification page. */
export function cleanDesign(raw: unknown): PageDesign | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const d: PageDesign = {
    brand: text(r.brand, 40), accent: cleanAccent(r.accent),
    logo: cleanImage(r.logo), screenshot: cleanImage(r.screenshot), screenshotAlt: text(r.screenshotAlt, 120),
    cta: text(r.cta, 30) || "Join the early list",
    benefits: items(r.benefits), steps: items(r.steps),
    whoFor: text(r.whoFor, 160), proofQuote: text(r.proofQuote, 300), proofWho: text(r.proofWho, 60),
    finalTitle: text(r.finalTitle, 70), finalText: text(r.finalText, 160),
  };
  const all = [d.brand, d.cta, d.whoFor, d.proofQuote, d.proofWho, d.finalTitle, d.finalText, ...d.benefits.flatMap((i) => [i.title, i.text]), ...d.steps.flatMap((i) => [i.title, i.text])];
  return looksPhishy(...all) ? null : d;
}

export const emptyDesign = (): PageDesign => cleanDesign({})!;

/** Text colour that stays readable on the accent (WCAG relative luminance). */
export function onAccent(hex: string): string {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return L > 0.4 ? "#10231C" : "#ffffff";
}

/** What the page can honestly show: sections appear only when the founder has filled them. */
export function sectionsOf(d: PageDesign) {
  return {
    benefits: d.benefits.length > 0, steps: d.steps.length > 0, who: !!d.whoFor,
    proof: !!d.proofQuote, hero: d.screenshot ? "screenshot" as const : d.benefits.length ? "card" as const : "none" as const,
  };
}

export function buildSectionsPrompt(i: { name: string; draft: string; what: string; customer: string }): string {
  return `You help a solo founder turn their landing page copy into page sections. Use ONLY the facts below. Do not invent features, numbers, prices, results, customers, testimonials, guarantees, security or privacy promises, or the founder's experience. No links, emails or phone numbers. No words about logins, passwords or payments.
PRODUCT: ${i.name}
WHAT IT DOES: ${i.what}
WHO IT IS FOR: ${i.customer}
THE FOUNDER'S DRAFT COPY:
${i.draft.slice(0, 2500)}
Return JSON only: {"benefits":[{"title":"max 6 words","text":"one or two plain sentences"}],"steps":[{"title":"max 5 words","text":"one sentence"}],"whoFor":"one line","finalTitle":"short call to action headline","finalText":"one line"}
Give exactly 3 benefits and 3 steps. Steps are what a new person does to get started.`;
}

/**
 * The model's drafted sections, with anything it made up removed: an item (or line) that states a number, an
 * experience or a term the founder never gave is dropped, not rewritten. `allowed` is everything the founder wrote.
 */
export function guardSections(raw: unknown, allowed: string): Partial<PageDesign> {
  const bad = (t: string) => !t || unsupportedNumbers(t, allowed).length > 0 || inventedExperience(t, allowed).length > 0 || inventedTerms(t, allowed).length > 0;
  const r = (raw ?? {}) as Record<string, unknown>;
  const keep = (v: unknown): Item[] => items(v).filter((i) => !bad(`${i.title}. ${i.text}`));
  const line = (v: unknown, n: number) => { const t = text(v, n); return bad(t) ? "" : t; };
  return { benefits: keep(r.benefits), steps: keep(r.steps), whoFor: line(r.whoFor, 160), finalTitle: line(r.finalTitle, 70), finalText: line(r.finalText, 160) };
}
