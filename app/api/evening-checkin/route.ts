/**
 * POST /api/evening-checkin — the evening close-out.
 *
 * Saves the founder's end-of-day answers as a REAL reflection (one per day,
 * updated in place if they edit), so Mirror, avoidance detection, the task
 * generator and the ledger all learn from it. Also keeps the short note in
 * recent_interactions for the coach and stores tomorrow's first move so
 * Today can bring it back in the morning.
 *
 * Body: { note, outcome?, blocker?, tomorrow?, task?, projectId? }
 * A body with only `note` (older clients) keeps the old behaviour.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyBlocker } from "@/lib/blockerIntelligence";
import { getClientIp, rateLimitAsync } from "@/lib/server/rateLimit";
import { EVENING_MARK, NOTE_MAX, TOMORROW_MAX, canSubmit, eveningToReflection } from "@/lib/today/evening";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  note: z.string().trim().min(1).max(NOTE_MAX),
  outcome: z.enum(["done", "partly", "didnt"]).optional(),
  blocker: z.enum(["time", "unclear", "avoided", "waiting", "too_big", "other"]).nullish(),
  tomorrow: z.string().trim().max(TOMORROW_MAX).nullish(),
  task: z.string().trim().max(2000).nullish(),
  projectId: z.string().uuid().nullish(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await getRouteUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const limit = await rateLimitAsync(`evening:${user.userId}:${getClientIp(req)}`, 20, 60 * 60 * 1000, { failClosed: false });
    if (!limit.ok) return NextResponse.json({ ok: false, error: "Too many attempts" }, { status: 429 });

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 422 });
    const b = parsed.data;

    const admin = createAdminClient();
    const now = new Date().toISOString();
    const dayStart = `${now.slice(0, 10)}T00:00:00.000Z`;

    // Short note for the coach's continuity (unchanged behaviour).
    const { data: existing } = await admin.from("founder_context").select("recent_interactions").eq("user_id", user.userId).maybeSingle();
    const current: unknown[] = Array.isArray(existing?.recent_interactions) ? existing.recent_interactions : [];
    await admin.from("founder_context").upsert({
      user_id: user.userId,
      recent_interactions: [{ type: "evening_checkin", note: b.note, outcome: b.outcome ?? null, timestamp: now }, ...current].slice(0, 10),
      updated_at: now,
    }, { onConflict: "user_id" });

    let saved = false;
    if (b.outcome && canSubmit({ outcome: b.outcome, blocker: b.blocker ?? null, note: b.note })) {
      const r = eveningToReflection({ outcome: b.outcome, blocker: b.blocker ?? null, note: b.note, tomorrow: b.tomorrow ?? null, task: b.task ?? null });
      const row = { ...r, blocker_category: r.blocker ? classifyBlocker(r.blocker) : null };

      const { data: today } = await admin.from("reflections").select("id")
        .eq("user_id", user.userId).eq("what_tried", EVENING_MARK).gte("created_at", dayStart).limit(1).maybeSingle();
      const write = today?.id
        ? await admin.from("reflections").update(row).eq("id", today.id).eq("user_id", user.userId)
        : await admin.from("reflections").insert({ user_id: user.userId, project_id: b.projectId ?? null, ...row, created_at: now });
      saved = !write.error;

      const tomorrow = (b.tomorrow ?? "").trim();
      await admin.from("user_behavior_state").upsert({
        user_id: user.userId,
        key: "tomorrow_first_move",
        value: { text: tomorrow, date: now.slice(0, 10), task: (b.task ?? "").slice(0, 200) },
        updated_at: now,
      }, { onConflict: "user_id,key" });
    }

    return NextResponse.json({ ok: true, saved });
  } catch (err) {
    console.error("[evening-checkin]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
