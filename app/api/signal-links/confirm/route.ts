/**
 * POST /api/signal-links/confirm
 *   { token }  -> confirms an emailed signup (button press on /i/confirm/<token>)
 *   { code }   -> a person confirms a reply / conversation / call on /v/<code>
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getClientIp, rateLimitAsync } from "@/lib/server/rateLimit";
import { confirmSignup, isValidCode, recordConfirm, type SignalLink } from "@/lib/signalLinks";

export const runtime = "nodejs";

const Body = z.union([z.object({ token: z.string().max(64) }), z.object({ code: z.string().max(20) })]);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  const ip = getClientIp(req);
  const limit = await rateLimitAsync(`signal-confirm:${ip}`, 20, 60 * 60 * 1000, { failClosed: true });
  if (!limit.ok) return NextResponse.json({ ok: false, error: "Too many attempts. Try again later." }, { status: 429 });
  const admin = createAdminClient();

  if ("token" in parsed.data) {
    const r = await confirmSignup(admin, parsed.data.token);
    return r === "unknown" ? NextResponse.json({ ok: false, error: "Not found." }, { status: 404 }) : NextResponse.json({ ok: true, already: r === "already" });
  }

  const code = parsed.data.code;
  if (!isValidCode(code)) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const { data: link } = await admin.from("signal_links").select("id, user_id, code, kind, claim_kind, label").eq("code", code).eq("kind", "confirm").maybeSingle();
  if (!link) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  let viewerUserId: string | null = null;
  try { viewerUserId = (await (await createClient()).auth.getUser()).data.user?.id ?? null; } catch { /* anonymous */ }
  const r = await recordConfirm(admin, link as SignalLink, { ip, ua: req.headers.get("user-agent") ?? "", viewerUserId });
  if (r === "owner") return NextResponse.json({ ok: false, error: "Send this link to the other person. You cannot confirm it yourself." }, { status: 403 });
  if (r === "bot" || r === "error") return NextResponse.json({ ok: false, error: "Could not record that." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
