"use client";

/**
 * components/ui/ScoreBreakdown.tsx
 *
 * Global score tooltip/popover that makes the score feel earned.
 * Mirrors lib/scoring computeStartupScore: execution, momentum, XP, streak,
 * and validation strengths.
 *
 * Usage:
 *   <ScoreBreakdown score={score} executionScore={70} momentumScore={64}
 *                   xp={500} streak={7} validationStrengths={2} />
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ScoreBreakdownProps {
  score: number;
  executionScore?: number | null;
  momentumScore?: number | null;
  xp?: number | null;
  streak?: number | null;
  validationStrengths?: number; // count
  compact?: boolean;
}

const SCORE_COLOR = (s: number) => s >= 60 ? "var(--bm-green)" : s >= 30 ? "var(--bm-amber)" : "var(--bm-red)";

interface BreakdownRow {
  label: string;
  pts: number;
  max: number;
  detail: string;
}

function computeBreakdown(props: ScoreBreakdownProps): BreakdownRow[] {
  const execution = props.executionScore ?? 0;
  const momentum = props.momentumScore ?? 0;
  const xp = props.xp ?? 0;
  const streak = Math.min(props.streak ?? 0, 30);
  const validationStrengths = props.validationStrengths ?? 0;
  const xpPts =
    xp >= 3500 ? 20 :
    xp >= 2000 ? 16 :
    xp >= 1000 ? 12 :
    xp >= 500 ? 8 :
    xp >= 200 ? 4 : 0;
  const streakPts = Math.round((streak / 30) * 10);
  const validationPts = Math.min(20, validationStrengths * 4);

  return [
    { label: "Execution quality", pts: Math.round(execution * 0.45), max: 45, detail: `${execution}/100 execution score` },
    { label: "Momentum", pts: Math.round(momentum * 0.25), max: 25, detail: `${momentum}/100 momentum score` },
    { label: "XP boost", pts: xpPts, max: 20, detail: `${xp} achievement XP` },
    { label: "Validation", pts: validationPts, max: 20, detail: `${validationStrengths} confirmed strengths` },
    { label: "Streak", pts: streakPts, max: 10, detail: `${props.streak ?? 0} day streak` },
  ];
}

export function ScoreBreakdown(props: ScoreBreakdownProps) {
  const [open, setOpen] = useState(false);
  const rows = computeBreakdown(props);
  const color = SCORE_COLOR(props.score);
  const compact = props.compact ?? false;

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {/* Score badge — click to open */}
      <button
        onClick={() => setOpen(v => !v)}
        title="What moves my score?"
        style={{
          background: compact ? "var(--bm-bg3)" : "transparent",
          border: compact ? "1px solid var(--bm-border)" : "none",
          borderRadius: compact ? 999 : 0,
          cursor: "pointer",
          padding: compact ? "5px 9px" : 0,
          fontFamily: "inherit",
          display: "flex",
          alignItems: "center",
          gap: compact ? 6 : 4,
        }}
      >
        <span style={{ fontSize: compact ? 13 : 32, fontWeight: 800, color, lineHeight: 1 }}>{props.score}</span>
        <span style={{ fontSize: compact ? 10 : 11, color: "var(--bm-text3)", marginTop: compact ? 0 : 14 }}>
          {compact ? "score details" : "/ 100 details"}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 49 }} />

            {/* Popover */}
            <motion.div
              key="breakdown"
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              style={{
                position: "absolute", top: "calc(100% + 10px)", left: "50%", transform: "translateX(-50%)",
                zIndex: 50, width: 280,
                background: "rgba(14,14,22,0.97)", border: "1px solid var(--bm-border2)",
                borderRadius: 14, padding: "16px 18px", boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                Global score model
              </div>

              {rows.map(row => (
                <div key={row.label} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "#ccc" }}>{row.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: row.pts >= row.max * 0.6 ? "var(--bm-green)" : "var(--bm-amber)" }}>
                      +{row.pts} <span style={{ color: "#444", fontWeight: 400 }}>/ {row.max}</span>
                    </span>
                  </div>
                  {/* Mini bar */}
                  <div style={{ height: 3, background: "#1a1a2e", borderRadius: 2, overflow: "hidden" }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, (row.pts / row.max) * 100)}%` }}
                      transition={{ duration: 0.5, delay: 0.05 }}
                      style={{ height: "100%", background: row.pts >= row.max * 0.6 ? "var(--bm-green)" : "var(--bm-amber)", borderRadius: 2 }}
                    />
                  </div>
                  <div style={{ fontSize: 10, color: "#444", marginTop: 2 }}>{row.detail}</div>
                </div>
              ))}

              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--bm-border)", fontSize: 11, color: "#444" }}>
                Score updates from execution quality, momentum, validation, XP, and streak.
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
