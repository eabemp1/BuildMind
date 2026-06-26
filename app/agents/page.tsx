"use client";

/**
 * app/agents/page.tsx — Agent Workforce
 *
 * Surfaces BuildMind's three specialized agents:
 *   Research Agent   — market research, industry trends, user sentiment
 *   Validation Agent — assumption testing, pain point analysis, pivot indicators
 *   Competitor Agent — competitor tracking, positioning gaps, launch monitoring
 *
 * Plan gate: builder (preview of coming Operator tier).
 *
 * UX flow:
 *   1. Founder picks an agent → clicks "Deploy"
 *   2. Agent identity card shows live status (Mission / Status / Signals / Confidence / Next Action)
 *   3. When complete → verdict card (top 3 findings + top risk + recommended action)
 *   4. Findings panel → founder reviews each signal, clicks Confirm or Reject
 *   5. Confirmed findings → propagate to founder context on next briefing refresh
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useActiveProjectId } from "@/lib/queries";
import { usePlan } from "@/lib/usePlan";
import { AGENT_IDENTITY, type AgentType } from "@/lib/agentWorkforce";

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

// ── Sub-components ─────────────────────────────────────────────────────────────

function AgentCard({
  agentType,
  onDeploy,
  deploying,
}: {
  agentType: AgentType;
  onDeploy: (type: AgentType) => void;
  deploying: boolean;
}) {
  const identity = AGENT_IDENTITY[agentType];
  const colors: Record<AgentType, string> = {
    research:   "#5b6cf0",
    validation: "#4ade80",
    competitor: "#f59e0b",
  };
  const color = colors[agentType];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background:   "#161922",
        border:       `1px solid ${color}28`,
        borderRadius: 14,
        padding:      "20px 20px 18px",
        display:      "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: `${color}18`,
          border:     `1px solid ${color}35`,
          display:    "flex", alignItems: "center", justifyContent: "center",
          fontSize:   16,
        }}>
          {agentType === "research" ? "🔬" : agentType === "validation" ? "✅" : "🎯"}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#e4e8f8", marginBottom: 2 }}>
            {identity.name}
          </div>
          <div style={{ fontSize: 11, color: color, fontFamily: "'DM Mono', monospace", marginBottom: 6 }}>
            {identity.tagline}
          </div>
          <div style={{ fontSize: 12, color: "#6b738f", lineHeight: 1.55 }}>
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
          background:   deploying ? "transparent" : `${color}18`,
          border:       `1px solid ${deploying ? "#2a2e45" : color + "40"}`,
          borderRadius: 9,
          color:        deploying ? "#404560" : color,
          fontSize:     13,
          fontWeight:   600,
          cursor:       deploying ? "not-allowed" : "pointer",
          fontFamily:   "inherit",
          transition:   "all 0.15s",
        }}
      >
        {deploying ? "Agent running…" : `Deploy ${identity.name}`}
      </button>
    </motion.div>
  );
}

function LiveAgentCard({ run, pendingCount }: { run: AgentRun; pendingCount: number }) {
  const identity = AGENT_IDENTITY[run.agent_type];
  const isRunning = run.status === "running" || run.status === "queued";

  const verdictColor = {
    proceed:      "#4ade80",
    pivot:        "#f59e0b",
    kill:         "#f87171",
    inconclusive: "#6b738f",
  }[run.verdict ?? "inconclusive"] ?? "#6b738f";

  const verdictEmoji = {
    proceed:      "🟢",
    pivot:        "🟡",
    kill:         "🔴",
    inconclusive: "⚪",
  }[run.verdict ?? "inconclusive"] ?? "⚪";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background:   "#0f1117",
        border:       "1px solid #1e2235",
        borderRadius: 16,
        overflow:     "hidden",
      }}
    >
      {/* Agent header */}
      <div style={{
        padding:    "16px 20px 14px",
        borderBottom: "1px solid #1a1d2e",
        display:    "flex",
        alignItems: "center",
        gap: 12,
      }}>
        <div style={{
          fontSize: 18,
          width: 36, height: 36,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "#161922",
          border: "1px solid #1e2235",
          borderRadius: 9,
        }}>
          {run.agent_type === "research" ? "🔬" : run.agent_type === "validation" ? "✅" : "🎯"}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#e4e8f8" }}>{identity.name}</div>
          <div style={{ fontSize: 10, color: "#404560", fontFamily: "'DM Mono', monospace", marginTop: 1 }}>
            {new Date(run.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
        <div style={{
          padding:    "3px 10px",
          borderRadius: 20,
          background: isRunning ? "rgba(91,108,240,0.1)" : run.status === "complete" ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
          border:     isRunning ? "1px solid rgba(91,108,240,0.25)" : run.status === "complete" ? "1px solid rgba(74,222,128,0.25)" : "1px solid rgba(248,113,113,0.25)",
          fontSize:   10,
          fontWeight: 600,
          color:      isRunning ? "#7c8cf0" : run.status === "complete" ? "#4ade80" : "#f87171",
          fontFamily: "'DM Mono', monospace",
          letterSpacing: "0.04em",
        }}>
          {isRunning ? "RUNNING" : run.status.toUpperCase()}
        </div>
      </div>

      {/* Live identity card — what the agent is doing right now */}
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #1a1d2e" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px" }}>
          <div>
            <div style={{ fontSize: 9, color: "#404560", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Mono', monospace", marginBottom: 3 }}>Mission</div>
            <div style={{ fontSize: 11.5, color: "#9099b8", lineHeight: 1.5 }}>{run.mission}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "#404560", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Mono', monospace", marginBottom: 3 }}>Status</div>
            <div style={{ fontSize: 11.5, color: isRunning ? "#7c8cf0" : "#9099b8", display: "flex", alignItems: "center", gap: 5 }}>
              {isRunning && (
                <span style={{
                  display: "inline-block", width: 6, height: 6,
                  borderRadius: "50%", background: "#5b6cf0",
                  animation: "pulse 1.5s ease infinite",
                }} />
              )}
              {run.current_action ?? (isRunning ? "Starting…" : "Complete")}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "#404560", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Mono', monospace", marginBottom: 3 }}>Evidence collected</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#e4e8f8", fontFamily: "'DM Mono', monospace" }}>
              {run.signals_found} <span style={{ fontSize: 11, color: "#555e7a", fontWeight: 400 }}>signals</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "#404560", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Mono', monospace", marginBottom: 3 }}>Confidence</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#e4e8f8", fontFamily: "'DM Mono', monospace" }}>
              {run.confidence_pct}% {run.confidence_pct >= 70 ? "🟢" : run.confidence_pct >= 45 ? "🟡" : "🔴"}
            </div>
          </div>
        </div>

        {/* Iteration progress bar */}
        {isRunning && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 9, color: "#404560", fontFamily: "'DM Mono', monospace" }}>Research cycles</span>
              <span style={{ fontSize: 9, color: "#555e7a", fontFamily: "'DM Mono', monospace" }}>{run.iteration}/{run.max_iterations}</span>
            </div>
            <div style={{ height: 3, background: "#1e2235", borderRadius: 2 }}>
              <div style={{
                height: "100%", borderRadius: 2,
                width: `${(run.iteration / run.max_iterations) * 100}%`,
                background: "linear-gradient(90deg, #5b6cf0, #7c8cf0)",
                transition: "width 0.5s ease",
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Verdict — shown when complete */}
      {run.status === "complete" && run.verdict && (
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #1a1d2e" }}>
          <div style={{
            fontSize: 9, color: verdictColor, textTransform: "uppercase",
            letterSpacing: "0.1em", fontFamily: "'DM Mono', monospace", marginBottom: 10,
          }}>
            {verdictEmoji} Verdict
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 13, fontWeight: 700, color: verdictColor,
              padding: "8px 14px",
              background: `${verdictColor}10`,
              border: `1px solid ${verdictColor}25`,
              borderRadius: 8,
            }}>
              {run.recommended_action}
            </div>
          </div>

          {[run.top_finding_1, run.top_finding_2, run.top_finding_3].filter(Boolean).map((f, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
              <span style={{
                fontSize: 9, fontWeight: 700, color: "#5b6cf0",
                fontFamily: "'DM Mono', monospace",
                background: "rgba(91,108,240,0.1)",
                border: "1px solid rgba(91,108,240,0.2)",
                borderRadius: 4, padding: "2px 5px",
                flexShrink: 0, marginTop: 1,
              }}>
                #{i + 1}
              </span>
              <span style={{ fontSize: 12.5, color: "#9099b8", lineHeight: 1.55 }}>{f}</span>
            </div>
          ))}

          {run.top_risk && (
            <div style={{
              marginTop: 10, padding: "10px 12px",
              background: "rgba(248,113,113,0.06)",
              border: "1px solid rgba(248,113,113,0.15)",
              borderRadius: 8,
            }}>
              <div style={{ fontSize: 9, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>Top risk</div>
              <div style={{ fontSize: 12, color: "#c4cae8", lineHeight: 1.55 }}>{run.top_risk}</div>
            </div>
          )}

          {pendingCount > 0 && (
            <div style={{
              marginTop: 12, padding: "8px 12px",
              background: "rgba(245,158,11,0.07)",
              border: "1px solid rgba(245,158,11,0.2)",
              borderRadius: 8,
              fontSize: 12, color: "#f59e0b",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span>⚠️</span>
              <span>{pendingCount} finding{pendingCount !== 1 ? "s" : ""} pending your review — scroll down to confirm or reject</span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

function FindingCard({
  finding,
  onConfirm,
}: {
  finding: AgentFinding;
  onConfirm: (id: string, confirmed: boolean) => void;
}) {
  const [acting, setActing] = useState(false);

  const handle = async (confirmed: boolean) => {
    setActing(true);
    onConfirm(finding.id, confirmed);
  };

  const confColor =
    finding.confidence >= 0.7 ? "#4ade80" :
    finding.confidence >= 0.5 ? "#f59e0b" : "#f87171";

  if (finding.founder_confirmed === true) {
    return (
      <div style={{
        padding: "12px 14px",
        background: "rgba(74,222,128,0.04)",
        border: "1px solid rgba(74,222,128,0.15)",
        borderRadius: 10,
        opacity: 0.7,
      }}>
        <div style={{ fontSize: 11.5, color: "#4ade80", fontWeight: 600 }}>✓ {finding.title}</div>
        <div style={{ fontSize: 10.5, color: "#6b738f", marginTop: 2 }}>Confirmed — added to your context</div>
      </div>
    );
  }

  if (finding.founder_confirmed === false) {
    return (
      <div style={{
        padding: "12px 14px",
        background: "rgba(248,113,113,0.04)",
        border: "1px solid rgba(248,113,113,0.12)",
        borderRadius: 10,
        opacity: 0.5,
      }}>
        <div style={{ fontSize: 11.5, color: "#f87171", fontWeight: 600 }}>✕ {finding.title}</div>
        <div style={{ fontSize: 10.5, color: "#6b738f", marginTop: 2 }}>Rejected</div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: "#161922",
        border: `1px solid ${finding.positive ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)"}`,
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}>
          {finding.positive ? "📈" : "📉"}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#e4e8f8", marginBottom: 3 }}>
            {finding.title}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <span style={{
              fontSize: 9, fontFamily: "'DM Mono', monospace",
              color: confColor, background: `${confColor}12`,
              border: `1px solid ${confColor}25`,
              borderRadius: 4, padding: "1px 6px",
            }}>
              {Math.round(finding.confidence * 100)}% conf
            </span>
            <span style={{
              fontSize: 9, color: "#555e7a",
              fontFamily: "'DM Mono', monospace",
            }}>
              {finding.signal_type.replace(/_/g, " ")}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "#7880a8", lineHeight: 1.6, marginBottom: 6 }}>
            {finding.evidence}
          </div>
          {finding.action_hint && (
            <div style={{
              fontSize: 11.5, color: "#5b6cf0",
              borderLeft: "2px solid rgba(91,108,240,0.3)",
              paddingLeft: 8,
            }}>
              → {finding.action_hint}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, paddingTop: 10, borderTop: "1px solid #1e2235" }}>
        <button
          onClick={() => handle(true)}
          disabled={acting}
          style={{
            flex: 1, padding: "7px 0",
            background: "rgba(74,222,128,0.08)",
            border: "1px solid rgba(74,222,128,0.2)",
            borderRadius: 7, color: "#4ade80",
            fontSize: 12, fontWeight: 600,
            cursor: acting ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          Confirm → add to context
        </button>
        <button
          onClick={() => handle(false)}
          disabled={acting}
          style={{
            flex: 1, padding: "7px 0",
            background: "rgba(248,113,113,0.06)",
            border: "1px solid rgba(248,113,113,0.18)",
            borderRadius: 7, color: "#f87171",
            fontSize: 12, fontWeight: 600,
            cursor: acting ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          Reject
        </button>
      </div>
    </motion.div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const { plan, isLoading: planLoading } = usePlan();
  const activeProjectId = useActiveProjectId();

  const [activeRun, setActiveRun]     = useState<AgentRun | null>(null);
  const [findings, setFindings]       = useState<AgentFinding[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [deploying, setDeploying]     = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const pollStatus = useCallback(async (runId: string) => {
    try {
      const res = await fetch(`/api/agents/status/${runId}`, { credentials: "include" });
      if (!res.ok) return;
      const json = await res.json();
      if (json.ok) {
        setActiveRun(json.data);
        setPendingCount(json.pendingReview ?? 0);
        if (json.data.status === "complete" || json.data.status === "error" || json.data.status === "abandoned") {
          stopPolling();
          // Load findings
          const fRes = await fetch(`/api/agents/findings/${runId}`, { credentials: "include" });
          if (fRes.ok) {
            const fJson = await fRes.json();
            if (fJson.ok) setFindings([...fJson.data.pending, ...fJson.data.confirmed, ...fJson.data.rejected]);
          }
        }
      }
    } catch {}
  }, [stopPolling]);

  const handleDeploy = useCallback(async (agentType: AgentType) => {
    setDeploying(true);
    setError(null);
    setActiveRun(null);
    setFindings([]);
    stopPolling();

    try {
      const res = await fetch("/api/agents/run", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ agentType, projectId: activeProjectId }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        if (res.status === 403) {
          setError("Agent Workforce requires Builder plan. Upgrade to access.");
        } else {
          setError(json.error ?? "Agent run failed — please retry.");
        }
        setDeploying(false);
        return;
      }

      // Start polling during the run
      const runId = json.runId as string;
      pollRef.current = setInterval(() => pollStatus(runId), 2500);

      if (json.data) {
        setActiveRun(json.data);
        stopPolling();
        // Load findings immediately if complete
        const fRes = await fetch(`/api/agents/findings/${runId}`, { credentials: "include" });
        if (fRes.ok) {
          const fJson = await fRes.json();
          if (fJson.ok) setFindings([...fJson.data.pending, ...fJson.data.confirmed, ...fJson.data.rejected]);
        }
      }
    } catch (e) {
      setError(String(e));
    }
    setDeploying(false);
  }, [activeProjectId, pollStatus, stopPolling]);

  const handleConfirm = useCallback(async (findingId: string, confirmed: boolean) => {
    try {
      await fetch("/api/agents/confirm", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ findingId, confirmed }),
      });
      setFindings(prev => prev.map(f =>
        f.id === findingId ? { ...f, founder_confirmed: confirmed } : f
      ));
      setPendingCount(prev => Math.max(0, prev - 1));
    } catch {}
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  if (planLoading) return null;

  return (
    <div style={{
      minHeight:  "100vh",
      background: "#0b0d14",
      padding:    "32px 20px 80px",
      fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
      maxWidth:   740,
      margin:     "0 auto",
    }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.4} }`}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
          textTransform: "uppercase", color: "#5b6cf0",
          fontFamily: "'DM Mono', monospace", marginBottom: 6,
        }}>
          Agent Workforce
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e4e8f8", margin: "0 0 6px" }}>
          Your startup team
        </h1>
        <p style={{ fontSize: 13, color: "#555e7a", margin: 0, lineHeight: 1.6 }}>
          Specialized agents that research, validate, and analyse on your behalf.
          You review every finding before it reaches your context.
        </p>

        {plan === "free" && (
          <div style={{
            marginTop: 14, padding: "10px 14px",
            background: "rgba(245,158,11,0.07)",
            border: "1px solid rgba(245,158,11,0.2)",
            borderRadius: 9, fontSize: 12.5, color: "#f59e0b",
          }}>
            Agent Workforce is available on the Builder plan.{" "}
            <a href="/upgrade" style={{ color: "#f59e0b", fontWeight: 700, textDecoration: "underline" }}>
              Upgrade →
            </a>
          </div>
        )}
      </div>

      {error && (
        <div style={{
          marginBottom: 16, padding: "10px 14px",
          background: "rgba(248,113,113,0.07)",
          border: "1px solid rgba(248,113,113,0.2)",
          borderRadius: 9, fontSize: 12.5, color: "#f87171",
        }}>
          {error}
        </div>
      )}

      {/* Agent selection */}
      {!activeRun && (
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

      {/* Live agent card */}
      {activeRun && (
        <div style={{ marginBottom: 24 }}>
          <LiveAgentCard run={activeRun} pendingCount={pendingCount} />

          {activeRun.status === "complete" && (
            <button
              onClick={() => { setActiveRun(null); setFindings([]); stopPolling(); }}
              style={{
                marginTop: 12, width: "100%",
                padding: "9px 0",
                background: "transparent",
                border: "1px solid #1e2235",
                borderRadius: 9,
                color: "#404560",
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
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div style={{
              fontSize: 9, fontWeight: 700, color: "#555e7a",
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
