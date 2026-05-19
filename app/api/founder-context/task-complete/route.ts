/**
 * app/api/founder-context/task-complete/route.ts
 * POST → records task completion, boosts momentum, updates last_active,
 *        and runs pattern detection (Playbook §3.2) to surface behavioural signals.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { momentumOnTaskComplete } from "@/lib/founderContext";
import { detectPattern, shouldSurfacePattern } from "@/lib/patternDetection";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const { stage = "" } = await req.json().catch(() => ({}));
  const admin = createAdminClient();

  // Fetch context + founder_memory + recent task titles in parallel for pattern detection
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const [ctxResult, memoryResult, recentTasksResult] = await Promise.allSettled([
    admin
      .from("founder_context")
      .select("momentum_score, tasks_accepted_this_week, tasks_overridden_this_week, current_stage, consecutive_tasks_completed, last_active, tasks_completed_today, last_task_date, tasks_completed_total, override_reasons, topics_mentioned_repeatedly, days_inactive, last_pattern_shown_at, momentum_last_week")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("founder_memory")
      .select("avoidance_zones")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("reflections")
      .select("today_action")
      .eq("user_id", user.id)
      .gte("created_at", fourteenDaysAgo)
      .not("today_action", "is", null)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const ctx = ctxResult.status === "fulfilled" ? ctxResult.value.data : null;
  const memory = memoryResult.status === "fulfilled" ? memoryResult.value.data : null;
  const recentTaskTitles = recentTasksResult.status === "fulfilled"
    ? (recentTasksResult.value.data ?? []).map((r: { today_action: string }) => r.today_action).filter(Boolean)
    : [];

  const current = ctx?.momentum_score ?? 50;
  const previousTaskCount = ctx?.tasks_accepted_this_week ?? 0;
  const isFirstTask = previousTaskCount === 0;

  // Hard tasks (launch/revenue stage) give bigger momentum boost
  const isHardTask = ["launch", "revenue", "growth"].some(s =>
    (stage || ctx?.current_stage || "").toLowerCase().includes(s)
  );
  const newMomentum = momentumOnTaskComplete(current, isHardTask);

  // Consecutive task tracking — powers the Emotional Language Layer in reflexion.ts
  const today = new Date().toISOString().slice(0, 10);
  const previousTodayCount = ctx?.last_task_date === today ? (ctx?.tasks_completed_today ?? 0) : 0;
  const isReturningAfterGap = (ctx?.last_active ?? "") < today;
  const prevConsecutive = ctx?.consecutive_tasks_completed ?? 0;
  const newConsecutive = isReturningAfterGap ? 1 : prevConsecutive + 1;

  // ── Pattern Detection (Playbook §3.2) ────────────────────────────────────
  // Run after every task completion — surfaces behavioural signals to the
  // next AI response rather than waiting for the evening cron.
  let activePattern = null;
  try {
    const pattern = detectPattern({
      avoidance_zones: (memory?.avoidance_zones ?? []) as string[],
      override_reasons: (ctx?.override_reasons ?? []) as string[],
      tasks_overridden_this_week: ctx?.tasks_overridden_this_week ?? 0,
      tasks_accepted_this_week: previousTaskCount + 1,
      momentum_score: newMomentum,
      momentum_last_week: ctx?.momentum_last_week ?? null,
      topics_mentioned_repeatedly: (ctx?.topics_mentioned_repeatedly ?? []) as string[],
      days_inactive: ctx?.days_inactive ?? 0,
      recent_task_titles: recentTaskTitles,
    });

    if (
      pattern.signal &&
      shouldSurfacePattern(ctx?.last_pattern_shown_at, pattern.severity)
    ) {
      activePattern = pattern;
      // Write the detected pattern back to context so the next AI call sees it
      await admin.from("founder_context").update({
        active_pattern_signal: pattern.signal,
        active_pattern_message: pattern.message,
        active_pattern_subject: pattern.subject,
        last_pattern_shown_at: new Date().toISOString(),
      }).eq("user_id", user.id);
    }
  } catch {
    // Pattern detection is non-fatal — never block task completion
  }

  await admin.from("founder_context").upsert({
    user_id: user.id,
    momentum_score: newMomentum,
    momentum_updated_at: new Date().toISOString(),
    last_active: today,
    days_inactive: 0,
    tasks_accepted_this_week: previousTaskCount + 1,
    consecutive_tasks_completed: newConsecutive,
    tasks_completed_today: previousTodayCount + 1,
    last_task_date: today,
    daily_tasks_reset_at: new Date().toISOString(),
    tasks_completed_total: (ctx?.tasks_completed_total ?? 0) + 1,
    ...(stage ? { current_stage: stage } : {}),
  }, { onConflict: "user_id" });

  return NextResponse.json({
    ok: true,
    momentum: newMomentum,
    isFirstTask,
    consecutiveTasksCompleted: newConsecutive,
    tasksCompletedTotal: (ctx?.tasks_completed_total ?? 0) + 1,
    // Surface detected pattern to the client so the today page can show it
    pattern: activePattern ? {
      signal: activePattern.signal,
      message: activePattern.message,
      severity: activePattern.severity,
    } : null,
  });
}
