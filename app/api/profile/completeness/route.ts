import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProfileFields } from "@/lib/profileCompleteness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Single source for the "AI advice quality" inputs. Overview and Settings used
 * to pass different fields into the same bar (Settings sent empty avoidance
 * zones, revenue, name and task count), so the two pages disagreed.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });
  const admin = createAdminClient();

  const [projectRes, contextRes, memoryRes, profileRes, tasksRes] = await Promise.allSettled([
    admin.from("projects").select("description, startup_summary, startup_stage, target_users, problem, current_mrr")
      .eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("founder_context").select("avoidance_zones").eq("user_id", user.id).maybeSingle(),
    admin.from("founder_memory").select("avoidance_zones").eq("user_id", user.id).maybeSingle(),
    admin.from("profiles").select("name, full_name, display_name").eq("id", user.id).maybeSingle(),
    admin.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_completed", true),
  ]);
  const val = <T,>(r: PromiseSettledResult<{ data: T | null }>) => (r.status === "fulfilled" ? r.value.data : null);
  const project = val(projectRes) as Record<string, unknown> | null;
  const ctx = val(contextRes) as { avoidance_zones?: string[] | null } | null;
  const mem = val(memoryRes) as { avoidance_zones?: string[] | null } | null;
  const prof = val(profileRes) as { name?: string | null; full_name?: string | null; display_name?: string | null } | null;
  const tasksCompleted = tasksRes.status === "fulfilled" ? tasksRes.value.count ?? 0 : 0;
  const meta = user.user_metadata as { full_name?: string; name?: string } | undefined;

  const fields: ProfileFields = {
    startupSummary: String(project?.startup_summary ?? project?.description ?? ""),
    problem: String(project?.problem ?? ""),
    stage: String(project?.startup_stage ?? ""),
    targetUsers: String(project?.target_users ?? ""),
    avoidanceZones: (ctx?.avoidance_zones?.length ? ctx.avoidance_zones : mem?.avoidance_zones) ?? [],
    mrr: Number(project?.current_mrr ?? 0) || 0,
    displayName: prof?.display_name ?? prof?.name ?? prof?.full_name ?? meta?.full_name ?? meta?.name ?? "",
    tasksCompleted,
  };
  return NextResponse.json({ ok: true, fields });
}
