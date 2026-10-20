/** GET /api/radar/feed/<token> — the calendar feed. The token is the credential, so it is long, random and read-only. */
import { NextResponse } from "next/server";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildFeedIcs } from "@/lib/radar/nextMove";
import type { RadarItem } from "@/lib/radar/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> | { token: string } }) {
  const { token } = await ctx.params;
  if (!/^[a-f0-9]{48}$/.test(token ?? "") || !hasAdminEnv()) return new NextResponse("Not found", { status: 404 });
  const admin = createAdminClient();
  const { data: feed } = await admin.from("radar_feeds").select("user_id").eq("token", token).maybeSingle();
  if (!feed) return new NextResponse("Not found", { status: 404 });
  const { data } = await admin.from("radar_items").select("*").eq("user_id", (feed as { user_id: string }).user_id).limit(300);
  const items = ((data ?? []) as RadarItem[]).filter((i) => i.status !== "dismissed" && i.status !== "done");
  return new NextResponse(buildFeedIcs(items), { status: 200, headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" } });
}
