"use client";

/**
 * components/ConfidenceBadge.tsx — AI Improvement #4
 *
 * Displays the AI pipeline's confidence score alongside AI-generated outputs.
 * The Reflexion pipeline already computes confidence_score (0–1) but previously
 * never showed it to founders. Hiding uncertainty builds false trust.
 *
 * Design intent: small, unobtrusive, honest.
 *   - ≥ 0.75: no badge shown (high confidence outputs speak for themselves)
 *   - 0.5–0.74: amber "Based on limited data" badge
 *   - < 0.5: red "Low confidence" badge with tooltip explaining what's missing
 *
 * Usage:
 *   <ConfidenceBadge score={0.42} missingData={["target users", "pricing model"]} />
 *   <ConfidenceBadge score={0.8} />  // renders nothing
 */

import { useState } from "react";
import { sanitizeOutput } from "@/lib/sanitizeOutput";

interface Props {
  /** 0–1 confidence score from Reflexion pipeline */
  score: number;
  /** Items from missing_data[] in the Stage 5 output */
  missingData?: string[];
  /** Override label for the badge */
  label?: string;
}

export function ConfidenceBadge({ score, missingData = [], label }: Props) {
  const [tooltipOpen, setTooltipOpen] = useState(false);

  // High confidence — don't clutter the UI
  if (score >= 0.75) return null;

  const isLow    = score < 0.5;
  const badgeColor = isLow
    ? { bg: "var(--bm-red-dim)", border: "var(--bm-red-bd)", text: "var(--bm-red)" }
    : { bg: "var(--bm-accent-dim)", border: "var(--bm-accent-bd)", text: "var(--bm-amber)" };

  const defaultLabel = isLow ? "Low confidence" : "Based on limited data";
  const displayLabel = label ?? defaultLabel;

  const pct = Math.round(score * 100);

  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        type="button"
        onClick={() => setTooltipOpen((o) => !o)}
        onBlur={() => setTooltipOpen(false)}
        aria-label={`AI confidence: ${pct}%. Click for details.`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          padding: "2px 8px",
          borderRadius: "12px",
          background: badgeColor.bg,
          border: `1px solid ${badgeColor.border}`,
          color: badgeColor.text,
          fontSize: "11px",
          fontWeight: 500,
          cursor: missingData.length > 0 ? "pointer" : "default",
          lineHeight: 1.4,
          userSelect: "none",
        }}
      >
        <span style={{ fontSize: "9px" }}>◉</span>
        {sanitizeOutput(displayLabel)} · {pct}%
        {missingData.length > 0 && (
          <span style={{ fontSize: "9px", opacity: 0.7 }}>▾</span>
        )}
      </button>

      {tooltipOpen && missingData.length > 0 && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0,
            zIndex: 50,
            background: "#1f2937",
            border: "1px solid #374151",
            borderRadius: "8px",
            padding: "10px 12px",
            minWidth: "220px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          }}
        >
          <span style={{
            display: "block",
            fontSize: "11px",
            fontWeight: 600,
            color: "#e5e7eb",
            marginBottom: "6px",
          }}>
            Confidence would improve with:
          </span>
          <ul style={{ margin: 0, padding: "0 0 0 14px", listStyle: "disc" }}>
            {missingData.slice(0, 4).map((item, i) => (
              <li key={i} style={{ fontSize: "11px", color: "#9ca3af", lineHeight: 1.5 }}>
                {sanitizeOutput(item)}
              </li>
            ))}
          </ul>
        </span>
      )}
    </span>
  );
}

export default ConfidenceBadge;
