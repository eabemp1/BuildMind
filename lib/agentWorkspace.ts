/**
 * lib/agentWorkspace.ts — pure aggregation for the Agents workspace.
 * Everything shown (track record, evidence mix, verdict trail) is computed
 * from the founder's own runs and findings; nothing is estimated.
 */
export type AgentKind = "research" | "validation" | "competitor";
export type Verdict = "proceed" | "pivot" | "kill" | "inconclusive";

export interface RunLite {
  id: string; agent_type: AgentKind; status: string; verdict: Verdict | null;
  confidence_pct: number; signals_found: number; started_at: string; completed_at: string | null;
  iteration?: number; max_iterations?: number;
}
export interface FindingLite {
  id: string; run_id?: string; iteration: number; positive: boolean; confidence: number;
  founder_confirmed: boolean | null; signal_type?: string;
}

export interface CrewStat {
  agent: AgentKind;
  runs: number;
  completed: number;
  signals: number;
  avgConfidence: number | null;
  lastVerdict: Verdict | null;
  lastRunAt: string | null;
  reviewed: number;
  confirmed: number;
  /** confirmed / reviewed, null until the founder has reviewed something. */
  confirmRate: number | null;
  /** Newest last, for drawing a trail. */
  trail: Array<{ id: string; verdict: Verdict | null; confidence: number }>;
}

export function computeCrewStats(runs: RunLite[], findings: FindingLite[]): Record<AgentKind, CrewStat> {
  const out = {} as Record<AgentKind, CrewStat>;
  for (const agent of ["research", "validation", "competitor"] as AgentKind[]) {
    const mine = runs.filter((r) => r.agent_type === agent);
    const done = mine.filter((r) => r.status === "complete");
    const ids = new Set(mine.map((r) => r.id));
    const fs = findings.filter((f) => f.run_id && ids.has(f.run_id));
    const reviewed = fs.filter((f) => f.founder_confirmed !== null).length;
    const confirmed = fs.filter((f) => f.founder_confirmed === true).length;
    const sorted = [...done].sort((a, b) => +new Date(b.started_at) - +new Date(a.started_at));
    out[agent] = {
      agent, runs: mine.length, completed: done.length,
      signals: done.reduce((s, r) => s + (r.signals_found || 0), 0),
      avgConfidence: done.length ? Math.round(done.reduce((s, r) => s + (r.confidence_pct || 0), 0) / done.length) : null,
      lastVerdict: sorted[0]?.verdict ?? null,
      lastRunAt: sorted[0]?.started_at ?? null,
      reviewed, confirmed,
      confirmRate: reviewed ? Math.round((confirmed / reviewed) * 100) : null,
      trail: [...sorted].reverse().slice(-8).map((r) => ({ id: r.id, verdict: r.verdict, confidence: r.confidence_pct })),
    };
  }
  return out;
}

export interface EvidenceMix {
  total: number; positive: number; negative: number; pending: number; confirmed: number; rejected: number;
  avgConfidence: number | null;
  /** Per research cycle: how many findings pointed each way. */
  byCycle: Array<{ cycle: number; positive: number; negative: number }>;
}

export function computeEvidenceMix(findings: FindingLite[]): EvidenceMix {
  const cycles = new Map<number, { positive: number; negative: number }>();
  for (const f of findings) {
    const c = cycles.get(f.iteration) ?? { positive: 0, negative: 0 };
    if (f.positive) c.positive += 1; else c.negative += 1;
    cycles.set(f.iteration, c);
  }
  return {
    total: findings.length,
    positive: findings.filter((f) => f.positive).length,
    negative: findings.filter((f) => !f.positive).length,
    pending: findings.filter((f) => f.founder_confirmed === null).length,
    confirmed: findings.filter((f) => f.founder_confirmed === true).length,
    rejected: findings.filter((f) => f.founder_confirmed === false).length,
    avgConfidence: findings.length ? Math.round((findings.reduce((s, f) => s + f.confidence, 0) / findings.length) * 100) : null,
    byCycle: [...cycles.entries()].sort((a, b) => a[0] - b[0]).map(([cycle, v]) => ({ cycle, ...v })),
  };
}

export const caseNumber = (id: string) => `CASE-${id.replace(/[^a-z0-9]/gi, "").slice(0, 5).toUpperCase()}`;
