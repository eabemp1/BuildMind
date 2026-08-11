"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, BrainCircuit, ChevronDown, ChevronUp, ShieldAlert } from "lucide-react";

export type Signal = {
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  title: string;
  summary: string;
  recommended_response: string;
  evidence?: Array<{ source: string; detail: string; count?: number; window?: string }>;
};

export interface TodayIntelligenceSummary {
  generated_at: string;
  current_goal: string | null;
  top_signals: Signal[];
  what_changed: string[];
  founder_model: { strengths: string[]; avoidance_patterns: string[]; operating_windows: string[]; confidence: number };
  strategy: { stated_priorities: string[]; observed_priorities: string[]; contradictions: string[] };
  decision: {
    top_candidate: { action?: string; expected_evidence: string; why_it_beats_alternatives: string; scores?: { total: number } } | null;
    alternatives?: Array<{ action: string; scores?: { total: number }; why_it_beats_alternatives: string }>;
    basis?: string[];
  };
  cofounder_judgment?: {
    what_matters_now: string;
    largest_constraint: string;
    neglected_area: string | null;
    opportunity_cost: string;
    highest_leverage_action: string | null;
    should_not_do: Array<{ type: string; statement: string; reason: string; evidence: string[]; confidence: number }>;
    reasoning: Array<{ observation: string; interpretation: string; evidence: string[]; confidence: number; implication: string; recommended_action: string; uncertainty: string; smallest_evidence_to_resolve: string }>;
    intervention: { should_intervene: boolean; mode: string; intensity: number; reason: string; evidence: string[] };
    uncertainty: { known: string[]; inferred: string[]; unknown: string[] };
  };
}

export const severityColor: Record<Signal["severity"], string> = { critical: "var(--bm-red)", high: "var(--bm-red)", medium: "var(--bm-accent)", low: "var(--bm-text3)" };

// One sentence, hard cap. A "brief, imposing, readable" panel can't share
// space with three chained ?? fallbacks each contributing a clause — pick
// ONE source per line and trim it, rather than concatenating whichever
// fields happen to be non-null.
function trimToSentence(text: string | undefined | null, maxWords = 26): string {
  if (!text) return "";
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(" ")}…`;
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: "'DM Mono', monospace", color: "var(--bm-text4)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{children}</div>;
}

export function IntelligencePanel({ data }: { data: TodayIntelligenceSummary | null | undefined }) {
  const [open, setOpen] = useState(false);
  if (!data) return null;

  const judgment = data.cofounder_judgment;
  const signal = data.top_signals[0];
  const reasoning = judgment?.reasoning[0];
  const negative = judgment?.should_not_do[0];

  // ONE headline, chosen by priority, not stacked ?? fallbacks that let
  // whichever field is non-null win regardless of how well it reads.
  // Priority: an active intervention > the largest named constraint > the
  // strongest detected signal. If none of those exist, there's genuinely
  // nothing worth a headline and the panel doesn't render at all.
  const headline = judgment?.intervention.should_intervene
    ? judgment.intervention.reason
    : judgment?.largest_constraint ?? signal?.summary;
  if (!headline) return null;

  const isUrgent = judgment?.intervention.mode === "escalation" || judgment?.intervention.mode === "challenge";

  return (
    <section
      aria-label="BuildMind decision brief"
      style={{
        marginBottom: 14,
        border: `1px solid ${isUrgent ? "var(--bm-red)" : "var(--bm-border2)"}`,
        borderRadius: 12,
        overflow: "hidden",
        background: "var(--bm-bg2)",
      }}
    >
      {/* One headline. One line under it. Nothing else competes for the eye. */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "18px 20px" }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center", background: isUrgent ? "rgba(229,72,77,0.12)" : "var(--bm-accent-dim)", border: `1px solid ${isUrgent ? "var(--bm-red)" : "var(--bm-accent-bd)"}`, flex: "0 0 auto" }}>
          {isUrgent ? <AlertTriangle size={16} color="var(--bm-red)" /> : <BrainCircuit size={16} color="var(--bm-accent)" />}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Label>{isUrgent ? "Worth stopping for" : "What's actually going on"}</Label>
          <div style={{ color: "var(--bm-text)", fontSize: 16, fontWeight: 700, lineHeight: 1.4, letterSpacing: "-0.01em" }}>
            {trimToSentence(headline, 28)}
          </div>
          {negative && (
            <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 10, color: "var(--bm-text3)", fontSize: 12.5, lineHeight: 1.5 }}>
              <ShieldAlert size={13} color="var(--bm-text4)" style={{ marginTop: 2, flexShrink: 0 }} />
              <span><span style={{ color: "var(--bm-text2)" }}>Skip:</span> {trimToSentence(negative.statement, 20)}</span>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 20px", background: "var(--bm-bg3)", border: 0, borderTop: "1px solid var(--bm-border)", color: "var(--bm-text3)", fontSize: 12, cursor: "pointer" }}
      >
        <span>See the full reasoning</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div style={{ borderTop: "1px solid var(--bm-border)", padding: "16px 20px", display: "grid", gap: 16 }}>
          {data.what_changed[0] && (
            <div>
              <Label>What changed</Label>
              <div style={{ color: "var(--bm-text2)", fontSize: 13, lineHeight: 1.55 }}>{trimToSentence(data.what_changed[0], 30)}</div>
            </div>
          )}
          {(reasoning?.observation ?? signal?.summary) && (
            <div>
              <Label>What we noticed</Label>
              <div style={{ color: "var(--bm-text2)", fontSize: 13, lineHeight: 1.55 }}>{trimToSentence(reasoning?.observation ?? signal?.summary, 30)}</div>
            </div>
          )}
          {data.decision.top_candidate?.why_it_beats_alternatives && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Label>Why this beats the alternatives</Label>
                {data.decision.top_candidate.scores?.total != null && (
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--bm-intel)" }}>{data.decision.top_candidate.scores.total}/100</span>
                )}
              </div>
              <div style={{ color: "var(--bm-text2)", fontSize: 13, lineHeight: 1.55 }}>{trimToSentence(data.decision.top_candidate.why_it_beats_alternatives, 30)}</div>
            </div>
          )}
          {data.decision.alternatives?.length ? (
            <div>
              <Label>Alternatives considered</Label>
              <div style={{ display: "grid", gap: 6 }}>
                {data.decision.alternatives.slice(0, 3).map((alt, i) => (
                  <div key={`${alt.action}-${i}`} style={{ display: "flex", gap: 8, color: "var(--bm-text3)", fontSize: 12.5, lineHeight: 1.45 }}>
                    <ArrowRight size={13} color="var(--bm-text4)" style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>{trimToSentence(alt.action, 18)}{alt.scores?.total != null ? ` (${alt.scores.total}/100)` : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {(reasoning?.smallest_evidence_to_resolve ?? data.decision.top_candidate?.expected_evidence) && (
            <div>
              <Label>What we're watching for</Label>
              <div style={{ color: "var(--bm-text2)", fontSize: 13, lineHeight: 1.55 }}>{trimToSentence(reasoning?.smallest_evidence_to_resolve ?? data.decision.top_candidate?.expected_evidence, 26)}</div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
