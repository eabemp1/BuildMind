/**
 * POST /api/signal-links/signup { code, email, website } - a public signup on a hosted interest page.
 * The signup is stored unconfirmed and counts only after the person clicks the link emailed to them.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp, rateLimitAsync } from "@/lib/server/rateLimit";
import { sendEmail } from "@/lib/email";
import { isValidCode, newToken, recordSignup, validEmail, visitorHash, type SignalLink } from "@/lib/signalLinks";
import { isDisposableEmail } from "@/lib/signupGuard";

export const runtime = "nodejs";

const Body = z.object({ code: z.string().max(20), email: z.string().max(200), website: z.string().max(200).optional() });

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export function confirmationEmail(headline: string, url: string): { subject: string; html: string; text: string } {
  const h = headline.slice(0, 120);
  return {
    subject: "Confirm your email",
    text: `You asked to join the early list for "${h}".\n\nConfirm your email: ${url}\n\nIf this was not you, ignore this message and nothing happens.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
<p style="font-size:15px;line-height:1.5">You asked to join the early list for <strong>${esc(h)}</strong>.</p>
<p style="margin:20px 0"><a href="${esc(url)}" style="background:#d9a441;color:#151109;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">Confirm my email</a></p>
<p style="font-size:12px;color:#666;line-height:1.5">If this was not you, ignore this message and nothing happens.</p></div>`,
  };
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Enter a valid email." }, { status: 400 });
  const { code, email: rawEmail, website } = parsed.data;
  // Hidden field only bots fill in: pretend it worked, count nothing.
  if (website) return NextResponse.json({ ok: true, pending: true });
  if (!isValidCode(code)) return NextResponse.json({ ok: false, error: "This page is not available." }, { status: 404 });
  const email = validEmail(rawEmail);
  if (!email) return NextResponse.json({ ok: false, error: "Enter a valid email." }, { status: 400 });
  if (isDisposableEmail(email)) return NextResponse.json({ ok: false, error: "Use a regular email address, not a temporary one." }, { status: 400 });

  const ip = getClientIp(req);
  const limit = await rateLimitAsync(`signal-signup:${ip}`, 8, 60 * 60 * 1000, { failClosed: true });
  if (!limit.ok) return NextResponse.json({ ok: false, error: "Too many attempts. Try again later." }, { status: 429 });

  const admin = createAdminClient();
  const { data: link } = await admin.from("signal_links").select("id, user_id, code, kind, target_url, headline, pitch, label").eq("code", code).eq("kind", "interest").maybeSingle();
  if (!link) return NextResponse.json({ ok: false, error: "This page is not available." }, { status: 404 });

  const ua = req.headers.get("user-agent") ?? "";
  let token = newToken();
  const r = await recordSignup(admin, link as SignalLink, email, { visitor: visitorHash(ip, ua, code), token });
  if (r === "too_many") return NextResponse.json({ ok: false, error: "Too many signups from this device." }, { status: 429 });
  if (r === "error") return NextResponse.json({ ok: false, error: "Could not save that. Try again." }, { status: 500 });
  if (r === "duplicate") {
    // Already on the list: if they never confirmed, send the same link again; otherwise there is nothing to do.
    const { data: prev } = await admin.from("signal_events").select("confirm_token, confirmed_at").eq("link_id", link.id).eq("event", "signup").eq("email", email).maybeSingle();
    if (!prev || prev.confirmed_at || !prev.confirm_token) return NextResponse.json({ ok: true, alreadyJoined: true });
    token = prev.confirm_token as string;
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const mail = confirmationEmail(String(link.headline ?? "this project"), `${base}/i/confirm/${token}`);
  const sent = await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
  if (!sent.ok && !sent.skipped) {
    return NextResponse.json({ ok: false, error: "Could not send the confirmation email. Check the address and try again." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, pending: true });
}
