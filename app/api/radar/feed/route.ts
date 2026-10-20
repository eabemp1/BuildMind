/** POST /api/radar/feed — get (or create) the founder's private calendar feed URL. Subscribe once in Google, Apple or Outlook calendar. */
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, error: "Not available." }, { status: 503 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("radar_feeds").select("token").eq("user_id", user.userId).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "Radar is not set up yet. Run the latest database migrations.", reason: "setup" }, { status: 503 });
  let token = (data as { token?: string } | null)?.token;
  if (!token) {
    token = randomBytes(24).toString("hex");
    const ins = await admin.from("radar_feeds").insert({ user_id: user.userId, token });
    if (ins.error) return NextResponse.json({ ok: false, error: "Could not create the feed." }, { status: 500 });
  }
  const origin = new URL(request.url).origin;
  const url = `${origin}/api/radar/feed/${token}`;
  return NextResponse.json({ ok: true, url, webcal: url.replace(/^https?:/, "webcal:") });
}
