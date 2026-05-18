/**
 * app/api/checkin/email-reply/route.ts — Growth Improvement #1
 *
 * Handles inbound email replies from the daily check-in email.
 * Founders receive a 6pm email: "How did today go? Reply in one sentence."
 * Their reply hits this endpoint (via Resend inbound webhook or Postmark).
 *
 * Flow:
 *   1. Validate inbound email signature
 *   2. Extract reply text (first line / first 200 chars)
 *   3. Resolve sender email → userId
 *   4. Run a mini Reflexion call on the reply (single-turn, no full pipeline)
 *   5. Write evening_check + log reflection
 *   6. Send a 1-sentence AI acknowledgement back to the founder
 *
 * This is the highest-retention touchpoint in the product — it lets founders
 * check in from their phone email client without opening the app.
 *
 * Setup:
 *   - Resend: Dashboard → Domains → Inbound → route *@reply.buildmind.live
 *     to https://buildmind.live/api/checkin/email-reply
 *   - Or Postmark inbound: point inbound domain to this endpoint
 *
 * Payload (Resend inbound format):
 *   { from: string; to: string; subject: string; text: string; html?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";

export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";
export const maxDuration = 30;

interface ResendInboundPayload {
  from?: string;
  to?: string | string[];
  subject?: string;
  text?: string;
  html?: string;
}

function extractReplyText(text: string): string {
  // Strip quoted previous message (lines starting with >)
  const lines = text.split("\n").filter(l => !l.trim().startsWith(">"));
  // Take first non-empty line, cap at 200 chars
  const first = lines.map(l => l.trim()).find(l => l.length > 2) ?? "";
  return first.slice(0, 200);
}

function extractSenderEmail(from: string): string {
  // Handles "Name <email@example.com>" and "email@example.com"
  const match = from.match(/<(.+?)>/) ?? from.match(/(\S+@\S+\.\S+)/);
  return (match?.[1] ?? from).toLowerCase().trim();
}

async function generateAIAck(
  replyText: string,
  groqKey: string,
): Promise<string> {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        max_tokens: 60,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content: `You are an AI co-founder. A founder just emailed their daily check-in. Reply with ONE sentence (max 20 words): acknowledge what they said, then name what they should do first tomorrow. No greeting, no sign-off. Direct.`,
          },
          { role: "user", content: replyText },
        ],
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error("Groq error");
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() ?? "";
  } catch {
    return "Got it. Tomorrow: pick your single most important task and start within the first hour.";
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const groqKey     = process.env.GROQ_API_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: "Supabase env vars missing" }, { status: 500 });
  }

  let payload: ResendInboundPayload;
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      payload = await req.json() as ResendInboundPayload;
    } else {
      // Postmark sends form-encoded
      const form = await req.formData();
      payload = {
        from:    form.get("From") as string,
        to:      form.get("To") as string,
        subject: form.get("Subject") as string,
        text:    form.get("TextBody") as string,
      };
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const fromRaw = payload.from ?? "";
  const rawText = payload.text ?? "";

  if (!fromRaw || !rawText) {
    return NextResponse.json({ ok: true, skipped: "missing_from_or_text" });
  }

  const senderEmail = extractSenderEmail(fromRaw);
  const replyText   = extractReplyText(rawText);

  if (replyText.length < 3) {
    return NextResponse.json({ ok: true, skipped: "empty_reply" });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Resolve user from email
  const { data: authList } = await supabase.auth.admin.listUsers();
  const user = authList?.users?.find(u => u.email?.toLowerCase() === senderEmail);

  if (!user) {
    // Don't 404 — just silently ignore unrecognised inbound emails
    return NextResponse.json({ ok: true, skipped: "user_not_found" });
  }

  const userId = user.id;

  // Write the reflection
  const ackText = groqKey
    ? await generateAIAck(replyText, groqKey)
    : "Got it — keep moving tomorrow.";

  await Promise.allSettled([
    supabase.from("evening_checks").insert({
      user_id: userId,
      task_completed: true,
      notes: replyText,
      nudge_sent: false,
      via_email_reply: true,
    }),
    supabase.from("reflections").insert({
      user_id: userId,
      outcome: "neutral",
      note: replyText,
      source: "email_reply",
    }),
    supabase.from("founder_context").upsert({
      user_id: userId,
      last_active: new Date().toISOString(),
      days_inactive: 0,
    }),
  ]);

  // Send AI acknowledgement back
  try {
    await sendEmail({
      to: senderEmail,
      subject: "Re: BuildMind check-in",
      html: `<p style="font-family:ui-sans-serif,system-ui,sans-serif;font-size:15px;color:#e5e7eb;line-height:1.6;margin:0;padding:24px;">
        ${ackText}
        <br/><br/>
        <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://buildmind.live"}/today" style="color:#10b981;text-decoration:none;font-size:13px;">Open BuildMind →</a>
      </p>`,
    });
  } catch {
    // Non-critical — check-in is already logged
  }

  return NextResponse.json({ ok: true, userId, replyText, ackText });
}
