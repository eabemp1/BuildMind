"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, BrainCircuit, ChevronDown, ChevronUp, CircleHelp, Eye, FlaskConical, ShieldAlert, Sparkles, Target } from "lucide-react";

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

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: "'DM Mono', monospace", color: "var(--bm-text4)", fontSize: 10, textTransform: "uppercase", marginBottom: 6 }}>{children}</div>;
}

function EvidenceList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 5 }}>
    {items.slice(0, 3).map((item, index) => <li key={`${item}-${index}`} style={{ display: "flex", gap: 7, color: "var(--bm-text3)", fontSize: 12, lineHeight: 1.45 }}><span style={{ color: "var(--bm-accent)" }}>+</span>{item}</li>)}
  </ul>;
}

export function IntelligencePanel({ data }: { data: TodayIntelligenceSummary | null | undefined }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  if (!data) return null;

  const judgment = data.cofounder_judgment;
  const signal = data.top_signals[0];
  const reasoning = judgment?.reasoning[0];
  const negative = judgment?.should_not_do[0];
  const changed = data.what_changed[0];
  const hasContent = judgment || signal || changed;
  if (!hasContent) return null;

  const interventionTone = judgment?.intervention.mode === "escalation" || judgment?.intervention.mode === "challenge" ? "var(--bm-red)" : "var(--bm-accent)";

  return (
    <section aria-label="BuildMind decision brief" style={{ marginBottom: 16, border: "1px solid var(--bm-border2)", borderRadius: 8, overflow: "hidden", background: "var(--bm-bg2)", boxShadow: "0 18px 40px rgba(0,0,0,0.12)" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "16px 18px", borderBottom: "1px solid var(--bm-border)", background: "linear-gradient(105deg, var(--bm-bg3), var(--bm-bg2))" }}>
        <div style={{ width: 32, height: 32, borderRadius: 7, display: "grid", placeItems: "center", background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)", flex: "0 0 auto" }}><BrainCircuit size={17} color="var(--bm-accent)" /></div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Label>Why this is the highest-leverage move</Label>
          <div style={{ color: "var(--bm-text)", fontSize: 16, fontWeight: 700, lineHeight: 1.35 }}>{judgment?.largest_constraint ?? signal?.summary ?? "Calibrating the highest-leverage next move"}</div>
          {data.current_goal && <div style={{ color: "var(--bm-text3)", fontSize: 12, marginTop: 5 }}>Current goal: {data.current_goal}</div>}
        </div>
        {judgment?.intervention.should_intervene && <div style={{ display: "flex", gap: 5, alignItems: "center", color: interventionTone, fontSize: 11, fontFamily: "'DM Mono', monospace", textTransform: "uppercase", flex: "0 0 auto" }}><AlertTriangle size={13} />{judgment.intervention.mode}</div>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div style={{ padding: "15px 18px", borderRight: "1px solid var(--bm-border)" }}>
          <Label>What changed</Label>
          <div style={{ color: "var(--bm-text2)", fontSize: 13, lineHeight: 1.55 }}>{changed ?? "No material shift detected. BuildMind is monitoring for a meaningful change."}</div>
        </div>
        <div style={{ padding: "15px 18px" }}>
          <Label>Opportunity cost</Label>
          <div style={{ color: "var(--bm-text)", fontSize: 13, lineHeight: 1.55, fontWeight: 600 }}>{judgment?.opportunity_cost ?? "No high-confidence opportunity cost identified yet."}</div>
          {judgment?.neglected_area && <div style={{ marginTop: 7, color: "var(--bm-text3)", fontSize: 12 }}>Neglected: {judgment.neglected_area}</div>}
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--bm-border)", padding: "15px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}><Eye size={14} color="var(--bm-accent)" /><Label>What BuildMind noticed</Label><span style={{ marginTop: -6, color: severityColor[signal?.severity ?? "low"], fontSize: 11 }}>{signal?.title}</span></div>
        <div style={{ color: "var(--bm-text2)", fontSize: 13, lineHeight: 1.6 }}>{reasoning?.observation ?? signal?.summary}</div>
        <EvidenceList items={reasoning?.evidence ?? signal?.evidence?.map((item) => `${item.source}: ${item.detail}`) ?? []} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", borderTop: "1px solid var(--bm-border)" }}>
        <div style={{ padding: "15px 18px", borderRight: "1px solid var(--bm-border)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><Target size={14} color="var(--bm-accent)" /><Label>Why this beats the alternatives</Label></div>
          {/* Intentionally NOT repeating the action title here — it's already the
              headline of the Today Task card above. This panel is reasoning only. */}
          <div style={{ color: "var(--bm-text)", fontSize: 13, lineHeight: 1.55, fontWeight: 500 }}>{data.decision.top_candidate?.why_it_beats_alternatives ?? judgment?.opportunity_cost ?? "This is the single action most likely to move your highest-priority goal forward right now."}</div>
          {data.decision.top_candidate?.scores?.total != null && (
            <div style={{ display: "inline-flex", marginTop: 9, fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--bm-intel)", background: "var(--bm-intel-dim)", border: "1px solid var(--bm-intel-bd)", borderRadius: 5, padding: "2px 8px" }}>
            Score {data.decision.top_candidate.scores.total}/100
            </div>
          )}
        </div>
        <div style={{ padding: "15px 18px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><ShieldAlert size={14} color={negative ? "var(--bm-red)" : "var(--bm-text4)"} /><Label>What you should not do</Label></div>
          <div style={{ color: negative ? "var(--bm-text2)" : "var(--bm-text3)", fontSize: 13, lineHeight: 1.55 }}>{negative?.statement ?? "No high-confidence stop or pause recommendation right now."}</div>
          {negative && <div style={{ color: "var(--bm-text3)", fontSize: 12, lineHeight: 1.45, marginTop: 7 }}>{negative.reason}</div>}
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--bm-border)", padding: "15px 18px", background: "var(--bm-bg3)" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}><FlaskConical size={14} color="var(--bm-accent)" /><Label>What we will learn</Label></div>
        <div style={{ color: "var(--bm-text2)", fontSize: 13, lineHeight: 1.55 }}>{reasoning?.smallest_evidence_to_resolve ?? data.decision.top_candidate?.expected_evidence ?? "The next observable outcome will refine this recommendation."}</div>
      </div>

      <button type="button" onClick={() => setDetailsOpen((current) => !current)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 18px", background: "transparent", border: 0, borderTop: "1px solid var(--bm-border)", color: "var(--bm-text3)", fontSize: 12, cursor: "pointer" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Sparkles size={13} />How BuildMind reached this judgment</span>{detailsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {detailsOpen && <div style={{ borderTop: "1px solid var(--bm-border)", padding: "15px 18px", display: "grid", gap: 14 }}>
        <div><Label>Interpretation and uncertainty</Label><div style={{ color: "var(--bm-text2)", fontSize: 13, lineHeight: 1.55 }}>{reasoning?.interpretation ?? signal?.recommended_response}</div><div style={{ color: "var(--bm-text3)", fontSize: 12, lineHeight: 1.5, marginTop: 7 }}><CircleHelp size={12} style={{ verticalAlign: "-2px", marginRight: 5 }} />{reasoning?.uncertainty ?? judgment?.uncertainty.unknown[0] ?? "No unresolved uncertainty has been identified."}</div></div>
        {data.strategy.contradictions[0] && <div><Label>Potential contradiction</Label><div style={{ color: "var(--bm-text2)", fontSize: 13, lineHeight: 1.55 }}>{data.strategy.contradictions[0]}</div></div>}
        {data.decision.alternatives?.length ? <div><Label>Alternatives considered</Label><div style={{ display: "grid", gap: 6 }}>{data.decision.alternatives.slice(0, 3).map((alternative, index) => <div key={`${alternative.action}-${index}`} style={{ display: "flex", gap: 8, color: "var(--bm-text3)", fontSize: 12, lineHeight: 1.45 }}><ArrowRight size={13} color="var(--bm-text4)" />{alternative.action}{alternative.scores?.total != null ? ` (${alternative.scores.total}/100)` : ""}</div>)}</div></div> : null}
      </div>}
    </section>
  );
}
