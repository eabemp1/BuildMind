/** Loads the real rows behind the investor snapshot. Read-only. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchBacklog } from "@/lib/coachActions/backlog";
import { loadConnectedFacts } from "@/lib/integrations/facts";
import { REVENUE_LABEL } from "@/lib/integrations/revenue/types";
import { buildPmfRungs } from "@/lib/pmf/ladder";
import { loadPmfInputs } from "@/lib/server/pmfLadder";
import { buildInvestorVisual } from "@/lib/investor/visual";

export async function loadInvestorVisual(admin: SupabaseClient, userId: string, projectId: string, now?: Date) {
  const [backlog, facts, project, people, pmfIn] = await Promise.all([
    fetchBacklog(admin, userId, projectId).catch(() => null),
    loadConnectedFacts(admin, userId, { maxAgeMs: 6 * 3600_000 }).catch(() => null),
    admin.from("projects").select("name,title,startup_stage").eq("id", projectId).eq("user_id", userId).maybeSingle().then((r) => r.data as { name?: string; title?: string; startup_stage?: string } | null, () => null),
    admin.from("conversation_people").select("status,project_id").eq("user_id", userId).limit(500).then((r) => (r.data ?? []) as Array<{ status: string; project_id: string | null }>, () => []),
    loadPmfInputs(admin, userId, projectId).catch(() => null),
  ]);
  const mine = people.filter((p) => !p.project_id || p.project_id === projectId);
  const rungs = pmfIn ? buildPmfRungs(pmfIn) : null;
  const live = (facts?.revenue ?? []).filter((r) => r.mode !== "test" && !r.selfReported);
  const ms = backlog && backlog.ok ? backlog.milestones : [];
  const ts = backlog && backlog.ok ? backlog.tasks : [];
  return buildInvestorVisual({
    projectName: project?.name ?? project?.title,
    stage: project?.startup_stage ?? null,
    revenue: live.map((r) => ({ source: REVENUE_LABEL[r.provider] ?? r.provider, payingCustomers: r.payingCustomers, recurringKnown: r.recurringKnown, mrr: r.mrr ?? {}, last30d: r.last30d ?? {}, paymentsLast30d: r.paymentsLast30d })),
    search: facts?.search ? { clicks: facts.search.clicks, impressions: facts.search.impressions } : null,
    github: facts?.github ? { repo: facts.github.repo, mergedPRs30d: facts.github.mergedPRs30d, commits30d: facts.github.commits30d, shipped: facts.github.shipped } : null,
    milestones: { total: ms.length, done: ms.filter((m) => m.status === "completed").length },
    tasks: { total: ts.length, done: ts.filter((t) => t.is_completed).length },
    people: { reached: mine.filter((p) => p.status !== "to_contact").length, talked: mine.filter((p) => p.status === "done").length },
    pmf: rungs ? { observed: rungs.filter((r) => r.state === "observed").length, total: rungs.length } : null,
  }, now);
}
