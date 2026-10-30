/**
 * /api/project/path: the founder's vision and one 90-day goal for a project.
 *   GET   ?project_id   goal, stage and stage list (goal is null until set; setup is true if the table is missing)
 *   PUT   {project_id, vision?, label, target}   create or change the goal
 *   PATCH {project_id, delta}   add or remove progress the founder reports
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAGE_ORDER, normalizeStage } from "@/lib/stages";

export const dynamic = "force-dynamic";
const DAY = 86_400_000;

async function owner(projectId: string | null) {
  if (!projectId) return { error: NextResponse.json({ ok: false, error: "project_id required" }, { status: 400 }) } as const;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ ok: false }, { status: 401 }) } as const;
  const admin = createAdminClient();
  const { data } = await admin.from("projects").select("id, startup_stage").eq("id", projectId).eq("user_id", user.id).maybeSingle();
  if (!data) return { error: NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 }) } as const;
  return { admin, userId: user.id, stage: normalizeStage((data as { startup_stage?: string }).startup_stage) } as const;
}

const shape = (g: Record<string, unknown> | null, now = Date.now()) => g && {
  vision: (g.vision as string | null) ?? "",
  label: g.goal_label as string,
  target: g.goal_target as number,
  current: g.goal_current as number,
  daysLeft: Math.max(0, Math.ceil((Date.parse(String(g.ends_at)) - now) / DAY)),
};

export async function GET(req: Request) {
  const o = await owner(new URL(req.url).searchParams.get("project_id"));
  if ("error" in o) return o.error;
  const { data, error } = await o.admin.from("project_goals").select("*").eq("project_id", new URL(req.url).searchParams.get("project_id")!).maybeSingle();
  return NextResponse.json({ ok: true, setup: Boolean(error), goal: error ? null : shape(data), stage: o.stage, stages: STAGE_ORDER });
}

export async function PUT(req: Request) {
  const b = await req.json().catch(() => ({}));
  const o = await owner(typeof b.project_id === "string" ? b.project_id : null);
  if ("error" in o) return o.error;
  const label = String(b.label ?? "").trim().slice(0, 60);
  const target = Math.round(Number(b.target));
  if (label.length < 3 || !Number.isFinite(target) || target < 1 || target > 9999) {
    return NextResponse.json({ ok: false, error: "Add a short goal and a number between 1 and 9999." }, { status: 400 });
  }
  const { data: cur } = await o.admin.from("project_goals").select("project_id").eq("project_id", b.project_id).maybeSingle();
  const row = { user_id: o.userId, vision: String(b.vision ?? "").trim().slice(0, 200) || null, goal_label: label, goal_target: target, updated_at: new Date().toISOString() };
  const { error } = cur
    ? await o.admin.from("project_goals").update(row).eq("project_id", b.project_id)
    : await o.admin.from("project_goals").insert({ ...row, project_id: b.project_id });
  if (error) return NextResponse.json({ ok: false, error: "Could not save the goal." }, { status: 500 });
  const { data } = await o.admin.from("project_goals").select("*").eq("project_id", b.project_id).maybeSingle();
  return NextResponse.json({ ok: true, goal: shape(data) });
}

export async function PATCH(req: Request) {
  const b = await req.json().catch(() => ({}));
  const o = await owner(typeof b.project_id === "string" ? b.project_id : null);
  if ("error" in o) return o.error;
  const delta = Number(b.delta) === -1 ? -1 : 1;
  const { data: cur } = await o.admin.from("project_goals").select("goal_current").eq("project_id", b.project_id).maybeSingle();
  if (!cur) return NextResponse.json({ ok: false, error: "Set a goal first." }, { status: 404 });
  const next = Math.min(9999, Math.max(0, (cur.goal_current as number) + delta));
  const { error } = await o.admin.from("project_goals").update({ goal_current: next, updated_at: new Date().toISOString() }).eq("project_id", b.project_id);
  if (error) return NextResponse.json({ ok: false, error: "Could not save progress." }, { status: 500 });
  const { data } = await o.admin.from("project_goals").select("*").eq("project_id", b.project_id).maybeSingle();
  return NextResponse.json({ ok: true, goal: shape(data) });
}
