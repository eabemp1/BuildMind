/**
 * lib/leads/rank.ts: every claim on a lead card is checked against the source it cites before the card is shown, then
 * leads are ranked by evidence of fit. Pure. The model proposes; this decides what survives and in what order.
 *   name      must appear in the cited source, or the lead is dropped (no "Bel Road Run Club" for "BEL Bullets Run Club")
 *   evidence  the quote must be on the page, or the lead is dropped
 *   contact   an email, phone or contact page counts only if it is printed in the source; otherwise "no verified contact"
 *   tier      ready (proof it fits + a way to reach someone), no_contact (fits, nobody to write to yet), referral (directories,
 *             lists, general discussion: ask them for introductions, not counted as leads)
 *   message   must mention the lead's own named program or the lead's name, else it ranks lower
 */
import type { Lead } from "@/lib/leads/validate";

export interface Source { url: string; title?: string; text: string }

export const norm = (v: string) => v.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return u.toLowerCase(); } };
const key = (u: string) => { try { const x = new URL(u); return `${x.hostname.replace(/^www\./, "")}${x.pathname.replace(/\/$/, "")}`.toLowerCase(); } catch { return u.toLowerCase(); } };

/** The sources the lead cites: same page, ignoring www and a trailing slash. */
export function sourcesFor(url: string, all: Source[]): Source[] {
  const k = key(url);
  return all.filter((s) => key(s.url) === k);
}

const textOf = (srcs: Source[]) => srcs.map((s) => `${s.title ?? ""} ${s.text}`).join(" \n ");

/** The name as written must be in the source. */
export function nameInSource(name: string, srcs: Source[]): boolean {
  const n = norm(name);
  return n.length >= 3 && norm(textOf(srcs)).includes(n);
}

/** A quote counts as on the page when most of its distinctive words are there, in a page that is long enough to hold it. */
export function quoteInSource(quote: string, srcs: Source[]): boolean {
  const q = quote.replace(/\.\.\.|…/g, " ");
  if (q.trim().length < 20) return false;
  const words = [...new Set(norm(q).split(" ").filter((w) => w.length >= 4))];
  if (words.length < 3) return false;
  const hay = new Set(norm(textOf(srcs)).split(" "));
  const hit = words.filter((w) => hay.has(w)).length;
  return hit / words.length >= 0.75;
}

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const SOCIAL = /(^|\.)(facebook|instagram|t\.me|telegram|wa\.me|whatsapp|linkedin|x|twitter|youtube|chat\.whatsapp)\./i;
export const isSocialPage = (url: string) => SOCIAL.test(`${host(url)}.`) || /^(t\.me|wa\.me)$/.test(host(url));

/** Emails printed in the text (also the obfuscated "name [at] site dot com" form is not trusted). */
export function emailsIn(text: string): string[] {
  return [...new Set((text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []).map((e) => e.toLowerCase()))];
}

/**
 * The contact the model claimed, kept only if the source prints it. `sameSite` are other pages of the same website,
 * where a contact page often lives. Anything else becomes "none".
 */
export function verifyContact(claimed: { kind: string; value: string } | undefined, lead: { url: string }, srcs: Source[], sameSite: Source[] = []): NonNullable<Lead["contact"]> {
  const pageText = textOf(srcs);
  const siteText = `${pageText} ${textOf(sameSite)}`;
  const v = (claimed?.value ?? "").trim();
  if (claimed?.kind === "email" && EMAIL_RE.test(v) && emailsIn(siteText).includes(v.toLowerCase())) return { kind: "email", value: v.toLowerCase() };
  if (claimed?.kind === "phone") {
    const digits = v.replace(/\D/g, "");
    const hay = siteText.replace(/\D+/g, " ");
    if (digits.length >= 8 && siteText.replace(/[^\d+]/g, "").includes(digits.slice(-9))) return { kind: "phone", value: v };
    if (digits.length >= 8 && hay.replace(/\s/g, "").includes(digits)) return { kind: "phone", value: v };
  }
  if (claimed?.kind === "form" && /^https?:\/\//i.test(v) && siteText.includes(v.replace(/\/$/, ""))) return { kind: "form", value: v };
  // A public social page can be messaged directly; that is real, but weaker than an email.
  if (isSocialPage(lead.url)) return { kind: "page_message", value: lead.url };
  // The page itself prints an email the model forgot to mention: use it.
  const found = emailsIn(pageText).find((e) => !/^(noreply|no-reply|donotreply)@/.test(e));
  if (found) return { kind: "email", value: found };
  return { kind: "none", value: "" };
}

/** How to reach them, said only from what was verified. Never sends the founder off to search elsewhere. */
export function reachLine(c: NonNullable<Lead["contact"]>): string {
  switch (c.kind) {
    case "email": return `Email ${c.value}. It is printed on the source page.`;
    case "phone": return `Call or message ${c.value}. It is printed on the source page.`;
    case "form": return `Use their contact page: ${c.value}`;
    case "page_message": return "Message this public page directly. No email or phone is printed on it.";
    default: return "No verified contact found. The source page does not print an email, phone number or contact page.";
  }
}

const DIRECTORY = /\b(directory|directories|listings?|guide to|round-?up|list of|best \d+|top \d+|forums?|subreddit|discussion|things to do|aggregator)\b/i;

/** True for pages that list or discuss many groups, not a group that can be asked directly. */
export function looksLikeReferral(l: Pick<Lead, "name" | "url" | "kind" | "role">): boolean {
  return l.role === "referral" || l.kind === "listing" || DIRECTORY.test(`${l.name} ${l.url}`);
}

/** The message must be about this lead: its own named program, or its name. Pure. */
export function messageIsSpecific(l: Pick<Lead, "first_message" | "name" | "hook">): boolean {
  const m = norm(l.first_message);
  if (l.hook && l.hook.length >= 3 && m.includes(norm(l.hook))) return true;
  const first = norm(l.name).split(" ").filter((w) => w.length >= 4);
  return first.length > 0 && first.every((w) => m.includes(w));
}

export interface RefineStats { droppedName: number; droppedEvidence: number }

export function scoreLead(l: Lead, msgOk: boolean): number {
  const tierPts = l.tier === "ready" ? 4 : l.tier === "no_contact" ? 1 : -5;
  const contactPts = l.contact?.kind === "email" || l.contact?.kind === "phone" ? 2 : l.contact?.kind === "form" ? 1.5 : l.contact?.kind === "page_message" ? 1 : 0;
  return tierPts + contactPts + (l.fit_proof ? 3 : 0) + (l.distinct_reason ? 2 : 0) + (l.hook ? 1 : 0) + (msgOk ? 1 : 0);
}

/**
 * Check, tier and rank. `all` is everything the search read (pages and snippets). Returns the leads that survived,
 * best first, and how many were dropped for a name or quote the source does not contain.
 */
export function refineLeads(leads: Lead[], all: Source[]): { leads: Lead[]; stats: RefineStats } {
  const stats: RefineStats = { droppedName: 0, droppedEvidence: 0 };
  const out: Lead[] = [];
  for (const raw of leads) {
    const srcs = sourcesFor(raw.url, all);
    if (!srcs.length) { stats.droppedName++; continue; }
    if (!nameInSource(raw.name, srcs)) { stats.droppedName++; continue; }
    if (!quoteInSource(raw.evidence, srcs)) { stats.droppedEvidence++; continue; }
    const sameSite = all.filter((s) => host(s.url) === host(raw.url) && key(s.url) !== key(raw.url));
    const contact = verifyContact(raw.claimed_contact, raw, srcs, sameSite);
    const fitOk = Boolean(raw.fit_proof) && quoteInSource(raw.fit_proof!, srcs);
    const referral = looksLikeReferral(raw) || !fitOk;
    const tier: NonNullable<Lead["tier"]> = referral ? "referral" : contact.kind === "none" ? "no_contact" : "ready";
    const { claimed_contact: _c, ...rest } = raw; // eslint-disable-line @typescript-eslint/no-unused-vars
    const lead: Lead = {
      ...rest,
      fit_proof: fitOk ? raw.fit_proof : "",
      hook: raw.hook && norm(textOf(srcs)).includes(norm(raw.hook)) ? raw.hook : "",
      tier, contact,
      how_to_reach: reachLine(contact),
    };
    lead.score = scoreLead(lead, messageIsSpecific(lead));
    out.push(lead);
  }
  out.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return { leads: out, stats };
}

/** Leads that count as direct leads: they fit, and are not referral sources. */
export const directLeads = (leads: Array<Pick<Lead, "tier">>) => leads.filter((l) => l.tier !== "referral");
