import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFounderIntelligence } from "@/lib/founderIntelligence";
import { buildFounderMirror } from "@/lib/founderMirror";
import { buildStartupRelationshipGraph, traceRelationshipChain } from "@/lib/founderRelationships";
import { getFounderIntelligenceAccuracy } from "@/lib/learningLoop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const admin = createAdminClient();
  const url = new URL(request.url);
  let projectId = url.searchParams.get("projectId") || "";

  if (!projectId) {
    const { data: project } = await admin
      .from("projects")
      .select("id")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    projectId = project?.id ?? "";
  }

  const state = await loadFounderIntelligence(admin, user.id, projectId || undefined);
  const accuracy = await getFounderIntelligenceAccuracy(admin, user.id);
  const mirror = buildFounderMirror(state, accuracy);

  const [projectRes, milestonesRes, tasksRes, reflectionsRes] = await Promise.allSettled([
    projectId
      ? admin.from("projects").select("*").eq("id", projectId).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    projectId
      ? admin.from("milestones").select("*").eq("project_id", projectId).eq("user_id", user.id).order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    admin.from("tasks").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(80),
    admin.from("reflections").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(80),
  ]);

  const data = <T,>(res: PromiseSettledResult<{ data: T }>, fallback: T): T =>
    res.status === "fulfilled" ? (res.value.data ?? fallback) : fallback;

  const graph = buildStartupRelationshipGraph({
    project: data(projectRes as PromiseSettledResult<{ data: Record<string, any> | null }>, null),
    milestones: data(milestonesRes as PromiseSettledResult<{ data: Array<Record<string, any>> }>, []),
    tasks: data(tasksRes as PromiseSettledResult<{ data: Array<Record<string, any>> }>, []),
    reflections: data(reflectionsRes as PromiseSettledResult<{ data: Array<Record<string, any>> }>, []),
  }, state);

  return NextResponse.json({
    ok: true,
    data: {
      mirror,
      intelligence: state,
      relationship_chain: traceRelationshipChain(
        graph,
        state.startup.stalled_milestones[0] ?? state.startup.active_milestones[0] ?? null,
      ),
      relationship_graph_summary: {
        nodes: graph.nodes.length,
        edges: graph.edges.length,
      },
    },
  });
}
