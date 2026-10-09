/**
 * POST /api/avoidance/resolve  { zone }
 * The founder marks an avoided area as faced. The zone leaves
 * founder_memory.avoidance_zones and is recorded in avoidance_resolved with
 * a timestamp, which Avoidance Resistance reads for the current week.
 * Requires supabase/migrations/20261009000000_avoidance_resolved.sql.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { zone?: string };
  const zone = typeof body.zone === "string" ? body.zone.trim().slice(0, 80) : "";
  if (!zone) return NextResponse.json({ ok: false, error: "zone required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: row, error: readErr } = await admin
    .from("founder_memory")
    .select("avoidance_zones, avoidance_resolved")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ ok: false, error: "Couldn't save. Try again." }, { status: 500 });

  const zones: string[] = Array.isArray(row?.avoidance_zones) ? row!.avoidance_zones : [];
  if (!zones.includes(zone)) return NextResponse.json({ ok: false, error: "That area isn't on your list." }, { status: 404 });
  const resolved = Array.isArray(row?.avoidance_resolved) ? row!.avoidance_resolved : [];

  const { error: writeErr } = await admin
    .from("founder_memory")
    .update({
      avoidance_zones: zones.filter((z) => z !== zone),
      avoidance_resolved: [...resolved, { zone, at: new Date().toISOString() }].slice(-50),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);
  if (writeErr) return NextResponse.json({ ok: false, error: "Couldn't save. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
