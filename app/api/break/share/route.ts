/**
 * POST /api/break/share  { result, idea }  -> { url, imageUrl, token }
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

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const token = new URL(request.url).searchParams.get("token") ?? "";
  await supabase.from("break_shares").update({ revoked_at: new Date().toISOString() }).eq("token", token).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
