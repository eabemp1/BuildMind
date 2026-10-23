/**
 * lib/inboundReply.ts - decide whether an inbound email counts as a real reply to a founder.
 *
 * The founder puts their BuildMind address (reply+<code>@their-domain) as the Reply-To on outreach. When
 * someone replies, the message reaches BuildMind from that person's own mail provider, with sender
 * checks (SPF/DKIM) done by the inbound provider. The founder cannot type a reply into existence; they
 * can still reply from another address they own, so this counts at proof level.
 * Pure. The webhook route does the I/O.
 */

import { isDisposableEmail } from "@/lib/signupGuard";

export interface InboundPayload {
  to?: string | string[];
  from?: string;
  subject?: string;
  text?: string;
  spf?: string;
  dkim?: string;
}

export type InboundVerdict = { ok: true; code: string; sender: string } | { ok: false; reason: string };

export function parseAddress(raw: string | null | undefined): string | null {
  const s = String(raw ?? "");
  const m = s.match(/<([^<>\s]+@[^<>\s]+)>/) ?? s.match(/([^\s<>,;"]+@[^\s<>,;"]+)/);
  const e = m?.[1]?.toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}

export function codeFromRecipients(to: string | string[] | undefined): string | null {
  const list = Array.isArray(to) ? to : [String(to ?? "")];
  for (const t of list) {
    const m = String(t).toLowerCase().match(/reply\+([a-z2-9]{6,12})@/);
    if (m) return m[1];
  }
  return null;
}

const AUTOMATED_SENDER = /^(mailer-daemon|postmaster|no-?reply|donotreply|do-not-reply|bounce|notifications?)@/i;
const AUTOMATED_SUBJECT = /\b(automatic reply|auto-?reply|out of office|undeliverable|delivery status|failure notice|vacation)\b/i;

export function evaluateInbound(p: InboundPayload, ownerEmail: string | null | undefined): InboundVerdict {
  const code = codeFromRecipients(p.to);
  if (!code) return { ok: false, reason: "no address code" };
  const sender = parseAddress(p.from);
  if (!sender) return { ok: false, reason: "no sender" };
  const passed = (v: unknown) => String(v ?? "").toLowerCase() === "pass";
  if (!passed(p.spf) && !passed(p.dkim)) return { ok: false, reason: "sender not authenticated" };
  if (ownerEmail && sender === ownerEmail.toLowerCase()) return { ok: false, reason: "sender is the founder" };
  if (AUTOMATED_SENDER.test(sender) || AUTOMATED_SUBJECT.test(String(p.subject ?? ""))) return { ok: false, reason: "automated message" };
  if (isDisposableEmail(sender)) return { ok: false, reason: "throwaway sender" };
  return { ok: true, code, sender };
}
