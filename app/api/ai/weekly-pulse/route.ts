/**
 * app/api/ai/weekly-pulse/route.ts
 *
 * Backs the "This Week" tab in app/progress/page.tsx.
 *
 * REFACTORED: the actual data computation (every Supabase query, the
 * milestone pacing, grading, and AI story synthesis) now lives in
 * lib/weeklyPulseData.ts — extracted so the new PNG export route
 * (app/api/card/weekly-pulse/route.ts) can call the exact same function
 * instead of duplicating ~250 lines of query logic a second time. This
 * file is now just auth + the JSON response wrapper. Read
 * lib/weeklyPulseData.ts's header comment for the full data-source
 * rationale (score_history table vs jsonb column, action_logs vs
 * reflexion_learning_log, etc.) — it isn't repeated here.
 *
 * Deliberately a separate endpoint from app/api/ai/weekly-report/route.ts
 * (the /reports export/reporting surface) — different product surface,
 * must keep working unmodified.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWeeklyPulseData } from "@/lib/weeklyPulseData";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const projectId: string | undefined =
      typeof body?.projectId === "string" && body.projectId.trim() ? body.projectId.trim() : undefined;

    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const data = await getWeeklyPulseData(user.id, projectId);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ ok: false, error: "weekly_pulse_failed" }, { status: 500 });
  }
}
