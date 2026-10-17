/**
 * POST /api/avoidance/resolve  { zone }
 * The founder marks an avoided area as faced. The zone leaves
 * founder_memory.avoidance_zones and is recorded in avoidance_resolved with
 * a timestamp, which Avoidance Resistance reads for the current week.
 * The founder must give evidence ({ zone, evidence }). It is weighed by
 * lib/evidenceWeigh.ts against what BuildMind itself recorded (completed
 * tasks, reflections); only accepted evidence resolves the zone.
 * Requires supabase/migrations/20261009000000_avoidance_resolved.sql.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { weighEvidence, verdictMessage } from "@/lib/evidenceWeigh";
import { zoneMatchesActions, zoneWords } from "@/lib/avoidanceMatch";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { zone?: string; evidence?: string };
  const zone = typeof body.zone === "string" ? body.zone.trim().slice(0, 80) : "";
  if (!zone) return NextResponse.json({ ok: false, error: "zone required" }, { status: 400 });
  const evidence = typeof body.evidence === "string" ? body.evidence.trim().slice(0, 600) : "";

  const admin = createAdminClient();
  const { data: row, error: readErr } = await admin
    .from("founder_memory")
    .select("avoidance_zones, avoidance_resolved")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ ok: false, error: "Couldn't save. Try again." }, { status: 500 });

  const zones: string[] = Array.isArray(row?.avoidance_zones) ? row!.avoidance_zones : [];
  if (!zones.includes(zone)) return NextResponse.json({ ok: false, error: "That area isn't on your list." }, { status: 404 });
  const resolved: Array<{ zone: string; at: string; evidence?: string; score?: number; verified?: boolean }> =
    Array.isArray(row?.avoidance_resolved) ? row!.avoidance_resolved : [];

  // At most 3 resolutions a day: stops tapping through the whole list.
  const dayAgo = Date.now() - 24 * 3600_000;
  if (resolved.filter((r) => Date.parse(r.at) >= dayAgo).length >= 3) {
    return NextResponse.json({ ok: false, error: "Three areas faced today is plenty. Come back tomorrow." }, { status: 429 });
  }

  // What BuildMind itself saw in the last 14 days, independent of the founder's wording.
  const since = new Date(Date.now() - 14 * 24 * 3600_000).toISOString();
  const [tasksRes, reflRes] = await Promise.all([
    admin.from("reflexion_learning_log").select("action_shown, action_type").eq("user_id", user.id).eq("outcome", "completed").gte("created_at", since).limit(60),
    admin.from("reflections").select("what_tried, what_happened").eq("user_id", user.id).gte("created_at", since).limit(40),
  ]);
  const doneActions = ((tasksRes.data ?? []) as Array<{ action_shown?: string | null; action_type?: string | null }>)
    .map((t) => ({ title: t.action_shown ?? "", actionType: t.action_type ?? null }));
  const observed = [
    ...doneActions.map((a) => ({ text: a.title, actionType: a.actionType })),
    ...((reflRes.data ?? []) as Array<{ what_tried?: string | null; what_happened?: string | null }>).map((r) => ({ text: `${r.what_tried ?? ""} ${r.what_happened ?? ""}` })),
  ];

  const weighed = weighEvidence({
    kind: "avoidance_faced",
    claim: zone,
    text: evidence,
    observed,
    relatedWords: zoneWords(zone),
    observedMatch: zoneMatchesActions(zone, doneActions),
    previousTexts: resolved.map((r) => r.evidence ?? "").filter(Boolean),
  });
  // Facing an area is all-or-nothing: partial evidence is not enough to clear it.
  if (weighed.verdict !== "accepted") {
    return NextResponse.json({ ok: false, needsMore: true, score: weighed.score, error: verdictMessage(weighed), hints: weighed.hints }, { status: 422 });
  }

  const { error: writeErr } = await admin
    .from("founder_memory")
    .update({
      avoidance_zones: zones.filter((z) => z !== zone),
      avoidance_resolved: [...resolved, { zone, at: new Date().toISOString(), evidence, score: weighed.score, verified: weighed.corroborated }].slice(-50),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);
  if (writeErr) return NextResponse.json({ ok: false, error: "Couldn't save. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
