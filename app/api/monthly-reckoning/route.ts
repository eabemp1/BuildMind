/**
 * app/api/monthly-reckoning/route.ts
 *
 * GET  → returns (or detects + creates) this month's Reckoning for a
 *        project: a single stale goal surfaced for an explicit
 *        revive/kill decision. Returns { data: null } when nothing
 *        qualifies — that's a normal, good state, not an error.
 * POST → resolve the current month's pending Reckoning: { action: "revive" | "kill" }
 *
 * One row per (project_id, month_start) — see supabase/migrations/
 * 20260826000000_monthly_reckonings.sql for why this is a permanent ledger,
 * not a transient banner state.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findStaleGoal, monthStart, type MilestoneActivityInput } from "@/lib/monthlyReckoning";

const STALE_DAYS_THRESHOLD = 21;
const REVIVE_EXTENSION_DAYS = 30;

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ ok: false, error: "project_id required" }, { status: 400 });

  const admin = createAdminClient();
  const month = monthStart(new Date());

  // A reckoning already detected this month stays exactly as it was —
  // never recomputed mid-month, so the founder isn't shown a moving target.
  const { data: existing, error: existingErr } = await admin
    .from("monthly_reckonings")
    .select("*")
    .eq("project_id", projectId)
    .eq("month_start", month)
    .maybeSingle();

  if (existingErr) return NextResponse.json({ ok: false, error: existingErr.message }, { status: 500 });
  if (existing) return NextResponse.json({ ok: true, data: existing });

  // Nothing detected yet this month — check now.
  const { data: milestones, error: milestonesErr } = await admin
    .from("milestones")
    .select("id, title, status, created_at, updated_at")
    .eq("project_id", projectId)
    .in("status", ["pending", "in_progress"]);

  if (milestonesErr) return NextResponse.json({ ok: false, error: milestonesErr.message }, { status: 500 });
  if (!milestones || milestones.length === 0) return NextResponse.json({ ok: true, data: null });

  const milestoneIds = milestones.map((m) => m.id as string);
  const { data: completedTasks, error: tasksErr } = await admin
    .from("tasks")
    .select("milestone_id, completed_at, updated_at")
    .in("milestone_id", milestoneIds)
    .eq("is_completed", true);

  if (tasksErr) return NextResponse.json({ ok: false, error: tasksErr.message }, { status: 500 });

  const lastCompletedByMilestone = new Map<string, string>();
  for (const t of completedTasks ?? []) {
    const mid = t.milestone_id as string | null;
    if (!mid) continue;
    const at = (t.completed_at as string | null) ?? (t.updated_at as string | null);
    if (!at) continue;
    const current = lastCompletedByMilestone.get(mid);
    if (!current || new Date(at).getTime() > new Date(current).getTime()) {
      lastCompletedByMilestone.set(mid, at);
    }
  }

  const inputs: MilestoneActivityInput[] = milestones.map((m) => ({
    id: m.id as string,
    title: m.title as string,
    status: m.status as string,
    createdAt: m.created_at as string,
    updatedAt: m.updated_at as string,
    lastTaskCompletedAt: lastCompletedByMilestone.get(m.id as string) ?? null,
  }));

  const stale = findStaleGoal(inputs, new Date(), STALE_DAYS_THRESHOLD);
  if (!stale) return NextResponse.json({ ok: true, data: null });

  const { data: created, error: insertErr } = await admin
    .from("monthly_reckonings")
    .insert({
      user_id: user.id,
      project_id: projectId,
      milestone_id: stale.id,
      month_start: month,
      milestone_title_snapshot: stale.title,
      days_stale_at_detection: stale.daysSinceActivity,
      status: "pending",
    })
    .select()
    .maybeSingle();

  if (insertErr) return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: created });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    project_id?: string;
    action?: "revive" | "kill";
  };
  const { project_id, action } = body;
  if (!project_id || (action !== "revive" && action !== "kill")) {
    return NextResponse.json({ ok: false, error: "project_id and action ('revive'|'kill') required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const month = monthStart(new Date());

  const { data: reckoning, error: fetchErr } = await admin
    .from("monthly_reckonings")
    .select("*")
    .eq("project_id", project_id)
    .eq("month_start", month)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
  if (!reckoning) return NextResponse.json({ ok: false, error: "No reckoning to resolve this month" }, { status: 404 });
  if (reckoning.status !== "pending") {
    return NextResponse.json({ ok: false, error: `Already resolved as '${reckoning.status}'` }, { status: 409 });
  }

  if (reckoning.milestone_id) {
    if (action === "kill") {
      await admin.from("milestones").update({ status: "abandoned" }).eq("id", reckoning.milestone_id);
    } else {
      // Revive: give it a real fresh deadline if it has one, and touch it
      // regardless (the updated_at trigger fires on any UPDATE) so next
      // month's staleness check starts counting from today, not from
      // whenever it was last genuinely worked on.
      const { data: milestone } = await admin
        .from("milestones")
        .select("target_date")
        .eq("id", reckoning.milestone_id)
        .maybeSingle();
      const patch: Record<string, unknown> = { status: "in_progress" };
      if (milestone?.target_date) {
        const extended = new Date();
        extended.setUTCDate(extended.getUTCDate() + REVIVE_EXTENSION_DAYS);
        patch.target_date = extended.toISOString().slice(0, 10);
      }
      await admin.from("milestones").update(patch).eq("id", reckoning.milestone_id);
    }
  }

  const { data: resolved, error: updateErr } = await admin
    .from("monthly_reckonings")
    .update({ status: action === "kill" ? "killed" : "revived", resolved_at: new Date().toISOString() })
    .eq("id", reckoning.id)
    .select()
    .maybeSingle();

  if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: resolved });
                              }
