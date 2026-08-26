"use client";

import type { TodayIntelligenceSummary } from "./IntelligencePanel";

/**
 * Context Alignment — shown alongside the Decision Brief only while
 * BuildMind is still calibrating (actionData.isLowConfidence). Answers the
 * three questions a founder actually has in that moment: what does
 * BuildMind already know, what's still unknown, and what's the smallest
 * next step that closes the gap.
 *
 * Every field here is read straight off the coherence layer's client
 * summary (lib/founderIntelligence.ts → summarizeFounderIntelligenceForClient)
 * — nothing here is invented copy:
 *   - "What we know"     → cofounder_judgment.uncertainty.known
 *   - "What we don't know" → cofounder_judgment.uncertainty.unknown
 *   - "Next step"        → decision.top_candidate.expected_evidence
 * Falls back to strategy.stated_priorities / strategy.contradictions when
 * cofounder_judgment hasn't been computed yet (e.g. very first session),
 * and renders nothing if none of those are present rather than showing an
 * empty shell.
 */
export function ContextAlignmentCard({ intelligence }: { intelligence: TodayIntelligenceSummary | null | undefined }) {
  if (!intelligence) return null;

  const known = intelligence.cofounder_judgment?.uncertainty?.known?.length
    ? intelligence.cofounder_judgment.uncertainty.known
    : intelligence.strategy?.stated_priorities ?? [];

  const unknown = intelligence.cofounder_judgment?.uncertainty?.unknown?.length
    ? intelligence.cofounder_judgment.uncertainty.unknown
    : intelligence.strategy?.contradictions ?? [];

  const nextStep = intelligence.decision?.top_candidate?.expected_evidence;

  if (!known.length && !unknown.length && !nextStep) return null;

  return (
    <div
      style={{
        background: "var(--bm-bg2)",
        border: "1px solid var(--bm-border)",
        borderRadius: "var(--r-xl)",
        padding: "16px",
        height: "fit-content",
      }}
    >
      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--bm-text4)", margin: "0 0 10px" }}>
        Context alignment
      </p>

      {known.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 10, color: "var(--bm-text3)", margin: "0 0 4px", fontWeight: 600 }}>What we know</p>
          <ul style={{ margin: 0, paddingLeft: 14, fontSize: 11, color: "var(--bm-text2)", lineHeight: 1.7 }}>
            {known.slice(0, 3).map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      )}

      {unknown.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 10, color: "var(--bm-text3)", margin: "0 0 4px", fontWeight: 600 }}>What we don&apos;t know</p>
          <ul style={{ margin: 0, paddingLeft: 14, fontSize: 11, color: "var(--bm-text2)", lineHeight: 1.7 }}>
            {unknown.slice(0, 3).map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      )}

      {nextStep && (
        <div>
          <p style={{ fontSize: 10, color: "var(--bm-text3)", margin: "0 0 4px", fontWeight: 600 }}>Next step</p>
          <p style={{ fontSize: 11, color: "var(--bm-accent)", lineHeight: 1.6, margin: 0 }}>{nextStep}</p>
        </div>
      )}
    </div>
  );
}
