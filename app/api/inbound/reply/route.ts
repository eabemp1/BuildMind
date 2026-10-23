/**
 * POST /api/inbound/reply - webhook for the inbound email provider (see docs/inbound-email.md).
 * Header x-inbound-secret must equal INBOUND_EMAIL_SECRET. Always answers 200 for messages it declines so
 * the provider does not retry them. A counted reply is stored and a copy is forwarded to the founder.
 */
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { evaluateInbound } from "@/lib/inboundReply";

export const runtime = "nodejs";

const Body = z.object({
  to: z.union([z.string(), z.array(z.string())]).optional(),
  from: z.string().max(500).optional(),
  subject: z.string().max(500).optional(),
  text: z.string().max(20000).optional(),
  spf: z.string().max(40).optional(),
  dkim: z.string().max(40).optional(),
});

function same(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

export async function POST(req: Request) {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "Inbound email is not set up." }, { status: 503 });
  if (!same(req.headers.get("x-inbound-secret") ?? "", secret)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: true, counted: false, reason: "unreadable" });
  const p = parsed.data;

  const admin = createAdminClient();
  const pre = evaluateInbound({ ...p, spf: "pass" }, null); // finds the code first; real checks follow with the owner known
  if (!pre.ok) return NextResponse.json({ ok: true, counted: false, reason: pre.reason });
  const { data: link } = await admin.from("signal_links").select("id, user_id, code").eq("code", pre.code).eq("kind", "inbound").maybeSingle();
  if (!link) return NextResponse.json({ ok: true, counted: false, reason: "unknown address" });
  let ownerEmail: string | null = null;
  try { ownerEmail = (await admin.auth.admin.getUserById(link.user_id as string)).data.user?.email ?? null; } catch { /* checked without it */ }
  const v = evaluateInbound(p, ownerEmail);
  if (!v.ok) return NextResponse.json({ ok: true, counted: false, reason: v.reason });

  const { error } = await admin.from("signal_events").insert({
    link_id: link.id, user_id: link.user_id, event: "reply", email: v.sender, confirmed_at: new Date().toISOString(),
  });
  const duplicate = (error as { code?: string } | null)?.code === "23505";
  if (error && !duplicate) return NextResponse.json({ ok: false, error: "Could not save." }, { status: 500 });

  // Forward a copy so the founder can answer it. Best effort; a failure never loses the counted reply.
  if (!duplicate && ownerEmail) {
    const text = String(p.text ?? "").slice(0, 6000);
    await sendEmail({
      to: ownerEmail,
      subject: `Reply from ${v.sender}: ${String(p.subject ?? "").slice(0, 120)}`,
      text: `${v.sender} replied through your BuildMind address.\n\n${text}`,
      html: `<p style="font-family:system-ui,sans-serif;font-size:14px"><strong>${esc(v.sender)}</strong> replied through your BuildMind address.</p><pre style="font-family:system-ui,sans-serif;font-size:14px;white-space:pre-wrap">${esc(text)}</pre>`,
    }).catch(() => undefined);
  }
  return NextResponse.json({ ok: true, counted: !duplicate });
}
