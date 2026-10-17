/**
 * GET /api/cron/maintain-founder-memory — daily automatic classification of
 * founder_memory zones/strengths (replaces pressing the admin buttons).
 * Idempotent; only rows behind the current classifier version or older than a
 * week are rebuilt, so a normal day touches very few rows.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { reclassifyAll, cleanZoneArray, CLASSIFIER_VERSION } from "@/lib/server/founderMemoryMaintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isCron(request: Request): boolean {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const given = request.headers.get("x-cron-secret") ?? bearer;
  return Boolean(process.env.CRON_SECRET && given === process.env.CRON_SECRET);
}

export async function GET(request: Request) {
  if (!isCron(request) && process.env.NODE_ENV === "production") return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, error: "Supabase admin env is missing." }, { status: 500 });

  const admin = createAdminClient();
  const started = Date.now();
  const memory = await reclassifyAll(admin, { dryRun: false, onlyStale: true, limit: 400 });

  // founder_context.avoidance_zones (weekly synthesis) gets the same label clean-up.
  let contextFixed = 0;
  try {
    const { data } = await admin.from("founder_context").select("user_id, avoidance_zones").limit(1000);
    for (const row of (data ?? []) as Array<{ user_id: string; avoidance_zones: unknown }>) {
      const c = cleanZoneArray(row.avoidance_zones);
      if (!c.changed) continue;
      const { error } = await admin.from("founder_context").update({ avoidance_zones: c.after }).eq("user_id", row.user_id);
      if (!error) contextFixed++;
      if (Date.now() - started > 45_000) break;
    }
  } catch { /* founder_context optional */ }

  return NextResponse.json({
    ok: memory.ok, classifierVersion: CLASSIFIER_VERSION,
    touched: memory.ok ? memory.touched : 0, unchanged: memory.ok ? memory.skipped : 0, contextFixed,
    ...(memory.ok ? {} : { error: memory.error }),
  });
}
