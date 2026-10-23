/** GET /api/signal-links/signups?code=<code> - the emails collected by one of the signed-in founder's hosted pages. */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidCode } from "@/lib/signalLinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const code = new URL(req.url).searchParams.get("code");
  if (!isValidCode(code)) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const admin = createAdminClient();
  const { data: link } = await admin.from("signal_links").select("id").eq("code", code).eq("user_id", user.id).eq("kind", "interest").maybeSingle();
  if (!link) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const { data } = await admin.from("signal_events").select("email, created_at, confirmed_at").eq("link_id", link.id).eq("event", "signup").not("confirmed_at", "is", null).order("created_at", { ascending: false }).limit(500);
  return NextResponse.json({ ok: true, signups: data ?? [] });
}
