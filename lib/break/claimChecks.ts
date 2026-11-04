/**
 * lib/break/claimChecks.ts — saved checks of single claims (see InvestigateClaim) and what
 * they change. Pure and client-safe. A check is one focused agent run; "settled" means the
 * founder confirmed a well-sourced finding that agrees with the check's overall status.
 */
import type { ClaimStatus, EvidenceTier } from "@/lib/evidence";

export interface SavedFinding {
  id: string;
  title: string;
  evidence: string;
  positive: boolean;
  confidence: number;
  sources: string[];
  counter_evidence: string | null;
  tier: EvidenceTier;
  /** true confirmed by the founder, false rejected, null not reviewed. */
  confirmed: boolean | null;
}

export interface SavedCheck {
  runId: string;
  focus: string;
  agentType: string;
  status: ClaimStatus;
  completedAt: string | null;
  findings: SavedFinding[];
}

export const normClaim = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[\s.…]+$/g, "").trim();

export function findCheck(checks: SavedCheck[] | undefined, claim: string): SavedCheck | undefined {
  const n = normClaim(claim);
  return (checks ?? []).find((c) => normClaim(c.focus) === n);
}

const WELL_SOURCED = (f: SavedFinding) => f.tier === "supported" || f.tier === "decision_grade";

/** "supported" or "contradicted" only when a well-sourced finding that agrees with the status was confirmed. */
export function settledStatus(check: SavedCheck | undefined): "supported" | "contradicted" | null {
  if (!check) return null;
  if (check.status === "supported" && check.findings.some((f) => f.positive && f.confirmed === true && WELL_SOURCED(f))) return "supported";
  if (check.status === "contradicted" && check.findings.some((f) => !f.positive && f.confirmed === true && WELL_SOURCED(f))) return "contradicted";
  return null;
}

export function settledChecks(checks: SavedCheck[] | undefined): Array<SavedCheck & { settled: "supported" | "contradicted" }> {
  const out: Array<SavedCheck & { settled: "supported" | "contradicted" }> = [];
  for (const c of checks ?? []) { const s = settledStatus(c); if (s) out.push({ ...c, settled: s }); }
  return out;
}

/** How a claim reads once checked. Supported and confirmed becomes evidence; contradicted stays flagged. */
export function effectiveClaim<T extends { claim: string; kind: string; source: string }>(cl: T, checks: SavedCheck[] | undefined): T & { contradicted?: boolean } {
  const check = findCheck(checks, cl.claim);
  const s = settledStatus(check);
  if (s === "supported") {
    const n = check!.findings.filter((f) => f.positive && f.confirmed === true && WELL_SOURCED(f)).length;
    return { ...cl, kind: "evidence", source: `Checked against sources and confirmed by you (${n} finding${n === 1 ? "" : "s"})` };
  }
  if (s === "contradicted") return { ...cl, source: "Checked: sources contradict this, and you confirmed it", contradicted: true };
  return cl;
}

/** Lines for the analysis prompts. Only settled checks are passed as fact. */
export function settledLines(checks: SavedCheck[] | undefined, max = 6): string[] {
  return settledChecks(checks).slice(0, max).map((c) =>
    c.settled === "supported"
      ? `CONFIRMED by the founder from sources: ${c.focus}`
      : `CONFIRMED FALSE by the founder from sources: ${c.focus}`);
}

export function checkCounts(checks: SavedCheck[] | undefined): { checked: number; settled: number } {
  return { checked: (checks ?? []).length, settled: settledChecks(checks).length };
}

/** Add a finished check, replacing an earlier check of the same claim. */
export function upsertCheck(checks: SavedCheck[], c: SavedCheck): SavedCheck[] {
  return [c, ...checks.filter((x) => normClaim(x.focus) !== normClaim(c.focus))];
}

/** Record the founder's answer on one finding. */
export function applyReview(checks: SavedCheck[], runId: string, findingId: string, confirmed: boolean): SavedCheck[] {
  return checks.map((c) => c.runId !== runId ? c : { ...c, findings: c.findings.map((f) => f.id === findingId ? { ...f, confirmed } : f) });
}
