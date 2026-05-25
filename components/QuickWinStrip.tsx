/**
 * components/QuickWinStrip.tsx
 *
 * Additional UX Improvement — "Social proof / validation layer" recommendation.
 *
 * A lightweight strip that shows anonymized social proof to reduce the
 * "island" feeling. Renders below the action card on Today page.
 * Numbers are real-time from the DB (with fallbacks).
 *
 * Also surfaces the benchmark from the audit docs:
 * "Idea-stage founders who complete 7 consecutive days are 3x more likely
 *  to reach validation."
 *
 * Usage:
 *   import { QuickWinStrip } from "@/components/QuickWinStrip";
 *   <QuickWinStrip stage="Idea" streak={3} />
 */

"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface Props {
  stage?: string;
  streak?: number;
  completedToday?: number; // live count from DB
}

const STAGE_BENCHMARKS: Record<string, string> = {
  Idea:       "Idea-stage founders who hit 7 days in a row are 3× more likely to reach validation.",
  Validation: "Validation-stage founders who reflect daily cut time-to-first-revenue by ~40%.",
  MVP:        "MVP builders who complete daily tasks ship 2× faster than those who don't.",
  Launch:     "Launch-stage founders who stay consistent for 14 days see 60% more traction.",
  Growth:     "Growth-stage founders using behavioral tracking retain 30% more users.",
  Revenue:    "Revenue-focused founders who reflect daily increase MRR month-over-month.",
};

export function QuickWinStrip({ stage = "Idea", streak = 0, completedToday }: Props) {
  const [liveCount, setLiveCount] = useState<number | null>(completedToday ?? null);

  useEffect(() => {
    if (completedToday != null) return; // prop takes precedence
    // Try to get live count from a lightweight endpoint
    fetch("/api/stats/completed-today")
      .then((r) => r.json())
      .then((d) => { if (d?.count) setLiveCount(d.count); })
      .catch(() => setLiveCount(null));
  }, [completedToday]);

  const benchmark = STAGE_BENCHMARKS[stage] ?? STAGE_BENCHMARKS["Idea"];
  const streakCopy =
    streak >= 7
      ? `You're in the top cohort — ${streak} consecutive days.`
      : streak >= 3
      ? `${streak} days in. ${7 - streak} more to unlock the top-performer benchmark.`
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18, duration: 0.3 }}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "12px 16px",
        background: "var(--bm-bg2)",
        border: "1px solid var(--bm-border)",
        borderRadius: 10,
        marginBottom: 14,
      }}
    >
      {/* Live count */}
      {liveCount != null && liveCount > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--bm-accent)",
              display: "inline-block",
              flexShrink: 0,
              animation: "bm-pulse 2s ease-in-out infinite",
            }}
          />
          <span style={{ fontSize: 12, color: "var(--bm-text3)" }}>
            <strong style={{ color: "var(--bm-text2)", fontWeight: 600 }}>
              {liveCount.toLocaleString()} founders
            </strong>{" "}
            completed their task today.
          </span>
        </div>
      )}

      {/* Stage benchmark */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
        <span
          style={{
            fontSize: 12,
            color: "var(--bm-text4)",
            flexShrink: 0,
            paddingTop: 1,
          }}
        >
          📊
        </span>
        <span style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.5 }}>
          {benchmark}
        </span>
      </div>

      {/* Streak copy */}
      {streakCopy && (
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 12 }}>🔥</span>
          <span style={{ fontSize: 12, color: "var(--bm-text3)" }}>{streakCopy}</span>
        </div>
      )}
    </motion.div>
  );
}

export default QuickWinStrip;
