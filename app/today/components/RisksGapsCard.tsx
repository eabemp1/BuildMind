"use client";

/**
 * app/today/components/RisksGapsCard.tsx
 *
 * Spec §11 — "Risks & Gaps". Surfaces state.signals in full (up to 4, per
 * summarizeFounderIntelligenceForClient in lib/founderIntelligence.ts).
 * Previously only top_signals[0] was ever rendered (inside
 * IntelligencePanel) — this card is purely additive, no backend change.
 *
 * Low-severity signals are filtered out here (this is a "risk" surface,
 * not a full signal feed — that's what /insights is for). Evidence per
 * signal uses the shared WhyReveal component rather than inventing a new
 * evidence pattern.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { WhyReveal } from "@/components/ui/WhyReveal";
import { severityColor, type Signal } from "./IntelligencePanel";

const severityLabel: Record<Signal["severity"], string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function RisksGapsCard({ signals }: { signals: Signal[] }) {
  const risks = signals.filter((s) => s.severity !== "low");

  return (
    <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 6, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: "-0.01em", margin: 0, color: "var(--bm-text)" }}>
          Risks &amp; gaps to watch
        </h3>
        <Link
          href="/progress?tab=patterns"
          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--bm-text3)", textDecoration: "none" }}
        >
          View all risks <ArrowRight size={11} />
        </Link>
      </div>

      {risks.length === 0 ? (
        <div style={{ marginTop: 10, color: "var(--bm-text3)", fontSize: 12.5, lineHeight: 1.55 }}>
          No high-priority risks detected right now. BuildMind hasn't found enough behavioral data to flag a gap yet.
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          {risks.map((signal, i) => (
            <div
              key={`${signal.title}-${i}`}
              style={{
                padding: "10px 0",
                borderBottom: i < risks.length - 1 ? "1px solid var(--bm-border)" : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--bm-text)" }}>{signal.title}</div>
                  <div style={{ fontSize: 11, color: "var(--bm-text3)", marginTop: 2 }}>{signal.summary}</div>
                </div>
                <span
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 9.5,
                    whiteSpace: "nowrap",
                    padding: "2px 7px",
                    borderRadius: 4,
                    color: severityColor[signal.severity],
                    background:
                      signal.severity === "critical" || signal.severity === "high"
                        ? "var(--bm-red-dim)"
                        : "var(--bm-accent-dim)",
                  }}
                >
                  {severityLabel[signal.severity]}
                </span>
              </div>

              {signal.evidence && signal.evidence.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <WhyReveal
                    items={signal.evidence.map((e) => ({
                      label: e.source,
                      value: e.count != null ? `${e.detail} (${e.count}${e.window ? `, ${e.window}` : ""})` : e.detail,
                    }))}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default RisksGapsCard;
