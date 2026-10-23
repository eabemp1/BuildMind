/**
 * lib/signalLinks.ts - signals BuildMind observes itself, with no integration to set up.
 *
 *  - Tracked link  /r/<code>  : redirects to the founder's page and counts UNIQUE visitors.
 *  - Hosted page   /i/<code>  : a small public interest page; counts UNIQUE signup emails.
 *
 * What stops fake numbers: BuildMind does the counting, the founder's own visits and known bots are
 * ignored, one visitor or one email counts once, and the visitor is stored only as a salted hash.
 * What it cannot stop: a determined person recruiting friends or using many emails. That costs real
 * effort, and a small count is not a success anyway (see the visit threshold in lib/outcomeSignal.ts).
 */

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ObservedSignal } from "@/lib/signalResolve";
import { countSignups, MAX_ATTEMPTS_PER_VISITOR } from "@/lib/signupGuard";

export type ClaimKind = "reply" | "conversation" | "call";
export const CLAIM_KINDS: ClaimKind[] = ["reply", "conversation", "call"];

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function makeCode(len = 8): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function isValidCode(code: unknown): code is string {
  return typeof code === "string" && /^[a-z2-9]{6,12}$/.test(code);
}

const BOT_RE = /bot|crawl|spider|slurp|preview|fetch|monitor|headless|python-requests|curl|wget|httpclient|go-http|axios|node-fetch|facebookexternalhit|whatsapp\/|telegrambot|discordbot|slackbot|linkedinbot|twitterbot|embedly|skypeuri|bingpreview|lighthouse|pingdom|uptime/i;

/** Link-preview bots and scripts must not count as visitors. Empty user agents are treated as bots. */
export function isBotUserAgent(ua: string | null | undefined): boolean {
  const s = String(ua ?? "").trim();
  return s.length < 10 || BOT_RE.test(s);
}

export function visitorHash(ip: string, ua: string, code: string, salt = process.env.SIGNAL_SALT || process.env.CRON_SECRET || "buildmind"): string {
  return createHash("sha256").update(`${salt}|${code}|${ip}|${ua}`).digest("hex").slice(0, 32);
}

function privateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.includes(":") || !h.includes(".")) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return false;
}

/** A tracked link may only point at a public https page. BuildMind's own pages are fine (founders promote BuildMind itself), except its tracking and API paths, which would loop or act. */
export function validateTarget(raw: unknown): { ok: true; url: string } | { ok: false; reason: string } {
  const text = typeof raw === "string" ? raw.trim() : "";
  let u: URL;
  try { u = new URL(text); } catch { return { ok: false, reason: "That is not a valid link." }; }
  if (u.protocol !== "https:") return { ok: false, reason: "Use an https link." };
  if (u.username || u.password) return { ok: false, reason: "Remove the login details from that link." };
  if (privateHost(u.hostname)) return { ok: false, reason: "That link is not a public page." };
  if (/(^|\.)buildmind\.live$/i.test(u.hostname) && /^\/(r|v|i|api)(\/|$)/i.test(u.pathname)) return { ok: false, reason: "That BuildMind address is a tracking or system link. Link to a page like your homepage instead." };
  if (text.length > 2000) return { ok: false, reason: "That link is too long." };
  return { ok: true, url: u.toString() };
}

export function validEmail(raw: unknown): string | null {
  const e = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (e.length < 5 || e.length > 200) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}

export interface SignalLink {
  id: string;
  user_id: string;
  code: string;
  kind: "link" | "interest" | "confirm" | "inbound";
  source?: string | null;
  claim_kind?: ClaimKind | null;
  target_url: string | null;
  headline: string | null;
  pitch: string | null;
  label: string | null;
}

/** Records one unique visit. Never throws. Returns whether it was newly counted. */
export async function recordVisit(admin: SupabaseClient, link: SignalLink, opts: { ip: string; ua: string; viewerUserId?: string | null }): Promise<boolean> {
  try {
    if (isBotUserAgent(opts.ua)) return false;
    if (opts.viewerUserId && opts.viewerUserId === link.user_id) return false; // the founder checking their own link
    const { error } = await admin.from("signal_events").insert({
      link_id: link.id, user_id: link.user_id, event: "visit", visitor_hash: visitorHash(opts.ip, opts.ua, link.code),
    });
    return !error;
  } catch {
    return false;
  }
}

export function newToken(): string { return randomBytes(16).toString("hex"); }

/** Starts one signup: stored unconfirmed, and it counts only after the person clicks the emailed link. */
export async function recordSignup(admin: SupabaseClient, link: SignalLink, email: string, opts: { visitor: string; token: string }): Promise<"ok" | "duplicate" | "too_many" | "error"> {
  try {
    const { count } = await admin.from("signal_events").select("id", { count: "exact", head: true })
      .eq("link_id", link.id).eq("event", "signup").eq("visitor_hash", opts.visitor);
    if ((count ?? 0) >= MAX_ATTEMPTS_PER_VISITOR) return "too_many";
    const { error } = await admin.from("signal_events").insert({
      link_id: link.id, user_id: link.user_id, event: "signup", email, visitor_hash: opts.visitor, confirm_token: opts.token,
    });
    if (!error) return "ok";
    return (error as { code?: string }).code === "23505" ? "duplicate" : "error";
  } catch {
    return "error";
  }
}

/** Marks a signup confirmed. Returns whether this call confirmed it (a second click is "already"). */
export async function confirmSignup(admin: SupabaseClient, token: string): Promise<"confirmed" | "already" | "unknown"> {
  try {
    if (!/^[a-f0-9]{32}$/.test(token)) return "unknown";
    const { data } = await admin.from("signal_events").select("id, confirmed_at").eq("confirm_token", token).eq("event", "signup").maybeSingle();
    if (!data) return "unknown";
    if (data.confirmed_at) return "already";
    const { error } = await admin.from("signal_events").update({ confirmed_at: new Date().toISOString() }).eq("id", data.id).is("confirmed_at", null);
    return error ? "unknown" : "confirmed";
  } catch {
    return "unknown";
  }
}

/** One person confirms, on their own device, what the founder claims about them. */
export async function recordConfirm(admin: SupabaseClient, link: SignalLink, opts: { ip: string; ua: string; viewerUserId?: string | null }): Promise<"ok" | "owner" | "bot" | "error"> {
  try {
    if (isBotUserAgent(opts.ua)) return "bot";
    if (opts.viewerUserId && opts.viewerUserId === link.user_id) return "owner"; // the founder cannot confirm themselves
    const { error } = await admin.from("signal_events").insert({
      link_id: link.id, user_id: link.user_id, event: "confirm", visitor_hash: visitorHash(opts.ip, opts.ua, link.code), confirmed_at: new Date().toISOString(),
    });
    // A second device after the first still means the same one person: it is not an error, it just adds nothing.
    return !error || (error as { code?: string }).code === "23505" ? "ok" : "error";
  } catch {
    return "error";
  }
}

/** What the founder's links and pages observed since a moment. Never throws. */
export async function observedSince(admin: SupabaseClient, userId: string, sinceIso: string): Promise<ObservedSignal[]> {
  const out: ObservedSignal[] = [];
  try {
    const { count: visits, error: vErr } = await admin
      .from("signal_events").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("event", "visit").gte("created_at", sinceIso);
    if (!vErr && typeof visits === "number" && visits > 0) out.push({ kind: "visit", count: Math.min(9999, visits), source: "link" });

    const { data: signups, error: sErr } = await admin
      .from("signal_events").select("visitor_hash, confirmed_at")
      .eq("user_id", userId).eq("event", "signup").not("confirmed_at", "is", null).gte("confirmed_at", sinceIso).limit(2000);
    if (!sErr) {
      const n = countSignups((signups ?? []) as Array<{ visitor_hash: string | null; confirmed_at: string | null }>);
      if (n > 0) out.push({ kind: "signup", count: n, source: "page" });
    }

    // Replies that arrived at the founder's reply-to address from authenticated senders (burst-capped).
    const { data: replies, error: rErr } = await admin
      .from("signal_events").select("confirmed_at")
      .eq("user_id", userId).eq("event", "reply").not("confirmed_at", "is", null).gte("confirmed_at", sinceIso).limit(2000);
    if (!rErr) {
      const n = countSignups(((replies ?? []) as Array<{ confirmed_at: string | null }>).map((r) => ({ visitor_hash: null, confirmed_at: r.confirmed_at })));
      if (n > 0) out.push({ kind: "reply", count: n, source: "inbox", trust: "proof" });
    }

    // Confirmations: one per link (a link is one person), grouped by what was claimed.
    const { data: confirms, error: cErr } = await admin
      .from("signal_events").select("link_id").eq("user_id", userId).eq("event", "confirm").gte("created_at", sinceIso).limit(500);
    if (!cErr && confirms?.length) {
      const ids = [...new Set((confirms as Array<{ link_id: string }>).map((c) => c.link_id))];
      const { data: links } = await admin.from("signal_links").select("id, claim_kind").in("id", ids).eq("kind", "confirm");
      const per = new Map<ClaimKind, number>();
      for (const l of (links ?? []) as Array<{ id: string; claim_kind: ClaimKind | null }>) {
        if (l.claim_kind && CLAIM_KINDS.includes(l.claim_kind)) per.set(l.claim_kind, (per.get(l.claim_kind) ?? 0) + 1);
      }
      for (const [kind, count] of per) out.push({ kind, count, source: "confirm", trust: "proof" });
    }
  } catch { /* nothing observed */ }
  return out;
}
