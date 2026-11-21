/**
 * lib/offers/page.ts: one offer page built from a customer quote the founder approved. Pure.
 * The model drafts; this decides what is allowed on a public page. Rules:
 *  - the quote is shown only if it is word for word in the founder's notes, and only as "A customer", never a name
 *  - the draft may not invent the founder's experience, prices, guarantees or privacy promises (marked [add: ...] instead)
 *  - no links, emails or phone numbers in the text; the one contact is the founder's own, entered by the founder
 *  - nothing that looks like a login, payment or verification page
 *  - publishing needs every [add: ...] marker filled and a contact the founder typed
 */
import { inventedExperience, inventedTerms, scrubPrivacyPromises } from "@/lib/prep/experienceGuard";

export type CtaKind = "demo" | "pilot" | "waitlist";
export const CTA_LABEL: Record<CtaKind, string> = { demo: "Book a demo", pilot: "Request a paid pilot", waitlist: "Join the waitlist" };

export interface OfferContent {
  headline: string; subhead: string; offer: string; who_for: string;
  faqs: Array<{ q: string; a: string }>;
  cta_kind: CtaKind;
  /** The founder's own contact: an email address or an https link. Never filled by the model. */
  contact: string;
  quote: string;
}

export const MARKER = "[add: your detail]";
const MAX = { headline: 90, subhead: 160, offer: 400, who_for: 120, q: 120, a: 280, quote: 300, contact: 200 };

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/\s+/g, " ").trim().slice(0, n) : "");
/** Links, emails and phone numbers are removed from free text. */
export const stripContactBits = (t: string) =>
  t.replace(/https?:\/\/\S+|www\.\S+/gi, "").replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "").replace(/\+?\d[\d\s().-]{7,}\d/g, "").replace(/\s{2,}/g, " ").trim();

const PHISHY = /\b(password|passcode|one[- ]time (?:code|pin)|otp|log ?in|sign ?in|verify your (?:account|identity)|card number|cvv|bank (?:details|account)|wire transfer|gift cards?|seed phrase|private key)\b/i;
export const looksPhishy = (...parts: string[]) => parts.some((p) => PHISHY.test(p));

export const isCtaKind = (v: unknown): v is CtaKind => v === "demo" || v === "pilot" || v === "waitlist";

/** The contact must be an email address or an https link the founder typed. */
export function cleanContact(v: unknown): string {
  const t = clip(v, MAX.contact);
  if (/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(t)) return t.toLowerCase();
  try { const u = new URL(t); return u.protocol === "https:" && u.hostname.includes(".") ? u.toString() : ""; } catch { return ""; }
}
export const contactHref = (c: string) => (c.includes("@") && !c.startsWith("http") ? `mailto:${c}` : c);

/** The quote must be in the notes word for word (case, spacing and quote marks ignored). */
export function quoteInNotes(quote: string, notes: string): boolean {
  const n = (t: string) => t.toLowerCase().replace(/[\s’'"“”]+/g, " ").trim();
  return quote.trim().length >= 6 && n(notes).includes(n(quote));
}

function guard(text: string, allowed: string): string {
  let t = scrubPrivacyPromises(stripContactBits(text), allowed);
  for (const hit of [...inventedExperience(t, allowed), ...inventedTerms(t, allowed)]) t = t.split(hit).join(MARKER);
  return t;
}

/** Turn the model's JSON into a safe draft. `allowed` is everything the founder wrote (project, quote). */
export function normalizeDraft(raw: unknown, quote: string, allowed: string): OfferContent | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const headline = guard(clip(r.headline, MAX.headline), allowed);
  const offer = guard(clip(r.offer, MAX.offer), allowed);
  if (!headline || !offer) return null;
  const faqs = (Array.isArray(r.faqs) ? r.faqs : []).slice(0, 3).map((f) => {
    const o = (f ?? {}) as Record<string, unknown>;
    return { q: guard(clip(o.q, MAX.q), allowed), a: guard(clip(o.a, MAX.a), allowed) };
  }).filter((f) => f.q && f.a);
  const out: OfferContent = {
    headline, offer, faqs,
    subhead: guard(clip(r.subhead, MAX.subhead), allowed),
    who_for: guard(clip(r.who_for, MAX.who_for), allowed),
    cta_kind: isCtaKind(r.cta_kind) ? r.cta_kind : "demo",
    contact: "",
    quote: clip(quote, MAX.quote),
  };
  if (looksPhishy(out.headline, out.subhead, out.offer, out.who_for, ...out.faqs.flatMap((f) => [f.q, f.a]))) return null;
  return out;
}

/** The founder's edits: same limits and no links, but the words are theirs so nothing is re-scrubbed. */
export function cleanEdit(raw: unknown, current: OfferContent): OfferContent {
  const r = (raw ?? {}) as Record<string, unknown>;
  const pick = (k: keyof typeof MAX & keyof OfferContent, n: number) => (k in r ? stripContactBits(clip(r[k], n)) : (current[k] as string));
  const faqs = Array.isArray(r.faqs)
    ? r.faqs.slice(0, 3).map((f) => { const o = (f ?? {}) as Record<string, unknown>; return { q: stripContactBits(clip(o.q, MAX.q)), a: stripContactBits(clip(o.a, MAX.a)) }; }).filter((f) => f.q && f.a)
    : current.faqs;
  return {
    headline: pick("headline", MAX.headline), subhead: pick("subhead", MAX.subhead), offer: pick("offer", MAX.offer), who_for: pick("who_for", MAX.who_for),
    faqs,
    cta_kind: isCtaKind(r.cta_kind) ? r.cta_kind : current.cta_kind,
    contact: "contact" in r ? cleanContact(r.contact) : current.contact,
    quote: current.quote, // the quote is never edited: it is what the customer said
  };
}

/** What still blocks publishing, in plain words. Empty means it can go live. */
export function publishProblems(c: OfferContent): string[] {
  const all = [c.headline, c.subhead, c.offer, c.who_for, ...c.faqs.flatMap((f) => [f.q, f.a])];
  const out: string[] = [];
  if (all.some((t) => t.includes("[add:"))) out.push("Fill in or remove every [add: your detail] marker.");
  if (!c.headline || !c.offer) out.push("Add a headline and what you are offering.");
  if (!c.contact) out.push("Add where people should reach you: an email address or an https link.");
  if (looksPhishy(...all)) out.push("Remove wording about logins, passwords, card numbers or verification.");
  return out;
}

export function slugFor(headline: string, rand: () => string = () => Math.random().toString(36).slice(2, 8)): string {
  const base = headline.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  return `${base || "offer"}-${rand()}`;
}

export function buildDraftPrompt(i: { name: string; what: string; customer: string; quote: string; notes: string }): string {
  return `You help a solo founder write a short offer page from what a real customer said. Use ONLY the facts below. Do not invent features, prices, results, guarantees, customers, numbers or the founder's experience. Where a detail is needed that is not below, leave it out.
PRODUCT: ${i.name}
WHAT IT DOES: ${i.what}
WHO IT IS FOR: ${i.customer}
WHAT A CUSTOMER SAID (exact words): "${i.quote}"
Pick cta_kind: "pilot" only if the product can be delivered by the founder today, otherwise "demo" (or "waitlist" if there is nothing to show yet).
No links, emails or phone numbers. No words about logins, passwords or payments.
Return JSON only: {"headline":"about the customer's problem","subhead":"one line","offer":"what the founder offers, 2 sentences","who_for":"one line","faqs":[{"q":"...","a":"..."}],"cta_kind":"demo|pilot|waitlist"}`;
}
