/**
 * app/api/projects/[id]/activity/route.ts
 *
 * GET → the founder's most recent activity_log entries scoped to this
 * project, for the detail page's "Last activity" card (Figma parity).
 *
 * activity_log already exists and is written to from several routes
 * (today-action, reflect-action, founder-context/task-complete, the
 * override route) with `metadata.projectId` set on every project-scoped
 * event — confirmed by grep before adding this route, nothing new is
 * written here. This is the first place anything reads it back out for
 * the founder to see; every other reader is an internal admin/intelligence
 * consumer. No synthetic events, no fabricated copy — an empty result
 * means the project genuinely has no logged activity yet.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const EVENT_LABELS: Record<string, string> = {
  task_accepted: "Accepted today's action",
  task_completed: "Completed a task",
  task_overridden: "Overrode today's action",
  reflection_done: "Filed a reflection",
  stage_advanced: "Advanced project stage",
  coach_session: "Talked with AI Coach",
  login: "Signed in",
  app_open: "Opened BuildMind",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  if (!projectId) return NextResponse.json({ ok: false }, { status: 400 });

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const admin = createAdminClient();
  // metadata.projectId is set as a plain string on every writer above —
  // filter with a jsonb containment match rather than trusting free-text.
  const { data, error: queryError } = await admin
    .from("activity_log")
    .select("event_type, metadata, occurred_at")
    .eq("user_id", user.id)
    .contains("metadata", { projectId })
    .order("occurred_at", { ascending: false })
    .limit(5);

  if (queryError) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const events = (data ?? []).map((row) => ({
    label: EVENT_LABELS[row.event_type] ?? row.event_type,
    occurredAt: row.occurred_at,
  }));

  return NextResponse.json({ ok: true, events });
}
