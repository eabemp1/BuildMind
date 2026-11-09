/**
 * GET  /api/today/roadmap-task?projectId=&action=  — is the action just finished on Today one of the open roadmap tasks?
 * POST /api/today/roadmap-task {taskId}            — the founder said yes: mark that roadmap task done.
 * Nothing is ticked without the POST, and the POST only touches the caller's own task.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchRoadmapTask, type OpenTask } from "@/lib/roadmap/match";
import { syncMilestoneForTask } from "@/lib/server/milestoneSync";

export const dynamic = "force-dynamic";

async function authed() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET(req: NextRequest) {
  const user = await authed();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  const action = (req.nextUrl.searchParams.get("action") ?? "").slice(0, 600);
  if (!/^[0-9a-f-]{36}$/i.test(projectId) || action.length < 8) return NextResponse.json({ ok: true, match: null });

  const admin = createAdminClient();
  const { data } = await admin
    .from("tasks")
    .select("id, title, milestones!inner(title, project_id)")
    .eq("user_id", user.id)
    .eq("is_completed", false)
    .eq("milestones.project_id", projectId)
    .limit(200);
  const open: OpenTask[] = (data ?? []).map((t) => {
    const m = (t as unknown as { milestones: { title?: string } | { title?: string }[] }).milestones;
    const title = Array.isArray(m) ? m[0]?.title : m?.title;
    return { id: String((t as { id: string }).id), title: String((t as { title: string }).title ?? ""), milestone: String(title ?? "") };
  });
  const match = matchRoadmapTask(action, open);
  return NextResponse.json({ ok: true, match: match ? { id: match.id, title: match.title, milestone: match.milestone } : null });
}

const Body = z.object({ taskId: z.string().uuid() });

export async function POST(req: NextRequest) {
  const user = await authed();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); } catch { return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 }); }
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin.from("tasks")
    .update({ is_completed: true, status: "completed", completed_at: now, updated_at: now })
    .eq("id", body.taskId).eq("user_id", user.id).select("id").maybeSingle();
  if (error || !data) return NextResponse.json({ ok: false, error: "Could not update the task." }, { status: 404 });
  await syncMilestoneForTask(admin, body.taskId, user.id);
  return NextResponse.json({ ok: true });
}
