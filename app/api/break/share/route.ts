/**
 * POST /api/break/share  { result, idea }  -> { url, imageUrl, token }
 * GET    /api/break/share?token=…          -> { opened, yes, partly, no, notes } (owner only)
 * DELETE /api/break/share?token=…          -> revoke
 * Auth required. Only a sanitised summary is stored (lib/breakShare.ts).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildSharePayload } from "@/lib/breakShare";

export const runtime = "nodejs";
const base = () => process.env.NEXT_PUBLIC_APP_URL ?? "https://buildmind.live";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body?.result || typeof body.result !== "object") return NextResponse.json({ error: "Missing result" }, { status: 400 });
  const payload = buildSharePayload(body.result, String(body.idea ?? ""));
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  const admin = createAdminClient();
  const { error } = await admin.from("break_shares").insert({ token, user_id: user.id, payload });
  if (error) return NextResponse.json({ error: "Could not create share link" }, { status: 500 });
  return NextResponse.json({ token, url: `${base()}/break/share/${token}`, imageUrl: `${base()}/api/card/break?token=${token}` });
}

/** GET ?token=… -> how many people opened the link and what they answered. Owner only. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const token = (new URL(request.url).searchParams.get("token") ?? "").replace(/[^a-f0-9]/gi, "").slice(0, 32);
  const admin = createAdminClient();
  const { data: share } = await admin.from("break_shares").select("user_id, revoked_at").eq("token", token).maybeSingle();
  if (!share || share.user_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data, error } = await admin.from("break_share_events").select("answer, note, answered_at").eq("token", token).order("opened_at", { ascending: false }).limit(500);
  if (error) return NextResponse.json({ opened: 0, yes: 0, partly: 0, no: 0, notes: [], setup: true });
  const rows = data ?? [];
  const count = (a: string) => rows.filter((r) => r.answer === a).length;
  const notes = rows.filter((r) => r.note).slice(0, 5).map((r) => ({ answer: r.answer as string, note: r.note as string }));
  return NextResponse.json({ opened: rows.length, yes: count("yes"), partly: count("partly"), no: count("no"), notes });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const token = new URL(request.url).searchParams.get("token") ?? "";
  await supabase.from("break_shares").update({ revoked_at: new Date().toISOString() }).eq("token", token).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
