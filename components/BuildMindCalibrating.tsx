/**
 * components/BuildMindCalibrating.tsx
 *
 * Product Improvement #3 — Empty-state investment for days 1–5.
 *
 * Renders in place of any under-signal surface (Insights tab in Progress,
 * Break My Startup) when reflections.count < 7. Converts "nothing here yet"
 * into "something is being earned."
 *
 * Usage:
 *   import { BuildMindCalibrating } from "@/components/BuildMindCalibrating";
 *   if (reflectionCount < 7) return <BuildMindCalibrating count={reflectionCount} />;
 */

"use client";

import { motion } from "framer-motion";

interface Props {
  /** How many reflections the founder has completed (0–6) */
  count: number;
  /** Optional: surface name for the "you'll unlock" copy */
  surface?: "insights" | "break-my-startup" | "patterns";
}

const SURFACE_UNLOCK_COPY: Record<NonNullable<Props["surface"]>, string[]> = {
  insights: [
    "Avoidance pattern detection",
    "Behavioral calibration",
    "Personalised weekly analysis",
  ],
  "break-my-startup": [
    "Deep startup risk analysis",
    "Competitor moat mapping",
    "Stage-specific survival score",
  ],
  patterns: [
    "Day-of-week momentum trends",
    "Confidence by outcome type",
    "Override reason clustering",
  ],
};

export function BuildMindCalibrating({ count, surface = "insights" }: Props) {
  const total = 7;
  const filled = Math.min(count, total);
  const unlockCopy = SURFACE_UNLOCK_COPY[surface];
  const nextSignal = filled + 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      style={{
        maxWidth: 480,
        margin: "48px auto",
        padding: "28px 28px 24px",
        background: "var(--bm-bg2)",
        border: "1px solid var(--bm-border2)",
        borderRadius: 16,
        textAlign: "center",
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "var(--bm-accent-dim)",
          border: "1px solid var(--bm-accent-bd)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 18px",
          fontSize: 20,
        }}
      >
        ⚡
      </div>

      {/* Headline */}
      <p
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "var(--bm-text)",
          letterSpacing: "-0.02em",
          margin: "0 0 6px",
        }}
      >
        BuildMind is learning how you build.
      </p>
      <p
        style={{
          fontSize: 13,
          color: "var(--bm-text3)",
          lineHeight: 1.55,
          margin: "0 0 20px",
        }}
      >
        Each reflection trains the system on your patterns. More signal, sharper analysis.
      </p>

      {/* Progress bar */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            display: "flex",
            gap: 5,
            justifyContent: "center",
            marginBottom: 8,
          }}
        >
          {Array.from({ length: total }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.04, duration: 0.2 }}
              style={{
                width: 28,
                height: 8,
                borderRadius: 4,
                background:
                  i < filled
                    ? "var(--bm-accent)"
                    : "var(--bm-bg4)",
                border: i < filled
                  ? "1px solid var(--bm-accent-bd)"
                  : "1px solid var(--bm-border)",
                transition: "background 0.3s",
              }}
            />
          ))}
        </div>
        <p
          style={{
            fontSize: 11,
            color: "var(--bm-text3)",
            fontFamily: "'DM Mono', monospace",
            margin: 0,
          }}
        >
          {filled} of {total} signals collected
        </p>
      </div>

      {/* Unlock list */}
      <div
        style={{
          background: "var(--bm-bg3)",
          border: "1px solid var(--bm-border)",
          borderRadius: 10,
          padding: "14px 16px",
          textAlign: "left",
          marginBottom: 18,
        }}
      >
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "var(--bm-text4)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            margin: "0 0 10px",
          }}
        >
          After {total} reflections, you unlock:
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {unlockCopy.map((item, i) => (
            <div
              key={i}
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: i < filled ? "var(--bm-accent)" : "var(--bm-text4)",
                  flexShrink: 0,
                  fontWeight: 700,
                }}
              >
                {i < filled ? "✓" : "○"}
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: i < filled ? "var(--bm-text2)" : "var(--bm-text3)",
                }}
              >
                {item}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      {filled < total && (
        <p
          style={{
            fontSize: 12,
            color: "var(--bm-text3)",
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          Tonight&apos;s reflection is{" "}
          <span style={{ color: "var(--bm-accent)", fontWeight: 600 }}>
            signal {nextSignal}
          </span>
          .
        </p>
      )}
    </motion.div>
  );
}

export default BuildMindCalibrating;
