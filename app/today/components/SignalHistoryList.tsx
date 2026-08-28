"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { sanitizeOutput } from "@/lib/sanitizeOutput";
import type { RiskSignal, ChurnRiskAssessment, SignalSeverity } from "@/lib/riskSignals";

interface Props {
  projectId: string;
  /** Bumped by the parent (e.g. after SignalCaptureForm logs a new entry)
   *  to trigger a refetch without this component owning that state. */
  refreshKey?: number;
  onAssessmentChange?: (assessment: ChurnRiskAssessment) => void;
}

const SEVERITY_COLOR: Record<SignalSeverity, string> = {
  critical: "var(--bm-red)",
  warning: "var(--bm-amber, #F0B429)",
  neutral: "var(--bm-text4)",
  positive: "var(--bm-green)",
};

const TYPE_LABEL: Record<RiskSignal["signal_type"], string> = {
  support_ticket: "Support ticket",
  nps_score: "NPS score",
  customer_message: "Customer message",
  other: "Signal",
};

/**
 * SignalHistoryList — view/delete for what SignalCaptureForm logs. Signals
 * were write-only before this (visible only inside the Risk Interrupt /
 * Recovery Mode cards once a threshold was crossed) — this makes the raw
 * log itself inspectable and correctable.
 */
export function SignalHistoryList({ projectId, refreshKey, onAssessmentChange }: Props) {
  const [open, setOpen] = useState(false);
  const [signals, setSignals] = useState<RiskSignal[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const fetchSignals = () => {
    setLoading(true);
    fetch(`/api/risk-signals?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((d: { ok?: boolean; signals?: RiskSignal[]; assessment?: ChurnRiskAssessment } | null) => {
        if (d?.ok) {
          setSignals(d.signals ?? []);
          if (d.assessment) onAssessmentChange?.(d.assessment);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true))
      .finally(() => setLoading(false));
  };

  // Refetch when opened, and whenever the parent bumps refreshKey while open.
  useEffect(() => {
    if (open) fetchSignals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refreshKey]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/risk-signals?id=${encodeURIComponent(id)}&projectId=${encodeURIComponent(projectId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSignals((prev) => prev.filter((s) => s.id !== id));
        const body = await res.json().catch(() => null) as { assessment?: ChurnRiskAssessment } | null;
        if (body?.assessment) onAssessmentChange?.(body.assessment);
      }
    } catch {}
    setDeletingId(null);
  };

  return (
    <div style={{ border: "1px solid var(--bm-border)", borderRadius: "var(--r-xl)", background: "var(--bm-bg2)", marginTop: 8 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", background: "none", border: "none", cursor: "pointer",
          fontFamily: "inherit", color: "var(--bm-text3)", fontSize: 12, fontWeight: 600,
        }}
      >
        <span>Signal history{loaded ? ` (${signals.length})` : ""}</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div style={{ padding: "0 16px 16px" }}>
          {loading && signals.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--bm-text4)", padding: "8px 0" }}>Loading…</div>
          ) : signals.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--bm-text4)", padding: "8px 0" }}>
              Nothing logged yet for this project.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {signals.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10,
                    padding: "8px 10px", background: "var(--bm-bg3)", borderRadius: 8,
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: SEVERITY_COLOR[s.severity], flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {TYPE_LABEL[s.signal_type]}
                      </span>
                      {s.customer_name ? (
                        <span style={{ fontSize: 11, color: "var(--bm-text4)" }}>· {sanitizeOutput(s.customer_name)}</span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.4 }}>
                      {sanitizeOutput(s.note)}
                      {s.signal_type === "nps_score" && typeof s.value === "number" ? ` (NPS ${s.value})` : ""}
                      {typeof s.mrr_at_risk === "number" && s.mrr_at_risk > 0 ? ` · $${s.mrr_at_risk.toLocaleString()}/mo at risk` : ""}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--bm-text4)", fontFamily: "'DM Mono', monospace", marginTop: 2 }}>
                      {new Date(s.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(s.id)}
                    disabled={deletingId === s.id}
                    aria-label="Delete signal"
                    style={{
                      background: "none", border: "none", cursor: deletingId === s.id ? "wait" : "pointer",
                      color: "var(--bm-text4)", padding: 4, flexShrink: 0,
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
