/**
 * lib/leads/validate.ts — the model proposes leads; this decides which survive. Pure.
 * A lead must point at a URL that was really searched or read, quote evidence, and not be generic.
 */
import { isGenericLead } from "@/lib/leads/generic";

export type LeadKind = "business" | "public_community" | "page" | "association" | "event" | "listing";
const KINDS: LeadKind[] = ["business", "public_community", "page", "association", "event", "listing"];

export interface Lead {
  name: string;
  kind: LeadKind;
  where: string;
  url: string;
  why_fit: string;
  evidence: string;
  how_to_reach: string;
  first_message: string;
  /** "unconfirmed" when nothing in the page ties the lead to the requested country or city. */
  location?: "confirmed" | "unconfirmed";
  /** Filled by lib/leads/rank.ts after every claim is checked against the source. */
  tier?: "ready" | "no_contact" | "referral";
  contact?: { kind: "email" | "phone" | "form" | "page_message" | "none"; value: string };
  /** What the model says the page shows about the group serving the customer; checked against the page. */
  fit_proof?: string;
  already_has?: string;
  distinct_reason?: string;
  hook?: string;
  role?: "direct" | "referral";
  score?: number;
  /** The model's contact claim, before it is checked. Removed by the ranker. */
  claimed_contact?: { kind: string; value: string };
}

const s = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

function normUrl(u: string): string {
  try {
    const x = new URL(u);
    return `${x.hostname.replace(/^www\./, "")}${x.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch { return u.toLowerCase(); }
}

export function validateLeads(raw: unknown, allowedUrls: string[], max = 12, allowFounderCommunities = false): Lead[] {
  const list = Array.isArray(raw) ? raw : [];
  const allowed = new Set(allowedUrls.map(normUrl));
  const seenUrl = new Set<string>();
  const seenName = new Set<string>();
  const out: Lead[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const name = s(r.name, 120);
    const url = s(r.url, 400);
    const evidence = s(r.evidence, 400);
    const message = s(r.first_message, 500);
    if (!name || !url || evidence.length < 25 || message.length < 20) continue;
    if (!allowed.has(normUrl(url))) continue; // never trust a URL the searches did not return
    if (isGenericLead(name, url, allowFounderCommunities)) continue;
    const key = normUrl(url);
    const nameKey = name.toLowerCase();
    if (seenUrl.has(key) || seenName.has(nameKey)) continue;
    seenUrl.add(key); seenName.add(nameKey);
    const kind = KINDS.includes(r.kind as LeadKind) ? (r.kind as LeadKind) : "page";
    out.push({
      name, kind, url,
      where: s(r.where, 120),
      why_fit: s(r.why_fit, 300),
      evidence,
      how_to_reach: s(r.how_to_reach, 240),
      first_message: message,
      fit_proof: s(r.fit_proof, 300),
      already_has: s(r.already_has, 200),
      distinct_reason: s(r.distinct_reason, 240),
      hook: s(r.hook, 120),
      role: r.role === "referral" ? "referral" : "direct",
      claimed_contact: r.contact && typeof r.contact === "object" ? { kind: s((r.contact as Record<string, unknown>).kind, 20), value: s((r.contact as Record<string, unknown>).value, 200) } : undefined,
    });
    if (out.length >= max) break;
  }
  return out;
}
