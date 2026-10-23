/** GET/POST /api/radar/settings - whether Radar searches automatically, and where the founder is. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ auto: z.boolean().optional(), where: z.string().max(80).optional() });

export async function GET() {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: true, auto: true, lastRunAt: null, lastAdded: 0 });
  const { data } = await createAdminClient().from("radar_settings").select("auto_discover, where_text, last_auto_run_at, last_auto_added").eq("user_id", user.userId).maybeSingle();
  const d = data as { auto_discover: boolean; where_text: string | null; last_auto_run_at: string | null; last_auto_added: number } | null;
  return NextResponse.json({ ok: true, auto: d?.auto_discover ?? true, where: d?.where_text ?? "", lastRunAt: d?.last_auto_run_at ?? null, lastAdded: d?.last_auto_added ?? 0 });
}

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, error: "Not available." }, { status: 503 });
  const patch: Record<string, unknown> = { user_id: user.userId, updated_at: new Date().toISOString() };
  if (typeof parsed.data.auto === "boolean") patch.auto_discover = parsed.data.auto;
  if (typeof parsed.data.where === "string") patch.where_text = parsed.data.where.trim();
  const { error } = await createAdminClient().from("radar_settings").upsert(patch, { onConflict: "user_id" });
  if (error) return NextResponse.json({ ok: false, error: "Could not save. Run migration 20261023020000_radar_auto.sql." }, { status: 503 });
  return NextResponse.json({ ok: true });
}
