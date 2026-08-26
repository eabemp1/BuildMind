/**
 * app/api/weekly-goal/route.ts
 *
 * GET   → returns current week's ghost goal for the active project
 * POST  → create / replace this week's goal
 * PATCH → update tasks_done and current_score (called on check-in)
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Returns the ISO date string for the Monday of the week containing `d` */
function weekStart(d: Date): string {
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // back to Monday
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diff);
  return monday.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ ok: false, error: "project_id required" }, { status: 400 });

  const admin = createAdminClient();
  const week = weekStart(new Date());

  const { data, error: dbErr } = await admin
    .from("weekly_goals")
    .select("*")
    .eq("project_id", projectId)
    .eq("week_start", week)
    .maybeSingle();

  if (dbErr) return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    project_id?: string;
    goal_text?: string;
    goal_type?: "custom" | "ai_calibrated";
    target_score?: number;
    target_tasks?: number;
  };

  const { project_id, goal_text, goal_type = "custom", target_score = 70, target_tasks = 5 } = body;
  if (!project_id || !goal_text) {
    return NextResponse.json({ ok: false, error: "project_id and goal_text required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const week = weekStart(new Date());

  // FIX: this previously always wrote tasks_done: 0, even when the founder
  // sets (or resets) their goal partway through the week. lib/weeklyPulseData.ts's
  // "This Week" tasks_completed counts every today_action completion since
  // Monday regardless of when a weekly_goals row was created, so a goal set
  // on Wednesday started 0-2 tasks behind reality and could never catch up —
  // the confirmed cause of Progress showing more tasks than Ghost Goals.
  // Backfill from the exact same source/window Progress uses: reflexion_learning_log
  // rows this week with session_id prefixed "today_action" (Today's real
  // completion flow — see the FIX comments in weeklyPulseData.ts for why
  // this specific filter, not the generic `tasks` table or all learning-log
  // rows, is the correct source).
  const weekStartIso = `${week}T00:00:00.000Z`;
  const { data: weekLogs } = await admin
    .from("reflexion_learning_log")
    .select("outcome, session_id")
    .eq("user_id", user.id)
    .gte("created_at", weekStartIso);
  const backfilledTasksDone = (weekLogs ?? []).filter(
    (r) => (r.session_id ?? "").startsWith("today_action") && r.outcome === "completed",
  ).length;

  const { data, error: dbErr } = await admin
    .from("weekly_goals")
    .upsert({
      user_id:      user.id,
      project_id,
      week_start:   week,
      goal_text,
      goal_type,
      target_score: Math.min(100, Math.max(0, target_score)),
      target_tasks: Math.max(1, target_tasks),
      tasks_done:   backfilledTasksDone,
      current_score: 0,
      status:       "active",
    }, { onConflict: "project_id,week_start" })
    .select()
    .maybeSingle();

  if (dbErr) return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    project_id?: string;
    tasks_done?: number;
    current_score?: number;
    // FIX: app/today/page.tsx's check-in flow only ever sent project_id +
    // current_score to this endpoint — never tasks_done. Since
    // `newTasksDone = tasks_done ?? goal.tasks_done` falls back to the
    // EXISTING value when tasks_done is omitted, every Today completion
    // updated the score but silently left tasks_done unchanged, forever.
    // That's the confirmed cause of "Ghost Goals didn't increment." Added
    // this atomic-increment flag so the caller doesn't need to fetch and
    // recompute the current count itself (avoids a read-then-write race
    // between two check-ins) — it just says "one more task happened."
    increment_tasks_done?: boolean;
  };

  const { project_id, tasks_done, current_score, increment_tasks_done } = body;
  if (!project_id) return NextResponse.json({ ok: false, error: "project_id required" }, { status: 400 });

  const admin = createAdminClient();
  const week = weekStart(new Date());

  // First fetch the current goal
  const { data: goal } = await admin
    .from("weekly_goals")
    .select("*")
    .eq("project_id", project_id)
    .eq("week_start", week)
    .maybeSingle();

  if (!goal) return NextResponse.json({ ok: false, error: "No active goal" }, { status: 404 });

  const newTasksDone   = increment_tasks_done ? (goal.tasks_done ?? 0) + 1 : (tasks_done ?? goal.tasks_done);
  const newScore       = current_score ?? goal.current_score;

  // Compute status
  let status: "active" | "surpassed" | "missed" | "on_track" = "active";
  const scoreSurpassed  = newScore  >= (goal.target_score ?? 70);
  const tasksSurpassed  = newTasksDone >= (goal.target_tasks ?? 5);
  if (scoreSurpassed && tasksSurpassed) status = "surpassed";
  else if (newScore >= (goal.target_score ?? 70) * 0.7) status = "on_track";

  const { data, error: dbErr } = await admin
    .from("weekly_goals")
    .update({ tasks_done: newTasksDone, current_score: newScore, status })
    .eq("project_id", project_id)
    .eq("week_start", week)
    .select()
    .maybeSingle();

  if (dbErr) return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
    }
