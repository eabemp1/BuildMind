import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFounderIntelligence } from "@/lib/founderIntelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * app/api/founder-context/patterns/route.ts
 *
 * Exposes state.founder.strengths / avoidance_patterns — the exact merged,
 * deduped lists lib/founderMirror.ts's belief cards are derived from
 * (founder_memory.strengths/avoidance_zones + founder_context.avoidance_zones
 * + execution-signature categories + learned action-type patterns; see
 * lib/founderIntelligence.ts's `strengths:` / `avoidance_patterns:` lines).
 *
 * Why this route exists: app/insights/page.tsx used to read
 * founder_memory.strengths/avoidance_zones directly and render them as
 * chips — one of up to four sources Founder Mirror folds together, so the
 * two pages (which link directly to each other via the "Reveal Mirror"
 * card) could show different lists for the same founder. Rather than have
 * Insights fetch the full /api/founder-context/mirror payload (relationship
 * graph, behavioral archetype, signals, decision alternatives — none of
 * which the Patterns tab needs) just to stay consistent, this route runs
 * the same loadFounderIntelligence() pipeline (the compute cost is the
 * same either way — the merge genuinely depends on the execution-signature
 * and learned-pattern steps, there's no cheaper equivalent) and returns
 * only the two arrays plus the confidence score that gates their display.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const admin = createAdminClient();
  const url = new URL(request.url);
  let projectId = url.searchParams.get("projectId") || "";

  // Same fallback app/api/founder-context/mirror/route.ts uses, so a
  // founder who doesn't pass a projectId gets the identical resolved
  // project — and therefore the identical list — on both pages.
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

  return NextResponse.json({
    ok: true,
    data: {
      strengths: state.founder.strengths,
      avoidance_patterns: state.founder.avoidance_patterns,
      confidence: state.founder.confidence,
    },
  });
}
