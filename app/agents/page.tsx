"use client";

/**
 * app/agents/page.tsx — Agent Workforce
 * Rebased to BuildMind brand tokens (--bm-accent gold, dark obsidian palette).
 * Run persists via localStorage so navigating away and back resumes polling.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useActiveProjectId } from "@/lib/queries";
import { usePlan } from "@/lib/usePlan";
import { AGENT_IDENTITY, type AgentType } from "@/lib/agentWorkforce";
import { RadialGauge } from "@/components/charts";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  iteration:         number;
  signal_type:       string;
  positive:          boolean;
  confidence:        number;
  title:             string;
  evidence:          string;
  action_hint:       string | null;
  founder_confirmed: boolean | null;
}

const STORAGE_KEY = "bm_agent_run_id";

// ── Agent card (selection) ────────────────────────────────────────────────────

function AgentCard({
  agentType, onDeploy, deploying,
}: {
  agentType: AgentType;
  onDeploy: (type: AgentType) => void;
  deploying: boolean;
}) {
  const identity = AGENT_IDENTITY[agentType];
  // Brand-token accent per agent — all within gold family for cohesion
  const colors: Record<AgentType, { border: string; text: string; bg: string }> = {
    research:   { border: "var(--bm-accent-bd)",  text: "var(--bm-accent)",  bg: "var(--bm-accent-dim)" },
    validation: { border: "var(--bm-green-bd)",   text: "var(--bm-green)",   bg: "var(--bm-green-dim)"  },
    competitor: { border: "rgba(224,82,82,0.22)", text: "var(--bm-red)",     bg: "var(--bm-red-dim)"    },
  };
  const c = colors[agentType];
  const icons: Record<AgentType, string> = { research: "🔬", validation: "✅", competitor: "🎯" };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background:    "var(--bm-bg2)",
        border:        `1px solid ${c.border}`,
        borderRadius:  14,
        padding:       "20px 20px 18px",
        display:       "flex",
        flexDirection: "column",
        gap:           12,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: c.bg, border: `1px solid ${c.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16,
        }}>
          {icons[agentType]}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--bm-text)", marginBottom: 2 }}>
            {identity.name}
          </div>
          <div style={{ fontSize: 11, color: c.text, fontFamily: "'DM Mono', monospace", marginBottom: 6 }}>
            {identity.tagline}
          </div>
          <div style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.55 }}>
            {identity.description}
          </div>
        </div>
      </div>

      <button
        onClick={() => onDeploy(agentType)}
        disabled={deploying}
        style={{
          width:        "100%",
          padding:      "10px 0",
          background:   deploying ? "transparent" : c.bg,
          border:       `1px solid ${deploying ? "var(--bm-border)" : c.border}`,
          borderRadius: 9,
          color:        deploying ? "var(--bm-text4)" : c.text,
          fontSize:     13,
          fontWeight:   600,
          cursor:       deploying ? "not-allowed" : "pointer",
          fontFamily:   "inherit",
          transition:   "all 0.15s",
        }}
      >
        {deploying ? "Deploying…" : `Deploy ${identity.name}`}
      </button>
    </motion.div>
  );
}

// ── Live agent card ───────────────────────────────────────────────────────────

function LiveAgentCard({ run, pendingCount }: { run: AgentRun; pendingCount: number }) {
  const identity = AGENT_IDENTITY[run.agent_type];
  const isRunning = run.status === "running" || run.status === "queued";

  const verdictStyles: Record<string, { color: string; bg: string; border: string; emoji: string; label: string }> = {
    proceed:      { color: "var(--bm-green)",  bg: "var(--bm-green-dim)",  border: "var(--bm-green-bd)",  emoji: "🟢", label: "Proceed"      },
    pivot:        { color: "var(--bm-accent)", bg: "var(--bm-accent-dim)", border: "var(--bm-accent-bd)", emoji: "🟡", label: "Pivot Recommended" },
    kill:         { color: "var(--bm-red)",    bg: "var(--bm-red-dim)",    border: "var(--bm-red-bd)",    emoji: "🔴", label: "Kill"         },
    inconclusive: { color: "var(--bm-text3)",  bg: "var(--bm-bg3)",        border: "var(--bm-border)",    emoji: "⚪", label: "Inconclusive" },
  };
  const vStyle = verdictStyles[run.verdict ?? "inconclusive"] ?? verdictStyles.inconclusive;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background:   "var(--bm-bg2)",
        border:       "1px solid var(--bm-border2)",
        borderRadius: 16,
        overflow:     "hidden",
      }}
    >
      {/* Header */}
      <div style={{
        padding: "16px 20px 14px",
        borderBottom: "1px solid var(--bm-border)",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{
          fontSize: 18, width: 36, height: 36,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderRadius: 9,
        }}>
          {{ research: "🔬", validation: "✅", competitor: "🎯" }[run.agent_type]}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--bm-text)" }}>{identity.name}</div>
          <div style={{ fontSize: 10, color: "var(--bm-text4)", fontFamily: "'DM Mono', monospace", marginTop: 1 }}>
            {new Date(run.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
        <div style={{
          padding: "3px 10px", borderRadius: 20,
          background: isRunning ? "var(--bm-accent-dim)" : run.status === "complete" ? "var(--bm-green-dim)" : "var(--bm-red-dim)",
          border: isRunning ? "1px solid var(--bm-accent-bd)" : run.status === "complete" ? "1px solid var(--bm-green-bd)" : "1px solid var(--bm-red-bd)",
          fontSize: 10, fontWeight: 600,
          color: isRunning ? "var(--bm-accent)" : run.status === "complete" ? "var(--bm-green)" : "var(--bm-red)",
          fontFamily: "'DM Mono', monospace", letterSpacing: "0.04em",
        }}>
          {isRunning ? "RUNNING" : run.status.toUpperCase()}
        </div>
      </div>

      {/* Live stats */}
      <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--bm-border)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px" }}>
          <div>
            <div style={{ fontSize: 9, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Mono', monospace", marginBottom: 3 }}>Mission</div>
            <div style={{ fontSize: 11.5, color: "var(--bm-text2)", lineHeight: 1.5 }}>{run.mission}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Mono', monospace", marginBottom: 3 }}>Status</div>
            <div style={{ fontSize: 11.5, color: isRunning ? "var(--bm-accent)" : "var(--bm-text2)", display: "flex", alignItems: "center", gap: 5 }}>
              {isRunning && (
                <span style={{
                  display: "inline-block", width: 6, height: 6,
                  borderRadius: "50%", background: "var(--bm-accent)",
                  animation: "bm-pulse 1.5s ease infinite",
                }} />
              )}
              {run.current_action ?? (isRunning ? "Starting…" : "Complete")}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Mono', monospace", marginBottom: 3 }}>Evidence collected</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--bm-text)", fontFamily: "'DM Mono', monospace", letterSpacing: "-0.02em" }}>
              {run.signals_found} <span style={{ fontSize: 11, color: "var(--bm-text3)", fontWeight: 400 }}>signals</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Mono', monospace", marginBottom: 3 }}>Confidence</div>
            <RadialGauge
              value={run.confidence_pct}
              size={44}
              strokeWidth={4}
              thresholds={[
                { min: 70, color: "var(--bm-green)" },
                { min: 45, color: "var(--bm-accent)" },
                { min: 0, color: "var(--bm-red)" },
              ]}
            />
          </div>
        </div>

        {isRunning && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 9, color: "var(--bm-text3)", fontFamily: "'DM Mono', monospace" }}>Research cycles</span>
              <span style={{ fontSize: 9, color: "var(--bm-text3)", fontFamily: "'DM Mono', monospace" }}>{run.iteration}/{run.max_iterations}</span>
            </div>
            <div style={{ height: 3, background: "var(--bm-bg4)", borderRadius: 2 }}>
              <div style={{
                height: "100%", borderRadius: 2,
                width: `${Math.max(5, (run.iteration / run.max_iterations) * 100)}%`,
                background: "var(--bm-accent)",
                transition: "width 0.6s ease",
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Verdict */}
      {run.status === "complete" && run.verdict && (
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--bm-border)" }}>
          <div style={{
            fontSize: 9, color: vStyle.color, textTransform: "uppercase",
            letterSpacing: "0.1em", fontFamily: "'DM Mono', monospace", marginBottom: 10,
          }}>
            {vStyle.emoji} Verdict — {vStyle.label}
          </div>

          <div style={{
            fontSize: 13, fontWeight: 600, color: vStyle.color,
            padding: "10px 14px",
            background: vStyle.bg, border: `1px solid ${vStyle.border}`,
            borderRadius: 8, marginBottom: 14, lineHeight: 1.55,
          }}>
            {run.recommended_action}
          </div>

          {[run.top_finding_1, run.top_finding_2, run.top_finding_3].filter(Boolean).map((f, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
              <span style={{
                fontSize: 9, fontWeight: 700, color: "var(--bm-accent)",
                fontFamily: "'DM Mono', monospace",
                background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)",
                borderRadius: 4, padding: "2px 5px", flexShrink: 0, marginTop: 1,
              }}>
                #{i + 1}
              </span>
              <span style={{ fontSize: 12.5, color: "var(--bm-text2)", lineHeight: 1.55 }}>{f}</span>
            </div>
          ))}

          {run.top_risk && (
            <div style={{
              marginTop: 12, padding: "10px 12px",
              background: "var(--bm-red-dim)", border: "1px solid var(--bm-red-bd)", borderRadius: 8,
            }}>
              <div style={{ fontSize: 9, color: "var(--bm-red)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>Top risk</div>
              <div style={{ fontSize: 12, color: "var(--bm-text2)", lineHeight: 1.55 }}>{run.top_risk}</div>
            </div>
          )}

          {pendingCount > 0 && (
            <div style={{
              marginTop: 12, padding: "8px 12px",
              background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)", borderRadius: 8,
              fontSize: 12, color: "var(--bm-accent)", display: "flex", alignItems: "center", gap: 6,
            }}>
              <span>⚠️</span>
              <span>{pendingCount} finding{pendingCount !== 1 ? "s" : ""} pending your review — scroll down</span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ── Finding card ──────────────────────────────────────────────────────────────

function FindingCard({
  finding, onConfirm,
}: {
  finding: AgentFinding;
  onConfirm: (id: string, confirmed: boolean) => void;
}) {
  const [acting, setActing] = useState(false);

  const handle = (confirmed: boolean) => {
    setActing(true);
    onConfirm(finding.id, confirmed);
  };

  if (finding.founder_confirmed === true) {
    return (
      <div style={{
        padding: "12px 14px", background: "var(--bm-green-dim)",
        border: "1px solid var(--bm-green-bd)", borderRadius: 10, opacity: 0.7,
      }}>
        <div style={{ fontSize: 11.5, color: "var(--bm-green)", fontWeight: 600 }}>✓ {finding.title}</div>
        <div style={{ fontSize: 10.5, color: "var(--bm-text3)", marginTop: 2 }}>Confirmed — added to your context</div>
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
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--bm-text)", marginBottom: 3 }}>
            {finding.positive ? "📈 " : "📉 "}{finding.title}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 9, color: "var(--bm-text4)", fontFamily: "'DM Mono', monospace" }}>
              {finding.signal_type.replace(/_/g, " ")}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--bm-text2)", lineHeight: 1.6, marginBottom: 6 }}>
            {finding.evidence}
          </div>
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

      <div style={{ display: "flex", gap: 6, paddingTop: 10, borderTop: "1px solid var(--bm-border)" }}>
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
          Confirm → add to context
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const { plan, isLoading: planLoading } = usePlan();
  const activeProjectId = useActiveProjectId();

  const [activeRun, setActiveRun]       = useState<AgentRun | null>(null);
  const [findings, setFindings]         = useState<AgentFinding[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [deploying, setDeploying]       = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const loadFindings = useCallback(async (runId: string) => {
    const fRes = await fetch(`/api/agents/findings/${runId}`, { credentials: "include" });
    if (!fRes.ok) return;
    const fJson = await fRes.json();
    if (fJson.ok) setFindings([...fJson.data.pending, ...fJson.data.confirmed, ...fJson.data.rejected]);
  }, []);

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
      } else {
        // Fallback: start polling if somehow still async
        pollRef.current = setInterval(() => pollStatus(runId), 2500);
      }
    } catch (e) {
      setError(String(e));
    }
    setDeploying(false);
  }, [activeProjectId, pollStatus, stopPolling, loadFindings]);

  const handleConfirm = useCallback(async (findingId: string, confirmed: boolean) => {
    try {
      await fetch("/api/agents/confirm", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findingId, confirmed }),
      });
      setFindings(prev => prev.map(f => f.id === findingId ? { ...f, founder_confirmed: confirmed } : f));
      setPendingCount(prev => Math.max(0, prev - 1));
    } catch {}
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  if (planLoading) return null;

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bm-bg)",
      padding: "32px 20px 80px",
      fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
      maxWidth: 740, margin: "0 auto",
    }}>
      <style>{`
        @keyframes bm-pulse { 0%,100%{opacity:1}50%{opacity:0.35} }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
          textTransform: "uppercase", color: "var(--bm-text3)",
          fontFamily: "'DM Mono', monospace", marginBottom: 6,
        }}>
          Agent Workforce
        </div>
        <h1 style={{
          fontSize: 22, fontWeight: 700, color: "var(--bm-text)",
          margin: "0 0 6px", letterSpacing: "-0.025em",
        }}>
          Your startup team
        </h1>
        <p style={{ fontSize: 13, color: "var(--bm-text3)", margin: 0, lineHeight: 1.6 }}>
          Specialized agents that research, validate, and analyse on your behalf.
          You review every finding before it reaches your context.
        </p>

        {plan === "free" && (
          <div style={{
            marginTop: 14, padding: "10px 14px",
            background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)",
            borderRadius: 9, fontSize: 12.5, color: "var(--bm-accent)",
          }}>
            Agent Workforce is available on the Builder plan.{" "}
            <a href="/upgrade" style={{ color: "var(--bm-accent)", fontWeight: 700, textDecoration: "underline" }}>
              Upgrade →
            </a>
          </div>
        )}
      </div>

      {error && (
        <div style={{
          marginBottom: 16, padding: "10px 14px",
          background: "var(--bm-red-dim)", border: "1px solid var(--bm-red-bd)",
          borderRadius: 9, fontSize: 12.5, color: "var(--bm-red)",
        }}>
          {error}
        </div>
      )}

      {/* Deploying state — shown while waiting for the synchronous run */}
      {deploying && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            marginBottom: 20, padding: "20px",
            background: "var(--bm-bg2)", border: "1px solid var(--bm-accent-bd)",
            borderRadius: 14, display: "flex", alignItems: "center", gap: 14,
          }}
        >
          <span style={{
            display: "inline-block", width: 10, height: 10,
            borderRadius: "50%", background: "var(--bm-accent)",
            animation: "bm-pulse 1s ease infinite", flexShrink: 0,
          }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--bm-text)", marginBottom: 2 }}>
              Agent running — searching the web, analysing signals…
            </div>
            <div style={{ fontSize: 11.5, color: "var(--bm-text3)" }}>
              This takes 30–90 seconds. You can navigate away and come back — your run will be here.
            </div>
          </div>
        </motion.div>
      )}

      {/* Agent selection */}
      {!activeRun && !deploying && (
        <div style={{ display: "grid", gap: 12, marginBottom: 24 }}>
          {(["research", "validation", "competitor"] as AgentType[]).map(type => (
            <AgentCard
              key={type}
              agentType={type}
              onDeploy={plan !== "free" ? handleDeploy : () => {}}
              deploying={deploying}
            />
          ))}
        </div>
      )}

      {/* Live / complete agent card */}
      {activeRun && (
        <div style={{ marginBottom: 24 }}>
          <LiveAgentCard run={activeRun} pendingCount={pendingCount} />
          {activeRun.status === "complete" && (
            <button
              onClick={() => { setActiveRun(null); setFindings([]); stopPolling(); }}
              style={{
                marginTop: 12, width: "100%",
                padding: "9px 0",
                background: "transparent", border: "1px solid var(--bm-border)",
                borderRadius: 9, color: "var(--bm-text3)",
                fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              ↺ Run another agent
            </button>
          )}
        </div>
      )}

      {/* Findings review */}
      <AnimatePresence>
        {findings.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div style={{
              fontSize: 9, fontWeight: 700, color: "var(--bm-text3)",
              textTransform: "uppercase", letterSpacing: "0.1em",
              fontFamily: "'DM Mono', monospace", marginBottom: 12,
            }}>
              Findings — review each signal
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {findings.map(f => (
                <FindingCard key={f.id} finding={f} onConfirm={handleConfirm} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
