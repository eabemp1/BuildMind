/**
 * POST /api/radar/discover { projectId?, where? } — the manual "Find opportunities for me" button.
 * The search itself lives in lib/radar/discoverRun.ts, shared with the automatic twice-weekly run.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { gateAIUsage } from "@/app/api/ai/_usageGate";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimitAsync } from "@/lib/server/rateLimit";
import { runDiscovery } from "@/lib/radar/discoverRun";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ projectId: z.string().uuid().nullable().optional(), where: z.string().max(80).optional() });

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, error: "Not available." }, { status: 503 });
  const rl = await rateLimitAsync(`radar-discover:${user.userId}`, 4, 24 * 60 * 60 * 1000, { failClosed: true });
  if (!rl.ok) return NextResponse.json({ ok: false, error: "You have searched enough for today. Try again tomorrow." }, { status: 429 });
  const blocked = await gateAIUsage(user.userId, "general");
  if (blocked) return blocked;

  const admin = createAdminClient();
  const r = await runDiscovery(admin, { userId: user.userId, projectId: parsed.data.projectId ?? null, where: parsed.data.where ?? "" });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error, ...(r.reason ? { reason: r.reason } : {}) }, { status: r.status });
  // Remember where the founder is so the automatic search uses it too. Best effort.
  if (typeof parsed.data.where === "string") {
    try { await admin.from("radar_settings").upsert({ user_id: user.userId, where_text: parsed.data.where.trim(), updated_at: new Date().toISOString() }, { onConflict: "user_id" }); } catch { /* optional */ }
  }
  return NextResponse.json({ ok: true, added: r.added, stats: r.stats, queries: r.queries });
}
