"use client";

/**
 * app/today/components/IntelligencePanel.tsx — Phase 10
 *
 * Layers the Founder Intelligence coherence layer (lib/founderIntelligence.ts)
 * ABOVE the existing Today task card, exactly as the spec requires:
 * "Do not delete Today. Upgrade it." This does not replace the primary
 * action card below it — it only adds:
 *   - what changed
 *   - what BuildMind detected (top signal) and why it matters
 *   - what it predicts the founder may struggle with (avoidance pattern)
 *   - the expected evidence it's watching for from today's action
 *
 * Renders nothing if there's no intelligence summary yet (e.g. brand new
 * founder with no history) — additive only, never a loading blocker.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";

export interface TodayIntelligenceSummary {
  generated_at: string;
  current_goal: string | null;
  top_signals: Array<{
    type: string;
    severity: "low" | "medium" | "high" | "critical";
    confidence: number;
    title: string;
    summary: string;
    recommended_response: string;
  }>;
  what_changed: string[];
  founder_model: {
    strengths: string[];
    avoidance_patterns: string[];
    operating_windows: string[];
    confidence: number;
  };
  decision: {
    top_candidate: { expected_evidence: string; why_it_beats_alternatives: string } | null;
  };
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: "var(--bm-red)",
  high: "var(--bm-red)",
  medium: "var(--bm-accent)",
  low: "var(--bm-text3)",
};

export function IntelligencePanel({ data }: { data: TodayIntelligenceSummary | null | undefined }) {
  const [expanded, setExpanded] = useState(false);
  if (!data) return null;

  const topSignal = data.top_signals[0];
  const struggle = data.founder_model.avoidance_patterns[0];
  const changed = data.what_changed[0];

  // Nothing meaningful to show yet (very new founder) — stay silent rather
  // than showing an empty-feeling box.
  if (!topSignal && !changed && !struggle) return null;

  return (
    <div
      style={{
        border: "1px solid var(--bm-border)",
        borderRadius: 10,
        background: "var(--bm-bg3)",
        marginBottom: 14,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <Sparkles size={13} color="var(--bm-accent)" />
        <span style={{ fontSize: 11, color: "var(--bm-text3)", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          What BuildMind noticed
        </span>
        {topSignal && (
          <span style={{ fontSize: 11, color: SEVERITY_COLOR[topSignal.severity] ?? "var(--bm-text3)", marginLeft: 4 }}>
            {topSignal.title}
          </span>
        )}
        <span style={{ marginLeft: "auto", color: "var(--bm-text4)" }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {changed && (
            <div>
              <div style={{ fontSize: 10, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>What changed</div>
              <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: 0, lineHeight: 1.5 }}>{changed}</p>
            </div>
          )}

          {topSignal && (
            <div>
              <div style={{ fontSize: 10, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Why it matters</div>
              <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: 0, lineHeight: 1.5 }}>{topSignal.summary}</p>
            </div>
          )}

          {struggle && (
            <div>
              <div style={{ fontSize: 10, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>May be a struggle today</div>
              <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: 0, lineHeight: 1.5 }}>{struggle}</p>
            </div>
          )}

          {data.decision.top_candidate?.expected_evidence && (
            <div>
              <div style={{ fontSize: 10, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>BuildMind will learn from today's outcome</div>
              <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: 0, lineHeight: 1.5 }}>{data.decision.top_candidate.expected_evidence}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
