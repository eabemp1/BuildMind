import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFounderIntelligence } from "@/lib/founderIntelligence";
import { buildFounderMirror } from "@/lib/founderMirror";
import { buildStartupRelationshipGraph, traceRelationshipChain } from "@/lib/founderRelationships";
import { getFounderIntelligenceAccuracy } from "@/lib/learningLoop";
import { loadBehavioralContext } from "@/lib/behavioralLayers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QueryResult<T> = PromiseSettledResult<{ data: T }>;

function settledData<T>(res: QueryResult<T>, fallback: T): T {
  return res.status === "fulfilled" ? (res.value.data ?? fallback) : fallback;
}

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

  // Fetched once here and handed to loadFounderIntelligence() as `preloaded`
  // (it supports this explicitly) instead of letting it re-fetch the same
  // four tables internally. buildStartupRelationshipGraph() below reuses
  // these exact same rows — one snapshot, so the beliefs/signals in `mirror`
  // and the relationship graph can never disagree about what the founder's
  // data actually was at request time. Filters mirror
  // lib/founderIntelligence.ts::loadFounderIntelligence()'s own defaults
  // (30-day reflection window, project-or-null scoping) so behavior is
  // unchanged from calling it unpreloaded.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [projectRes, milestonesRes, tasksRes, reflectionsRes, profileRes] = await Promise.allSettled([
    projectId
      ? admin.from("projects").select("*").eq("id", projectId).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    projectId
      ? admin.from("milestones").select("*").eq("project_id", projectId).eq("user_id", user.id).order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    admin.from("tasks").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(80),
    projectId
      ? admin.from("reflections").select("*").eq("user_id", user.id).or(`project_id.eq.${projectId},project_id.is.null`).gte("created_at", thirtyDaysAgo).order("created_at", { ascending: false }).limit(80)
      : admin.from("reflections").select("*").eq("user_id", user.id).gte("created_at", thirtyDaysAgo).order("created_at", { ascending: false }).limit(80),
    admin.from("profiles").select("full_name, display_name").eq("id", user.id).maybeSingle(),
  ]);

  const preloaded = {
    project: settledData(projectRes as QueryResult<Record<string, any> | null>, null),
    milestones: settledData(milestonesRes as QueryResult<Array<Record<string, any>>>, []),
    tasks: settledData(tasksRes as QueryResult<Array<Record<string, any>>>, []),
    reflections: settledData(reflectionsRes as QueryResult<Array<Record<string, any>>>, []),
  };

  const state = await loadFounderIntelligence(admin, user.id, projectId || undefined, preloaded);
  const accuracy = await getFounderIntelligenceAccuracy(admin, user.id);
  const mirror = buildFounderMirror(state, accuracy);

  const profile = settledData(profileRes as QueryResult<{ full_name?: string; display_name?: string } | null>, null);
  const founderName = profile?.display_name ?? profile?.full_name ?? null;

  // ── Surface-only Mirror Moment wiring ────────────────────────────────────
  // lib/mirrorMoment.ts (archetype, signature card, pattern report) is a
  // SEPARATE founder-modeling pipeline (lib/behavioralLayers.ts's "seven
  // layer orchestrator") from FounderIntelligenceState above — different
  // inputs, different math, can in principle disagree with the beliefs in
  // `mirror`. This call surfaces it without attempting reconciliation; the
  // duplication is tracked as a known issue for a later unification pass
  // rather than silently glossed over — see
  // docs/known-issue-dual-founder-modeling-systems.md.
  const behavioral = await loadBehavioralContext(
    admin,
    user.id,
    state.execution_state.momentum.score ?? 50,
    founderName,
    null,
  ).catch(() => null);

  const graph = buildStartupRelationshipGraph(preloaded, state);

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
      // Full graph for the interactive node-graph view — built from the
      // exact same preloaded rows and the exact same
      // buildStartupRelationshipGraph() call the narrative chain above
      // used, so the summary/chain/full-graph views can never disagree.
      relationship_graph: graph,
      behavioral: behavioral
        ? {
            archetype: behavioral.archetype,
            milestone: behavioral.milestone,
            first_insight: behavioral.firstInsight,
            signature_card: behavioral.signatureCard,
            pattern_report: behavioral.patternReport,
            checkins_total: behavioral.checkinsTotal,
            days_since_start: behavioral.daysSinceStart,
          }
        : null,
    },
  });
}
