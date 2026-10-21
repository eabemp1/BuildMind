"use client";

/**
 * app/agents/page.tsx — Agent Workforce, as a mission-control workspace.
 *
 * Crew board (each agent's real track record), live operations console while
 * a run is going, a case file for the result (verdict stamp, evidence ledger,
 * findings to review) and a case archive of earlier runs. Everything drawn is
 * computed from the founder's own runs and findings (lib/agentWorkspace.ts).
 * Run persists via localStorage so navigating away and back resumes polling.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useActiveProjectId } from "@/lib/queries";
import { usePlan } from "@/lib/usePlan";
import { AGENT_IDENTITY, type AgentType } from "@/lib/agentWorkforce";
import { RadialGauge } from "@/components/charts";
import { OpenBesideButton } from "@/components/layout/OpenBesideButton";
import { computeCrewStats, computeEvidenceMix, caseNumber } from "@/lib/agentWorkspace";
import { classifyFinding, runReadiness, frameVerdict, evidenceStrength, scoreExplainer, TIER_LABEL, TIER_MEANING } from "@/lib/evidence";
import { AGENT_THEME, AgentsHeader, AgentEmblem, CaseArchive, CrewCard, Dossier, EvidenceLedger, OpsConsole, VERDICT_THEME, VerdictStamp } from "@/components/agents/parts";

interface AgentRun {
  id:                 string;
  agent_type:         AgentType;
  status:             "queued" | "running" | "complete" | "abandoned" | "error";
  mission:            string;
  current_action:     string | null;
  iteration:          number;
  max_iterations:     number;
  signals_found:      number;
  confidence_pct:     number;
  verdict:            "proceed" | "pivot" | "kill" | "inconclusive" | null;
  top_finding_1:      string | null;
  top_finding_2:      string | null;
  top_finding_3:      string | null;
  top_risk:           string | null;
  recommended_action: string | null;
  report_markdown:    string | null;
  started_at:         string;
  completed_at:       string | null;
}

interface AgentFinding {
  id:                string;
  run_id?:           string;
  iteration:         number;
  signal_type:       string;
  positive:          boolean;
  confidence:        number;
  title:             string;
  evidence:          string;
  action_hint:       string | null;
  founder_confirmed: boolean | null;
  sources?:             string[] | null;
  counter_evidence?:    string | null;
  assumptions?:         string | null;
  source_type?:         string | null;
  verification_status?: string | null;
}

const STORAGE_KEY = "bm_agent_run_id";
const MONO = "'DM Mono', ui-monospace, monospace";
const lbl: React.CSSProperties = { fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--bm-text3)" };


// ── Finding card ──

function FindingCard({
  finding, onConfirm,
}: {
  finding: AgentFinding;
  onConfirm: (id: string, confirmed: boolean, opts?: { verifiedByFounder?: boolean }) => void;
}) {
  const [acting, setActing] = useState(false);
  const [checked, setChecked] = useState(false);
  const cls = useMemo(() => classifyFinding(finding), [finding]);
  const isOpp = finding.signal_type === "pivot_candidate";
  const tierLabel = isOpp ? "Opportunity to test" : TIER_LABEL[cls.tier];
  const tierColor = cls.tier === "decision_grade" ? "var(--bm-green)" : cls.tier === "supported" ? "var(--bm-accent)" : "var(--bm-amber)";

  const handle = (confirmed: boolean) => {
    setActing(true);
    onConfirm(finding.id, confirmed, { verifiedByFounder: checked });
  };

  if (finding.founder_confirmed === true) {
    return (
      <div style={{
        padding: "12px 14px", background: "var(--bm-green-dim)",
        border: "1px solid var(--bm-green-bd)", borderRadius: 10, opacity: 0.7,
      }}>
        <div style={{ fontSize: 11.5, color: "var(--bm-green)", fontWeight: 600 }}>✓ {finding.title}</div>
        <div style={{ fontSize: 10.5, color: "var(--bm-text3)", marginTop: 2 }}>
          {finding.verification_status === "unverified_hypothesis" ? "Saved as an unverified hypothesis" : "Verified by you"} · {tierLabel}
        </div>
      </div>
    );
  }

  if (finding.founder_confirmed === false) {
    return (
      <div style={{
        padding: "12px 14px", background: "var(--bm-red-dim)",
        border: "1px solid var(--bm-red-bd)", borderRadius: 10, opacity: 0.5,
      }}>
        <div style={{ fontSize: 11.5, color: "var(--bm-red)", fontWeight: 600 }}>✕ {finding.title}</div>
        <div style={{ fontSize: 10.5, color: "var(--bm-text3)", marginTop: 2 }}>Rejected</div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background:   "var(--bm-bg2)",
        border:       "1px solid var(--bm-border)",
        borderRadius: 12,
        padding:      "14px 16px",
        minWidth:     0,
        overflow:     "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
        <span className="bm-status-dot" style={{ background: finding.positive ? "var(--bm-green)" : "var(--bm-red)", marginTop: 5 }} />
        <div style={{ flexShrink: 0, marginTop: -2 }}>
          <RadialGauge
            value={Math.round(finding.confidence * 100)}
            size={36}
            strokeWidth={3.5}
            thresholds={[
              { min: 70, color: "var(--bm-green)" },
              { min: 50, color: "var(--bm-accent)" },
              { min: 0, color: "var(--bm-red)" },
            ]}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--bm-text)", marginBottom: 3 }}>
            {finding.positive ? "📈 " : "📉 "}{finding.title}
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 9, color: "var(--bm-text4)", fontFamily: "'DM Mono', monospace" }}>
              {finding.signal_type.replace(/_/g, " ")}
            </span>
            <span title={TIER_MEANING[cls.tier]} style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: tierColor, border: `1px solid ${tierColor}`, borderRadius: 4, padding: "0 5px" }}>
              {tierLabel}
            </span>
            <span style={{ fontSize: 9, color: "var(--bm-text4)", fontFamily: "'DM Mono', monospace" }}>
              {cls.sourceCount} source{cls.sourceCount === 1 ? "" : "s"} · {Math.round(finding.confidence * 100)}% conf.
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--bm-text2)", lineHeight: 1.6, marginBottom: 6 }}>
            {finding.evidence}
          </div>
          {cls.caveat && (
            <div style={{ fontSize: 11, color: "var(--bm-amber)", marginBottom: 6 }}>{cls.caveat}</div>
          )}
          {(finding.assumptions || finding.counter_evidence) && (
            <div style={{ display: "grid", gap: 3, fontSize: 11, color: "var(--bm-text3)", marginBottom: 6 }}>
              {finding.assumptions && <div><b style={{ color: "var(--bm-text2)" }}>Holds if:</b> {finding.assumptions}</div>}
              {finding.counter_evidence && <div><b style={{ color: "var(--bm-text2)" }}>Against:</b> {finding.counter_evidence}</div>}
            </div>
          )}
          {finding.action_hint && (
            <div style={{
              fontSize: 11.5, color: "var(--bm-accent)",
              borderLeft: "2px solid var(--bm-border)", paddingLeft: 8,
            }}>
              → {finding.action_hint}
            </div>
          )}
        </div>
      </div>

      {cls.tier === "signal" && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--bm-text3)", paddingTop: 10, borderTop: "1px solid var(--bm-border)", cursor: "pointer" }}>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          I have checked this myself (interviews, data, my own research)
        </label>
      )}
      <div style={{ display: "flex", gap: 6, paddingTop: 10, ...(cls.tier === "signal" ? {} : { borderTop: "1px solid var(--bm-border)" }) }}>
        <button
          onClick={() => handle(true)}
          disabled={acting}
          style={{
            flex: 1, padding: "7px 0",
            background: "var(--bm-green-dim)", border: "1px solid var(--bm-green-bd)",
            borderRadius: 7, color: "var(--bm-green)",
            fontSize: 12, fontWeight: 600,
            cursor: acting ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}
        >
          {cls.tier === "signal" && !checked ? "Save as hypothesis" : "Confirm"}
        </button>
        <button
          onClick={() => handle(false)}
          disabled={acting}
          style={{
            flex: 1, padding: "7px 0",
            background: "var(--bm-red-dim)", border: "1px solid var(--bm-red-bd)",
            borderRadius: 7, color: "var(--bm-red)",
            fontSize: 12, fontWeight: 600,
            cursor: acting ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}
        >
          Reject
        </button>
      </div>
    </motion.div>
  );
}

// ── Case file (result) ────────────────────────────────────────────────────────

function CaseFile({ run, pendingCount, findings }: { run: AgentRun; pendingCount: number; findings: AgentFinding[] }) {
  const identity = AGENT_IDENTITY[run.agent_type];
  const t = AGENT_THEME[run.agent_type];
  const v = VERDICT_THEME[run.verdict ?? "inconclusive"];
  const tops = [run.top_finding_1, run.top_finding_2, run.top_finding_3].filter(Boolean) as string[];
  const mix = useMemo(() => computeEvidenceMix(findings), [findings]);
  const readiness = useMemo(() => runReadiness(findings), [findings]);
  const strength = useMemo(() => evidenceStrength(findings), [findings]);
  const framed = useMemo(() => frameVerdict(run.verdict ?? "inconclusive", readiness), [run.verdict, readiness]);
  return (
    <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
      <Dossier accent={t.c} style={{ padding: 14, minWidth: 0, overflowWrap: "anywhere" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
          <AgentEmblem agent={run.agent_type} size={36} />
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <div style={{ ...lbl, color: t.c }}>{caseNumber(run.id)} · {t.codename} · {new Date(run.started_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--bm-text)", margin: "3px 0", lineHeight: 1.35 }}>{run.mission}</div>
            <div style={{ fontSize: 11.5, color: "var(--bm-text3)" }}>{identity.name}{run.status !== "complete" ? ` · ${run.status}` : ""}</div>
          </div>
          {run.status === "complete" && run.verdict && (
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <VerdictStamp verdict={run.verdict} label={findings.length ? framed.label : undefined} />
              <div style={{ textAlign: "center" }} title="How confident the agent is in its own findings, on average">
                <RadialGauge value={run.confidence_pct} size={44} strokeWidth={4} thresholds={[{ min: 70, color: "var(--bm-green)" }, { min: 45, color: "var(--bm-accent)" }, { min: 0, color: "var(--bm-red)" }]} />
                <div style={{ ...lbl, marginTop: 2 }}>Avg. conf.</div>
              </div>
              {findings.length > 0 && (
                <div style={{ textAlign: "center" }} title="How well the findings are supported by independent sources">
                  <RadialGauge value={strength} size={44} strokeWidth={4} thresholds={[{ min: 65, color: "var(--bm-green)" }, { min: 35, color: "var(--bm-accent)" }, { min: 0, color: "var(--bm-amber)" }]} />
                  <div style={{ ...lbl, marginTop: 2 }}>Evidence</div>
                </div>
              )}
            </div>
          )}
        </div>

        {run.status === "complete" && run.verdict && (
          <>
            {findings.length > 0 && (
              <div style={{ marginTop: 14, fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.55 }}>
                <b style={{ color: "var(--bm-text2)" }}>{framed.label}.</b> {framed.note}{" "}
                <span>{readiness.counts.signal} signal{readiness.counts.signal === 1 ? "" : "s"}, {readiness.counts.supported} supported, {readiness.counts.decision_grade} decision-grade. {scoreExplainer()}</span>
              </div>
            )}
            {run.recommended_action && (
              <div style={{ marginTop: 16, padding: "12px 14px", background: v.dim, border: `1px solid ${v.bd}`, borderLeft: `3px solid ${v.c}`, borderRadius: 8 }}>
                <div style={{ ...lbl, color: v.c, marginBottom: 4 }}>Recommended action</div>
                <div style={{ fontSize: 13.5, color: "var(--bm-text)", lineHeight: 1.55 }}>{run.recommended_action}</div>
              </div>
            )}
            {tops.length > 0 && (
              <ol style={{ margin: "16px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                {tops.map((f, i) => (
                  <li key={i} style={{ display: "flex", gap: 10, fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.55, minWidth: 0 }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: t.c, background: t.dim, border: `1px solid ${t.bd}`, borderRadius: 4, padding: "2px 6px", height: "fit-content", flexShrink: 0 }}>F{i + 1}</span><span style={{ minWidth: 0 }}>{f}</span>
                  </li>
                ))}
              </ol>
            )}
            {run.top_risk && (
              <div style={{ marginTop: 14, padding: "10px 12px", background: "var(--bm-red-dim)", border: "1px solid var(--bm-red-bd)", borderRadius: 8 }}>
                <div style={{ ...lbl, color: "var(--bm-red)", marginBottom: 4 }}>Top risk</div>
                <div style={{ fontSize: 12.5, color: "var(--bm-text2)", lineHeight: 1.55 }}>{run.top_risk}</div>
              </div>
            )}
            <div style={{ marginTop: 14 }}>
              <OpenBesideButton label="Read the full report beside" request={{
                kind: "reader", eyebrow: `${identity.name} report`, title: run.mission, subtitle: v.label,
                facts: [{ label: "Confidence", value: `${run.confidence_pct}%` }, { label: "Signals", value: String(run.signals_found) }, { label: "Verdict", value: v.label }],
                markdown: run.report_markdown?.trim() || [
                  run.recommended_action ? `**Recommended action**\n\n${run.recommended_action}` : "",
                  tops.length ? `**Top findings**\n\n${tops.map((f) => `- ${f}`).join("\n")}` : "",
                  run.top_risk ? `**Top risk**\n\n${run.top_risk}` : "",
                ].filter(Boolean).join("\n\n"),
              }} />
            </div>
            {pendingCount > 0 && (
              <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)", borderRadius: 8, fontSize: 12, color: "var(--bm-accent)" }}>
                {pendingCount} finding{pendingCount !== 1 ? "s" : ""} waiting for your review below. Your decision is saved with how well each finding is supported.
              </div>
            )}
          </>
        )}
        {(run.status === "error" || run.status === "abandoned") && (
          <div style={{ marginTop: 14, fontSize: 13, color: "var(--bm-red)" }}>This run did not finish. Nothing was added to your context.</div>
        )}
      </Dossier>
      <EvidenceLedger mix={mix} />
    </div>
  );
}

// ── Main page ──

export default function AgentsPage() {
  // Deep link from Break My Startup: /agents?agent=competitor highlights that crew card.
  const [focusAgent, setFocusAgent] = useState<string | null>(null);
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get("agent");
    if (a === "competitor" || a === "research" || a === "validation") {
      setFocusAgent(a);
      window.setTimeout(() => document.getElementById(`crew-${a}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 400);
    }
  }, []);
  const { plan, isLoading: planLoading } = usePlan();
  const activeProjectId = useActiveProjectId();

  const [activeRun, setActiveRun]       = useState<AgentRun | null>(null);
  const [findings, setFindings]         = useState<AgentFinding[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [deploying, setDeploying]       = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [history, setHistory]           = useState<AgentRun[]>([]);
  const [histFindings, setHistFindings] = useState<AgentFinding[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch(`/api/agents/history${activeProjectId ? `?projectId=${encodeURIComponent(activeProjectId)}` : ""}`, { credentials: "include" });
      const j = await r.json();
      if (j.ok) { setHistory(j.runs ?? []); setHistFindings(j.findings ?? []); }
    } catch {}
  }, [activeProjectId]);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const loadFindings = useCallback(async (runId: string) => {
    const fRes = await fetch(`/api/agents/findings/${runId}`, { credentials: "include" });
    if (!fRes.ok) return;
    const fJson = await fRes.json();
    if (fJson.ok) setFindings([...fJson.data.pending, ...fJson.data.confirmed, ...fJson.data.rejected]);
  }, []);

  const openCase = useCallback(async (runId: string) => {
    const run = history.find((r) => r.id === runId);
    if (!run) return;
    setActiveRun(run); setPendingCount(0);
    await loadFindings(runId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [history, loadFindings]);



  const pollStatus = useCallback(async (runId: string) => {
    try {
      const res = await fetch(`/api/agents/status/${runId}`, { credentials: "include" });
      if (!res.ok) return;
      const json = await res.json();
      if (json.ok) {
        setActiveRun(json.data);
        setPendingCount(json.pendingReview ?? 0);
        if (["complete", "error", "abandoned"].includes(json.data.status)) {
          stopPolling();
          localStorage.removeItem(STORAGE_KEY);
          await loadFindings(runId);
          void loadHistory();
        }
      }
    } catch {}
  }, [stopPolling, loadFindings]);

  // Resume any in-progress run from localStorage on mount
  useEffect(() => {
    const savedRunId = localStorage.getItem(STORAGE_KEY);
    if (!savedRunId) return;
    pollStatus(savedRunId).then(() => {
      // If still running, start polling
      pollRef.current = setInterval(() => pollStatus(savedRunId), 2500);
    });
    return () => stopPolling();
  }, [pollStatus, stopPolling]);

  const handleDeploy = useCallback(async (agentType: AgentType) => {
    setDeploying(true);
    setError(null);
    setActiveRun(null);
    setFindings([]);
    stopPolling();

    try {
      const res = await fetch("/api/agents/run", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentType, projectId: activeProjectId }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setError(res.status === 403
          ? "Agent Workforce requires Builder plan."
          : (json.error ?? "Agent run failed — please retry."));
        setDeploying(false);
        return;
      }

      const runId = json.runId as string;
      localStorage.setItem(STORAGE_KEY, runId);

      // Synchronous route returns complete data immediately
      if (json.data) {
        setActiveRun(json.data);
        localStorage.removeItem(STORAGE_KEY);
        await loadFindings(runId);
        void loadHistory();
      } else {
        // Fallback: start polling if somehow still async
        pollRef.current = setInterval(() => pollStatus(runId), 2500);
      }
    } catch (e) {
      setError(String(e));
    }
    setDeploying(false);
  }, [activeProjectId, pollStatus, stopPolling, loadFindings]);

  const handleConfirm = useCallback(async (findingId: string, confirmed: boolean, opts?: { verifiedByFounder?: boolean }) => {
    try {
      const r = await fetch("/api/agents/confirm", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findingId, confirmed, verifiedByFounder: opts?.verifiedByFounder === true }),
      });
      const j = await r.json().catch(() => ({}));
      setFindings(prev => prev.map(f => f.id === findingId ? { ...f, founder_confirmed: confirmed, verification_status: j.verification_status ?? f.verification_status } : f));
      setPendingCount(prev => Math.max(0, prev - 1));
    } catch {}
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const crew = useMemo(() => computeCrewStats(history, histFindings), [history, histFindings]);
  const totalRuns = history.filter((r) => r.status === "complete").length;
  const totalSignals = history.reduce((n, r) => n + (r.status === "complete" ? r.signals_found || 0 : 0), 0);
  const confirmedTotal = histFindings.filter((f) => f.founder_confirmed === true).length;
  const inFlight = activeRun && (activeRun.status === "running" || activeRun.status === "queued");

  if (planLoading) return null;
  const locked = plan === "free";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bm-bg)", padding: "12px 0 64px", maxWidth: 1020, margin: "0 auto", width: "100%", minWidth: 0, overflowWrap: "anywhere" }}>
      <style>{`@keyframes bm-pulse { 0%,100%{opacity:1}50%{opacity:0.35} }`}</style>

      {/* Mission control header */}
      <AgentsHeader stats={[{ k: "Cases closed", v: totalRuns }, { k: "Signals logged", v: totalSignals }, { k: "You confirmed", v: confirmedTotal }]} />

      {locked && (
        <div style={{ marginBottom: 18, padding: "10px 14px", background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)", borderRadius: 9, fontSize: 12.5, color: "var(--bm-accent)" }}>
          Agent Workforce is available on the Builder plan.{" "}
          <a href="/upgrade" style={{ color: "var(--bm-accent)", fontWeight: 700, textDecoration: "underline" }}>Upgrade →</a>
        </div>
      )}
      {error && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: "var(--bm-red-dim)", border: "1px solid var(--bm-red-bd)", borderRadius: 9, fontSize: 12.5, color: "var(--bm-red)" }}>{error}</div>
      )}

      {/* Deploying: the run is synchronous, so show a console while we wait */}
      {deploying && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 18 }}>
          <Dossier accent="var(--bm-accent)" style={{ padding: 14, display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--bm-accent)", animation: "bm-pulse 1s ease infinite" }} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--bm-text)" }}>Agent deployed. Searching the web and analysing signals…</div>
              <div style={{ fontSize: 11.5, color: "var(--bm-text3)", marginTop: 2 }}>About 30 to 90 seconds. You can leave this page and come back; the case file will be here.</div>
            </div>
          </Dossier>
        </motion.div>
      )}

      {/* Live operations console */}
      {inFlight && activeRun && (
        <div style={{ marginBottom: 18 }}>
          <OpsConsole run={activeRun} actions={AGENT_IDENTITY[activeRun.agent_type].currentAction} />
        </div>
      )}

      {/* Case file for the open run */}
      {activeRun && !inFlight && (
        <div style={{ marginBottom: 18 }}>
          <CaseFile run={activeRun} pendingCount={pendingCount} findings={findings} />
          <button onClick={() => { setActiveRun(null); setFindings([]); stopPolling(); }}
            style={{ marginTop: 12, width: "100%", padding: "9px 0", background: "transparent", border: "1px solid var(--bm-border)", borderRadius: 9, color: "var(--bm-text3)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            ↺ Close case and brief another agent
          </button>
        </div>
      )}

      {/* Findings to review */}
      <AnimatePresence>
        {findings.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 24 }}>
            <div style={{ ...lbl, marginBottom: 12 }}>Findings · review each signal</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {findings.map((f) => <FindingCard key={f.id} finding={f} onConfirm={handleConfirm} />)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Crew board */}
      {!activeRun && !deploying && (
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", minWidth: 0 }}>
          {(["research", "validation", "competitor"] as AgentType[]).map((type) => (
            <div key={type} id={`crew-${type}`} style={{ borderRadius: 12, outline: focusAgent === type ? "2px solid var(--bm-accent)" : "none", outlineOffset: 3, minWidth: 0 }}>
            <CrewCard agent={type} name={AGENT_IDENTITY[type].name} tagline={AGENT_IDENTITY[type].tagline}
              stat={crew[type]} deploying={deploying} locked={locked} onDeploy={() => handleDeploy(type)} />
            </div>
          ))}
        </div>
      )}

      <CaseArchive runs={history} activeId={activeRun?.id} onOpen={openCase} />
    </div>
  );
}
