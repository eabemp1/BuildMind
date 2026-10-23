/**
 * POST /api/inbound/reply - inbound reply webhook for Resend or a compatible provider.
 *
 * Resend requests are verified with the Svix signature using the raw request body.
 * The received email is then retrieved from Resend so we can use its trusted
 * SPF/DKIM results and the full plain-text message. Legacy providers may still
 * call this endpoint with x-inbound-secret and the normalized payload documented
 * in docs/inbound-email.md.
 */
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
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

const ResendEvent = z.object({
  type: z.string(),
  data: z.object({
    email_id: z.string().min(1),
    to: z.array(z.string()).optional(),
    received_for: z.array(z.string()).optional(),
  }),
});

const ReceivedEmail = z.object({
  from: z.string().optional(),
  to: z.array(z.string()).optional(),
  received_for: z.array(z.string()).optional(),
  subject: z.string().optional(),
  text: z.string().nullable().optional(),
  html: z.string().nullable().optional(),
  authentication: z.object({
    spf: z.string().optional(),
    dkim: z.string().optional(),
  }).nullable().optional(),
});

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function verifyResendSignature(req: Request, rawBody: string, secret: string): boolean {
  const id = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp");
  const signature = req.headers.get("svix-signature");
  if (!id || !timestamp || !signature) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 5 * 60) {
    return false;
  }

  const encodedSecret = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  let key: Buffer;
  try {
    key = Buffer.from(encodedSecret, "base64");
  } catch {
    return false;
  }
  if (key.length === 0) return false;

  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  return signature.split(/\s+/).some((versionedSignature) => {
    const [version, value] = versionedSignature.split(",", 2);
    return version === "v1" && !!value && same(value, expected);
  });
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

async function getResendEmail(emailId: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Resend received-email lookup failed (${response.status})`);
  return ReceivedEmail.parse(await response.json());
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const hasSvixHeaders = Boolean(
    req.headers.get("svix-id") || req.headers.get("svix-timestamp") || req.headers.get("svix-signature"),
  );

  let payload: z.infer<typeof Body>;

  if (hasSvixHeaders) {
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json({ ok: false, error: "Resend webhook is not configured." }, { status: 503 });
    }
    if (!verifyResendSignature(req, rawBody, webhookSecret)) {
      return NextResponse.json({ ok: false, error: "Invalid Resend signature." }, { status: 401 });
    }

    let event: z.infer<typeof ResendEvent>;
    try {
      event = ResendEvent.parse(JSON.parse(rawBody));
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid Resend event." }, { status: 400 });
    }

    if (event.type !== "email.received") {
      return NextResponse.json({ ok: true, ignored: event.type });
    }

    try {
      const received = await getResendEmail(event.data.email_id);
      const parsed = Body.safeParse({
        from: received.from,
        to: received.received_for?.length
          ? received.received_for
          : event.data.received_for?.length
            ? event.data.received_for
            : received.to?.length
              ? received.to
              : event.data.to,
        subject: received.subject,
        text: received.text ?? received.html ?? undefined,
        spf: received.authentication?.spf,
        dkim: received.authentication?.dkim,
      });
      if (!parsed.success) {
        return NextResponse.json({ ok: true, counted: false, reason: "unreadable" });
      }
      payload = parsed.data;
    } catch (error) {
      console.error("[inbound/reply] Could not retrieve received email:", error);
      return NextResponse.json({ ok: false, error: "Could not retrieve received email from Resend." }, { status: 502 });
    }
  } else {
    const secret = process.env.INBOUND_EMAIL_SECRET;
    if (!secret) return NextResponse.json({ ok: false, error: "Inbound email is not set up." }, { status: 503 });
    if (!same(req.headers.get("x-inbound-secret") ?? "", secret)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    const parsed = Body.safeParse(JSON.parse(rawBody));
    if (!parsed.success) return NextResponse.json({ ok: true, counted: false, reason: "unreadable" });
    payload = parsed.data;
  }

  const admin = createAdminClient();
  const pre = evaluateInbound({ ...payload, spf: "pass" }, null); // Finds the address code; real auth checks follow with the owner known.
  if (!pre.ok) return NextResponse.json({ ok: true, counted: false, reason: pre.reason });
  const { data: link } = await admin.from("signal_links").select("id, user_id, code").eq("code", pre.code).eq("kind", "inbound").maybeSingle();
  if (!link) return NextResponse.json({ ok: true, counted: false, reason: "unknown address" });
  let ownerEmail: string | null = null;
  try { ownerEmail = (await admin.auth.admin.getUserById(link.user_id as string)).data.user?.email ?? null; } catch { /* checked without it */ }
  const verdict = evaluateInbound(payload, ownerEmail);
  if (!verdict.ok) return NextResponse.json({ ok: true, counted: false, reason: verdict.reason });

  const { error } = await admin.from("signal_events").insert({
    link_id: link.id, user_id: link.user_id, event: "reply", email: verdict.sender, confirmed_at: new Date().toISOString(),
  });
  const duplicate = (error as { code?: string } | null)?.code === "23505";
  if (error && !duplicate) return NextResponse.json({ ok: false, error: "Could not save." }, { status: 500 });

  // Forward a copy so the founder can answer it. Best effort; a failure never loses the counted reply.
  if (!duplicate && ownerEmail) {
    const text = String(payload.text ?? "").slice(0, 6000);
    await sendEmail({
      to: ownerEmail,
      subject: `Reply from ${verdict.sender}: ${String(payload.subject ?? "").slice(0, 120)}`,
      text: `${verdict.sender} replied through your BuildMind address.\n\n${text}`,
      html: `<p style="font-family:system-ui,sans-serif;font-size:14px"><strong>${esc(verdict.sender)}</strong> replied through your BuildMind address.</p><pre style="font-family:system-ui,sans-serif;font-size:14px;white-space:pre-wrap">${esc(text)}</pre>`,
    }).catch(() => undefined);
  }
  return NextResponse.json({ ok: true, counted: !duplicate });
}
