/**
 * lib/server/claimChecks.ts — load saved single-claim checks (agent_runs whose mission is "Check: …")
 * with their findings, newest first, one per claim. Server only. Never throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { claimStatus, classifyFinding, type EvidenceTier } from "@/lib/evidence";
import { normClaim, type SavedCheck } from "@/lib/break/claimChecks";

type Row = Record<string, unknown>;
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export async function loadClaimChecks(
  admin: SupabaseClient,
  userId: string,
  opts: { projectId?: string | null; runId?: string; limit?: number },
): Promise<SavedCheck[]> {
  try {
    let q = admin.from("agent_runs")
      .select("id,agent_type,mission,completed_at,status,project_id")
      .eq("user_id", userId).like("mission", "Check: %").eq("status", "complete")
      .order("started_at", { ascending: false }).limit(opts.limit ?? 40);
    if (opts.runId) q = q.eq("id", opts.runId);
    else if (opts.projectId) q = q.eq("project_id", opts.projectId);
    const { data: runs } = await q;
    if (!runs?.length) return [];
    const { data: rows } = await admin.from("agent_findings").select("*").in("run_id", runs.map((r: Row) => r.id as string)).limit(600);
    const byRun = new Map<string, Row[]>();
    for (const f of (rows ?? []) as Row[]) { const k = f.run_id as string; byRun.set(k, [...(byRun.get(k) ?? []), f]); }
    const seen = new Set<string>();
    const out: SavedCheck[] = [];
    for (const r of runs as Row[]) {
      const focus = String(r.mission ?? "").replace(/^Check:\s*/, "").trim();
      if (!focus || seen.has(normClaim(focus))) continue;
      seen.add(normClaim(focus));
      const findings = (byRun.get(r.id as string) ?? []).map((f) => {
        const base = { signal_type: String(f.signal_type ?? ""), source_type: String(f.source_type ?? "reasoning"), evidence: String(f.evidence ?? ""), confidence: Number(f.confidence ?? 0), sources: arr(f.sources), counter_evidence: (f.counter_evidence as string | null) ?? null, positive: Boolean(f.positive) };
        const tier = ((f.evidence_tier as EvidenceTier | null) ?? classifyFinding(base as never).tier) as EvidenceTier;
        return { base, saved: { id: String(f.id), title: String(f.title ?? ""), evidence: base.evidence, positive: base.positive, confidence: base.confidence, sources: base.sources, counter_evidence: base.counter_evidence, tier, confirmed: typeof f.founder_confirmed === "boolean" ? f.founder_confirmed : null } };
      });
      out.push({
        runId: String(r.id), focus, agentType: String(r.agent_type ?? "research"),
        status: claimStatus(findings.map((x) => ({ ...x.base, evidence_tier: x.saved.tier }) as never)),
        completedAt: (r.completed_at as string | null) ?? null,
        findings: findings.map((x) => x.saved),
      });
    }
    return out;
  } catch { return []; }
}
