/**
 * lib/agentToToday.ts - connects the Agent crew's findings to Today.
 *
 * Until now a finding the founder confirmed sat on the Agents page and never changed what Today asked
 * them to do. This module turns findings into two kinds of Today evidence:
 *
 *  - CONFIRMED: the founder verified the finding (or it is decision-grade and they confirmed it).
 *    It can become a task candidate ("agent_finding") and gets a small ranking boost, with the finding,
 *    its evidence tier and its source count attached so the founder can see why the task appeared.
 *  - RECHECK: the founder confirmed the finding as a hypothesis but it rests on one source (or on
 *    reasoning alone). After a few days it becomes a re-check task ("agent_recheck") so a thin claim is
 *    tested instead of quietly hardening into a belief.
 *
 * Rejected findings never appear. Unreviewed findings never appear: the founder has not vouched for
 * them. Nothing here writes to the database or contacts anyone. Pure and deterministic except for the
 * small loader at the bottom.
 */

import type { EvidenceTier } from "@/lib/evidence";

export interface AgentFindingRow {
  id: string;
  title: string;
  evidence?: string | null;
  action_hint?: string | null;
  signal_type?: string | null;
  positive?: boolean | null;
  confidence?: number | null;
  evidence_tier?: string | null;
  source_count?: number | null;
  verification_status?: string | null;
  founder_confirmed?: boolean | null;
  confirmed_at?: string | null;
  created_at?: string | null;
  caveat?: string | null;
}

export type AgentEvidenceKind = "confirmed" | "recheck" | "break_test";

export interface AgentEvidenceItem {
  finding_id: string;
  kind: AgentEvidenceKind;
  title: string;
  action_hint: string;
  tier: EvidenceTier;
  source_count: number;
  confidence: number;
  confirmed_at: string | null;
}

export interface AgentTodayEvidence {
  confirmed: AgentEvidenceItem[];
  recheck: AgentEvidenceItem[];
  /** The riskiest open test from the founder's latest Break My Startup analysis. A prediction, not a verified fact. */
  breakTest: AgentEvidenceItem | null;
  /** Changes whenever the set of findings changes; a cached same-day decision is dropped when it differs. */
  key: string;
}

export const EMPTY_AGENT_EVIDENCE: AgentTodayEvidence = { confirmed: [], recheck: [], breakTest: null, key: "" };

/** A confirmed finding stops steering Today after this long: the market moves. */
export const CONFIRMED_MAX_AGE_DAYS = 21;
/** A single-source hypothesis becomes a re-check reminder after this many days (not on day zero). */
export const RECHECK_AFTER_DAYS = 3;

const DAY = 86_400_000;
const TIERS: EvidenceTier[] = ["signal", "supported", "decision_grade"];
const TIER_RANK: Record<EvidenceTier, number> = { signal: 0, supported: 1, decision_grade: 2 };

function asTier(v: unknown): EvidenceTier {
  return TIERS.includes(v as EvidenceTier) ? (v as EvidenceTier) : "signal";
}

function clean(s: string | null | undefined, max: number): string {
  return String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function ageDays(row: AgentFindingRow, now: Date): number {
  const t = Date.parse(row.confirmed_at ?? row.created_at ?? "");
  return Number.isFinite(t) ? Math.max(0, (now.getTime() - t) / DAY) : 0;
}

/**
 * Decide which findings reach Today. `rows` should already be scoped to the founder's project.
 */
export function selectAgentEvidence(rows: AgentFindingRow[], now: Date = new Date()): AgentTodayEvidence {
  const confirmed: AgentEvidenceItem[] = [];
  const recheck: AgentEvidenceItem[] = [];

  for (const r of rows ?? []) {
    if (!r || !r.id) continue;
    if (r.founder_confirmed !== true) continue; // unreviewed or rejected: the founder has not vouched for it
    if (r.verification_status === "rejected") continue;
    const title = clean(r.title, 140);
    const hint = clean(r.action_hint, 220);
    if (!title || hint.length < 15) continue; // nothing concrete to do with it
    const tier = asTier(r.evidence_tier);
    const sourceCount = Math.max(0, Math.floor(Number(r.source_count) || 0));
    const age = ageDays(r, now);
    if (age > CONFIRMED_MAX_AGE_DAYS) continue;
    const confidence = Math.max(0, Math.min(1, Number(r.confidence) || 0));
    const item = {
      finding_id: r.id,
      title,
      action_hint: hint,
      tier,
      source_count: sourceCount,
      confidence,
      confirmed_at: r.confirmed_at ?? null,
    };

    // Legacy rows have no verification_status: only a supported or decision-grade tier counts as verified.
    const verified = r.verification_status === "founder_verified"
      || (!r.verification_status && TIER_RANK[tier] >= 1);

    if (verified) {
      confirmed.push({ ...item, kind: "confirmed" });
    } else if (sourceCount <= 1 && age >= RECHECK_AFTER_DAYS) {
      recheck.push({ ...item, kind: "recheck" });
    }
  }

  const byStrength = (a: AgentEvidenceItem, b: AgentEvidenceItem) =>
    TIER_RANK[b.tier] - TIER_RANK[a.tier] || b.confidence - a.confidence || a.finding_id.localeCompare(b.finding_id);
  confirmed.sort(byStrength);
  recheck.sort(byStrength);
  const topConfirmed = confirmed.slice(0, 3);
  const topRecheck = recheck.slice(0, 2);
  const key = [...topConfirmed, ...topRecheck].map((i) => `${i.kind[0]}${i.finding_id.slice(0, 8)}`).join(",");
  return { confirmed: topConfirmed, recheck: topRecheck, breakTest: null, key };
}

/** A saved Break My Startup analysis (table break_predictions). */
export interface BreakPredictionRow {
  id: string;
  project_id?: string | null;
  created_at?: string | null;
  tests?: Array<{ id?: string; assumption?: string; test?: string; provenWrongIf?: string; predictedHold?: number; status?: string }> | null;
}

/** A teardown test stops steering Today after this long. */
export const BREAK_TEST_MAX_AGE_DAYS = 21;

/**
 * The riskiest open test from the newest analysis (the assumption the teardown itself rated least likely to hold).
 * It is the system's own prediction, so it is offered as something to test, never presented as established.
 */
export function selectBreakTest(rows: BreakPredictionRow[], projectId: string | null | undefined, now: Date = new Date()): AgentEvidenceItem | null {
  const fresh = (rows ?? [])
    .filter((r) => r && r.id && (!r.project_id || !projectId || r.project_id === projectId))
    .filter((r) => { const t = Date.parse(r.created_at ?? ""); return Number.isFinite(t) && (now.getTime() - t) / DAY <= BREAK_TEST_MAX_AGE_DAYS; })
    .sort((a, b) => Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? ""));
  const row = fresh[0];
  if (!row) return null;
  const open = (row.tests ?? [])
    .filter((t) => t && t.status === "open" && clean(t.test, 300).length >= 15 && clean(t.assumption, 200).length >= 5)
    .sort((a, b) => (Number(a.predictedHold) || 0.5) - (Number(b.predictedHold) || 0.5));
  const t = open[0];
  if (!t) return null;
  const hold = Math.max(0, Math.min(1, Number(t.predictedHold) || 0.5));
  return {
    finding_id: `break:${row.id.slice(0, 8)}:${clean(t.id, 20) || "t"}`,
    kind: "break_test",
    title: clean(t.assumption, 140),
    action_hint: clean(t.test, 220),
    tier: "signal",
    source_count: 0,
    confidence: 0.8,
    confirmed_at: row.created_at ?? null,
    // Carried for the rationale, not shown as a score.
    ...( { predictedHold: hold, provenWrongIf: clean(t.provenWrongIf, 200) } as object ),
  } as AgentEvidenceItem;
}

/** Ranking boost for a finding-backed task: a verified, decision-grade finding outranks a generic probe. */
export function agentRankingBoost(item: Pick<AgentEvidenceItem, "kind" | "tier">): number {
  if (item.kind === "break_test") return 4;
  if (item.kind === "recheck") return 0;
  return item.tier === "decision_grade" ? 8 : item.tier === "supported" ? 5 : 3;
}

export function tierPhrase(item: Pick<AgentEvidenceItem, "tier" | "source_count">): string {
  const label = item.tier === "decision_grade" ? "decision-grade" : item.tier === "supported" ? "supported" : "early signal";
  const n = item.source_count;
  return `${label}, ${n === 0 ? "no external source" : n === 1 ? "1 source" : `${n} sources`}`;
}

function sentence(s: string): string {
  const t = s.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** Candidate templates for buildDecisionState. At most one of each. */
export function agentCandidateTemplates(ev: AgentTodayEvidence | null | undefined): Array<{
  id: "agent_finding" | "agent_recheck" | "break_test";
  action: string;
  rationale: string;
  expected_evidence: string;
  supporting_signals: never[];
  evidence: AgentEvidenceItem;
}> {
  const out: ReturnType<typeof agentCandidateTemplates> = [];
  const c = ev?.confirmed[0];
  if (c) {
    out.push({
      id: "agent_finding",
      action: sentence(c.action_hint),
      rationale: `Your Agent crew found "${c.title}" (${tierPhrase(c)}) and you confirmed it. Acting on it now turns research into a real result.`,
      expected_evidence: "A real-world reaction that supports or contradicts the finding.",
      supporting_signals: [],
      evidence: c,
    });
  }
  const r = ev?.recheck[0];
  if (r) {
    out.push({
      id: "agent_recheck",
      action: `Re-check one claim from your Agent crew ("${r.title}"): find a second independent source, or ask 2 people in your target market whether it matches what they see, then write down what you found.`,
      rationale: `"${r.title}" rests on ${r.source_count === 0 ? "reasoning alone" : "a single source"}. A thin claim should be tested before it shapes decisions.`,
      expected_evidence: "A second source or two direct answers that confirm, weaken or overturn the finding.",
      supporting_signals: [],
      evidence: r,
    });
  }
  const b = ev?.breakTest as (AgentEvidenceItem & { predictedHold?: number; provenWrongIf?: string }) | null | undefined;
  if (b) {
    const pct = typeof b.predictedHold === "number" ? Math.round(b.predictedHold * 100) : null;
    out.push({
      id: "break_test",
      action: sentence(b.action_hint),
      rationale: `Your Break My Startup teardown flagged this assumption${pct !== null ? ` (rated about ${pct}% likely to hold)` : ""}: "${b.title}". It is a prediction, not a fact, so the way to settle it is to run the test.`,
      expected_evidence: b.provenWrongIf ? `A real result. It would be proven wrong if: ${b.provenWrongIf}` : "A real result that supports or contradicts the assumption.",
      supporting_signals: [],
      evidence: b,
    });
  }
  return out;
}

/** Prompt block so the task writer sees the evidence and cites it. Empty when there is none. */
export function agentPromptBlock(ev: AgentTodayEvidence | null | undefined): string {
  if (!ev || (!ev.confirmed.length && !ev.recheck.length && !ev.breakTest)) return "";
  const lines = ["AGENT CREW EVIDENCE (findings the founder reviewed; treat tier and source count as the limit of what can be claimed):"];
  for (const i of ev.confirmed) lines.push(`- CONFIRMED (${tierPhrase(i)}): ${i.title}. Suggested move: ${i.action_hint}`);
  for (const i of ev.recheck) lines.push(`- NEEDS RE-CHECK (${tierPhrase(i)}): ${i.title}. Do not build on it until a second source or two direct answers agree.`);
  if (ev.breakTest) lines.push(`- FROM THEIR BREAK MY STARTUP TEARDOWN (a prediction, not a fact): assumption "${ev.breakTest.title}". Suggested test: ${ev.breakTest.action_hint}`);
  lines.push("INSTRUCTION: if today's task is based on one of these findings, name it (for the teardown, say 'from your teardown'). Never present a re-check item or a teardown prediction as established fact.");
  return lines.join("\n");
}

type SupabaseLike = { from: (table: string) => any };

/** Reads the founder's reviewed findings for one project, plus the riskiest open test from their latest teardown. Never throws; returns empty evidence on any failure. */
export async function loadAgentEvidence(
  supabase: SupabaseLike,
  userId: string,
  projectId: string | null | undefined,
  now: Date = new Date(),
): Promise<AgentTodayEvidence> {
  if (!userId) return EMPTY_AGENT_EVIDENCE;
  const [found, breakTest] = await Promise.all([loadFindings(supabase, userId, projectId, now), loadBreakTest(supabase, userId, projectId, now)]);
  if (!breakTest) return found;
  return { ...found, breakTest, key: [found.key, `b${breakTest.finding_id}`].filter(Boolean).join(",") };
}

async function loadBreakTest(supabase: SupabaseLike, userId: string, projectId: string | null | undefined, now: Date): Promise<AgentEvidenceItem | null> {
  try {
    const res = await supabase.from("break_predictions").select("id, project_id, tests, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(3);
    if (res?.error) return null;
    return selectBreakTest((res?.data ?? []) as BreakPredictionRow[], projectId, now);
  } catch {
    return null;
  }
}

async function loadFindings(supabase: SupabaseLike, userId: string, projectId: string | null | undefined, now: Date): Promise<AgentTodayEvidence> {
  try {
    if (!projectId) return EMPTY_AGENT_EVIDENCE;
    const since = new Date(now.getTime() - (CONFIRMED_MAX_AGE_DAYS + 9) * DAY).toISOString();
    const runsRes = await supabase
      .from("agent_runs")
      .select("id")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .gte("started_at", since)
      .limit(40);
    const runIds: string[] = (runsRes?.data ?? []).map((r: { id: string }) => r.id).filter(Boolean);
    if (!runIds.length) return EMPTY_AGENT_EVIDENCE;
    const findingsRes = await supabase
      .from("agent_findings")
      .select("*")
      .eq("user_id", userId)
      .in("run_id", runIds)
      .eq("founder_confirmed", true)
      .limit(60);
    if (findingsRes?.error) return EMPTY_AGENT_EVIDENCE;
    return selectAgentEvidence((findingsRes?.data ?? []) as AgentFindingRow[], now);
  } catch {
    return EMPTY_AGENT_EVIDENCE;
  }
}
