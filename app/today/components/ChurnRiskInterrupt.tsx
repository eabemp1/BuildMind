"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { sanitizeOutput } from "@/lib/sanitizeOutput";
import type { ChurnRiskAssessment } from "@/lib/riskSignals";

interface Props {
  assessment: ChurnRiskAssessment;
  onBeginRecovery: () => Promise<void>;
  onDismiss: () => void;
}

/**
 * ChurnRiskInterrupt — the detection moment. Shown once BuildMind notices
 * a founder-logged signal cluster crosses shouldTriggerRiskInterrupt()
 * (lib/riskSignals.ts). Distinct from the ongoing Recovery Mode state
 * (RecoveryModeCard): this is the "do you want to act on this now" prompt;
 * choosing "Begin recovery" is what activates Recovery Mode.
 */
export function ChurnRiskInterrupt({ assessment, onBeginRecovery, onDismiss }: Props) {
  const [starting, setStarting] = useState(false);
  const who = assessment.topAccount ?? "An account";

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 24px" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
        fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
        color: "var(--bm-red)", fontWeight: 700,
      }}>
        <AlertTriangle size={14} />
        Risk detected
      </div>

      <div style={{
        border: "1px solid var(--bm-red-bd)",
        borderRadius: "var(--r-xl)",
        background: "var(--bm-bg2)",
        overflow: "hidden",
      }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--bm-border)" }}>
          <h1 style={{ fontSize: 19, fontWeight: 700, color: "var(--bm-text)", lineHeight: 1.35, margin: 0 }}>
            {sanitizeOutput(who)} shows {assessment.churnProbability}% churn probability
          </h1>
          <p style={{ fontSize: 13, color: "var(--bm-text3)", marginTop: 8, lineHeight: 1.6 }}>
            {assessment.recentSignals.length} signal{assessment.recentSignals.length === 1 ? "" : "s"} logged in the last 14 days
            {assessment.burnAtRisk > 0 ? ` · $${assessment.burnAtRisk.toLocaleString()}/mo at risk` : ""}.
            Normal recommendations are paused until this is addressed.
          </p>
        </div>

        <div style={{ padding: "16px 24px" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bm-text4)", marginBottom: 10, fontWeight: 700 }}>
            Recent signals
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {assessment.recentSignals.slice(0, 5).map((s) => (
              <div key={s.id} style={{
                display: "flex", justifyContent: "space-between", gap: 12,
                fontSize: 13, color: "var(--bm-text2)", padding: "8px 10px",
                background: "var(--bm-bg3)", borderRadius: 8,
              }}>
                <span>
                  {s.severity === "critical" ? "🔴 " : s.severity === "warning" ? "🟡 " : ""}
                  {sanitizeOutput(s.note)}
                  {s.signal_type === "nps_score" && typeof s.value === "number" ? ` (NPS ${s.value})` : ""}
                </span>
                <span style={{ color: "var(--bm-text4)", fontFamily: "'DM Mono', monospace", fontSize: 11, whiteSpace: "nowrap" }}>
                  {new Date(s.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={async () => {
                setStarting(true);
                try { await onBeginRecovery(); } finally { setStarting(false); }
              }}
              disabled={starting}
              style={{
                flex: 1, padding: "13px 0", borderRadius: 10, border: "none",
                background: starting ? "rgba(240,180,41,0.3)" : "var(--bm-accent)",
                color: "#000", fontWeight: 700, fontSize: 14,
                cursor: starting ? "wait" : "pointer", fontFamily: "inherit",
              }}
            >
              {starting ? "Starting…" : "Begin recovery"}
            </button>
            <button
              onClick={onDismiss}
              style={{
                padding: "13px 18px", borderRadius: 10, border: "1px solid var(--bm-border2)",
                background: "none", color: "var(--bm-text3)", fontSize: 14,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
