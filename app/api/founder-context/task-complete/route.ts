/**
 * app/api/founder-context/task-complete/route.ts
 * POST → records task completion, boosts momentum, updates last_active
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { momentumOnTaskComplete } from "@/lib/founderContext";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const { stage = "" } = await req.json().catch(() => ({}));
  const admin = createAdminClient();

  const { data: ctx } = await admin
    .from("founder_context")
    .select("momentum_score, tasks_accepted_this_week, current_stage, consecutive_tasks_completed, last_active, tasks_completed_today, last_task_date, tasks_completed_total")
    .eq("user_id", user.id)
    .maybeSingle();

  const current = ctx?.momentum_score ?? 50;
  const previousTaskCount = ctx?.tasks_accepted_this_week ?? 0;
  const isFirstTask = previousTaskCount === 0;

  // Hard tasks (launch/revenue stage) give bigger momentum boost
  const isHardTask = ["launch", "revenue", "growth"].some(s =>
    (stage || ctx?.current_stage || "").toLowerCase().includes(s)
  );
  const newMomentum = momentumOnTaskComplete(current, isHardTask);

  // Consecutive task tracking — powers the Emotional Language Layer in reflexion.ts
  // If they're returning after a gap, reset to 1 (a restart, not a continuation)
  const today = new Date().toLocaleDateString("en-CA");
  const previousTodayCount = ctx?.last_task_date === today ? (ctx?.tasks_completed_today ?? 0) : 0;
  const isReturningAfterGap = (ctx?.last_active ?? "") < today;
  const prevConsecutive = ctx?.consecutive_tasks_completed ?? 0;
  const newConsecutive = isReturningAfterGap ? 1 : prevConsecutive + 1;

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

  return NextResponse.json({ ok: true, momentum: newMomentum, isFirstTask, consecutiveTasksCompleted: newConsecutive, tasksCompletedTotal: (ctx?.tasks_completed_total ?? 0) + 1 });
}
