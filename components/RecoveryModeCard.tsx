"use client";
/**
 * RecoveryModeCard — NEW IN V4 (Playbook §4.2)
 * Shown in /today when Recovery Mode is active (3+ days of momentum decay).
 * Pure UI wrapper — all logic lives in lib/recoveryMode.ts + /api/recovery-mode
 */
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { AIErrorBoundary } from "./AIErrorBoundary";
import { sanitizeOutput } from "@/lib/sanitizeOutput";

export interface ResetMission {
  task: string;
  rationale: string;
  estimatedMinutes: number;
}

export interface RiskRecoveryMission {
  title: string;
  contextParagraph: string;
  requiredSteps: string[];
  churnProbability: number;
  burnAtRisk: number;
  evidence: { label: string; createdAt: string }[];
}

interface Props {
  onComplete?: (newScore: number) => void;
  onDismiss?: () => void;
}

function RecoveryModeCardInner({ onComplete, onDismiss }: Props) {
  const router = useRouter();
  const [mission, setMission] = useState<ResetMission | null>(null);
  const [riskMission, setRiskMission] = useState<RiskRecoveryMission | null>(null);
  const [trigger, setTrigger] = useState<"inactivity" | "risk" | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [done, setDone] = useState(false);
  const [daysInactive, setDaysInactive] = useState(3);

  useEffect(() => {
    (async () => {
      try {
        // Check what's already active first — a risk-triggered recovery
        // already has its mission persisted (see /api/risk-signals +
        // /api/recovery-mode POST with trigger:"risk"). POSTing blind here
        // would always take the inactivity branch and silently overwrite
        // that churn mission with a freshly generated, unrelated one.
        const statusRes = await fetch("/api/recovery-mode", { cache: "no-store" });
        const status = statusRes.ok ? await statusRes.json() : null;

        if (status?.recoveryTrigger === "risk" && status?.recoveryMission) {
          setTrigger("risk");
          setRiskMission(status.recoveryMission);
          setLoading(false);
          return;
        }

        // Inactivity path (or first activation): the Reset Mission text
        // isn't persisted, so this POST both activates Recovery Mode and
        // generates the mission in one call — matches original behavior.
        setTrigger("inactivity");
        const res = await fetch("/api/recovery-mode", { method: "POST", body: JSON.stringify({}) });
        if (res.ok) {
          const data = await res.json();
          setMission(data.resetMission);
          setDaysInactive(data.daysInactive ?? 3);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const handleComplete = async () => {
    setCompleting(true);
    try {
      const res = await fetch("/api/recovery-mode", { method: "PATCH", body: JSON.stringify({ action: "complete" }) });
      if (res.ok) {
        const { momentumScore } = await res.json();
        setDone(true);
        onComplete?.(momentumScore);
      }
    } catch {}
    setCompleting(false);
  };

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      const res = await fetch("/api/recovery-mode", { method: "PATCH", body: JSON.stringify({ action: "dismiss" }) });
      if (res.ok) onDismiss?.();
    } catch {}
    setDismissing(false);
  };

  // ── Completion state — the product's most important emotional moment ─────────
  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        style={{
          background: "var(--bm-green-dim)",
          border: "1px solid rgba(16,185,129,0.25)",
          borderRadius: 16,
          padding: "28px 24px",
          marginBottom: 16,
          textAlign: "center",
        }}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 400 }}
          style={{ fontSize: 40, marginBottom: 12 }}
        >
          ✓
        </motion.div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--bm-text)", marginBottom: 6 }}>
          You broke the stall.
        </div>
        <div style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.6, maxWidth: 280, margin: "0 auto" }}>
          That&apos;s the hardest part — starting again. Full mode resumes tomorrow.
          Momentum +4.
        </div>
      </motion.div>
    );
  }

  // ── Risk-triggered recovery — a churn mission built from the founder's
  // own logged signals (lib/riskSignals.ts), not a generated Reset Mission. ──
  if (trigger === "risk" && riskMission) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        style={{ marginBottom: 16 }}
      >
        <div style={{
          background: "var(--bm-red-dim, rgba(239,68,68,0.08))",
          border: "1px solid var(--bm-red-bd)",
          borderRadius: "14px 14px 0 0",
          padding: "16px 20px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--bm-red)", marginBottom: 6, fontWeight: 700 }}>
            <span className="bm-status-dot" style={{ background: "var(--bm-red)", marginTop: 0 }} />
            Recovery mode active · Normal recommendations paused
          </div>
          <div style={{ fontSize: 15, color: "var(--bm-text)", fontWeight: 600, lineHeight: 1.4 }}>
            {sanitizeOutput(riskMission.title)}
          </div>
        </div>
        <div style={{
          background: "var(--bm-bg2)",
          border: "1px solid var(--bm-border)",
          borderTop: "none",
          borderRadius: "0 0 14px 14px",
          padding: "20px 20px",
        }}>
          <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bm-text4)", marginBottom: 8, fontWeight: 700 }}>
            Context &amp; burn impact
          </div>
          <p style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.6, marginBottom: 16 }}>
            {sanitizeOutput(riskMission.contextParagraph)}
          </p>

          <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bm-text4)", marginBottom: 8, fontWeight: 700 }}>
            Required intervention steps
          </div>
          <ol style={{ margin: "0 0 20px", padding: 0, listStyle: "none" }}>
            {riskMission.requiredSteps.map((step, i) => (
              <li key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: "var(--bm-text2)", marginBottom: 8, lineHeight: 1.5 }}>
                <span style={{ color: "var(--bm-text4)", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>[{i + 1}]</span>
                {sanitizeOutput(step)}
              </li>
            ))}
          </ol>

          {riskMission.evidence.length > 0 && (
            <div style={{ marginBottom: 20, padding: "10px 12px", background: "var(--bm-bg3)", borderRadius: 8 }}>
              <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bm-text4)", marginBottom: 6, fontWeight: 700 }}>
                Recovery evidence
              </div>
              {riskMission.evidence.map((e, i) => (
                <div key={i} style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.7, fontFamily: "'DM Mono', monospace" }}>
                  {new Date(e.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {sanitizeOutput(e.label)}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleComplete}
              disabled={completing}
              style={{
                flex: 1,
                padding: "15px 0",
                borderRadius: 12,
                border: "none",
                background: completing ? "rgba(240,180,41,0.3)" : "var(--bm-accent)",
                color: "#000",
                fontWeight: 700,
                fontSize: 15,
                cursor: completing ? "wait" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {completing ? "Saving…" : "Mark resolved"}
            </motion.button>
            <button
              onClick={handleDismiss}
              disabled={dismissing}
              style={{
                padding: "15px 18px",
                borderRadius: 12,
                border: "1px solid var(--bm-border2)",
                background: "none",
                color: "var(--bm-text3)",
                fontSize: 14,
                cursor: dismissing ? "wait" : "pointer",
                fontFamily: "inherit",
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── Main recovery card ────────────────────────────────────────────────────────
  const inactiveLabel = daysInactive >= 7
    ? `${daysInactive} days without a check-in`
    : daysInactive === 1
    ? "Yesterday you went quiet"
    : `${daysInactive} days without a check-in`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      style={{ marginBottom: 16 }}
    >
      {/* Emotional header — this is the product's signature moment */}
      <div style={{
        background: "var(--bm-accent-dim)",
        border: "1px solid rgba(240,180,41,0.22)",
        borderRadius: "14px 14px 0 0",
        padding: "16px 20px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#F0B429", marginBottom: 6, fontWeight: 700 }}>
          <span className="bm-status-dot" style={{ background: "#F0B429", marginTop: 0 }} />
          Recovery Mode · {inactiveLabel}
        </div>
        <div style={{ fontSize: 15, color: "var(--bm-text)", fontWeight: 600, lineHeight: 1.4, marginBottom: 6 }}>
          You haven&apos;t disappeared. You just stopped moving.
        </div>
        <div style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.6 }}>
          The gap between where you were and where you need to be closes with one task.
          Not a plan. Not a reflection. One concrete action you can finish right now.
        </div>
      </div>

      {/* Reset Mission */}
      <div style={{
        background: "var(--bm-bg2)",
        border: "1px solid var(--bm-border)",
        borderTop: "none",
        borderRadius: "0 0 14px 14px",
        padding: "20px 20px",
      }}>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", padding: "16px 0" }}>
            <motion.div
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              style={{ fontSize: 13, color: "var(--bm-text4)" }}
            >
              Finding your reset mission…
            </motion.div>
          </div>
        ) : mission ? (
          <>
            <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bm-text4)", marginBottom: 10, fontWeight: 700 }}>
              Reset Mission · {mission.estimatedMinutes} min
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--bm-text)", lineHeight: 1.35, marginBottom: 8 }}>
              {sanitizeOutput(mission.task)}
            </div>
            <div style={{ fontSize: 12, color: "var(--bm-text3)", marginBottom: 20, lineHeight: 1.6, fontStyle: "italic", borderLeft: "2px solid rgba(240,180,41,0.3)", paddingLeft: 10 }}>
              {sanitizeOutput(mission.rationale)}
            </div>
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleComplete}
              disabled={completing}
              style={{
                width: "100%",
                padding: "15px 0",
                borderRadius: 12,
                border: "none",
                background: completing
                  ? "rgba(240,180,41,0.3)"
                  : "var(--bm-accent)",
                color: "#000",
                fontWeight: 700,
                fontSize: 15,
                cursor: completing ? "wait" : "pointer",
                fontFamily: "inherit",
                letterSpacing: "0.01em",
                boxShadow: completing ? "none" : "0 4px 20px rgba(240,180,41,0.2)",
                transition: "all 0.2s",
              }}
            >
              {completing ? "Saving…" : "Done — I finished it →"}
            </motion.button>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontSize: 13, color: "var(--bm-text3)", marginBottom: 12 }}>
              Couldn&apos;t load your reset mission.
            </div>
            <button
              onClick={() => router.refresh()}
              style={{
                background: "none",
                border: "1px solid var(--bm-border2)",
                color: "var(--bm-text3)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 13,
                padding: "8px 16px",
                borderRadius: 8,
              }}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function RecoveryModeCard({ onComplete, onDismiss }: Props) {
  return (
    <AIErrorBoundary feature="Recovery Mode">
      <RecoveryModeCardInner onComplete={onComplete} onDismiss={onDismiss} />
    </AIErrorBoundary>
  );
}
