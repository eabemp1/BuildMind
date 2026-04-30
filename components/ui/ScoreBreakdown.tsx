"use client";

/**
 * components/ui/ScoreBreakdown.tsx
 *
 * Execution score tooltip/popover that makes the score feel earned.
 * Shows exactly what moved the number — tasks, milestones, streak, validation.
 *
 * Usage:
 *   <ScoreBreakdown score={score} taskRate={0.6} milestoneRate={0.4} streak={7}
 *                   stage="MVP" validationStrengths={2} />
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ScoreBreakdownProps {
  score: number;
  taskRate: number;       // 0-1
  milestoneRate: number;  // 0-1
  streak: number;
  stage: string;
  validationStrengths?: number; // count
}

const STAGE_BONUS: Record<string, number> = {
  Idea: 0, Validation: 5, MVP: 8, Launch: 12, Growth: 15, Revenue: 18,
};

const SCORE_COLOR = (s: number) => s >= 60 ? "#4ade80" : s >= 30 ? "#fbbf24" : "#f87171";

interface BreakdownRow {
  label: string;
  pts: number;
  max: number;
  detail: string;
}

function computeBreakdown(props: ScoreBreakdownProps): BreakdownRow[] {
  const taskPts = Math.round(props.taskRate * 30);
  const milestonePts = Math.round(props.milestoneRate * 25);
  const streakPts = Math.min(props.streak * 1.5, 15);
  const stagePts = STAGE_BONUS[props.stage] ?? 0;
  const valPts = Math.min((props.validationStrengths ?? 0) * 5, 20);

  return [
    { label: "Task completion", pts: taskPts, max: 30, detail: `${Math.round(props.taskRate * 100)}% of tasks done` },
    { label: "Milestones hit", pts: milestonePts, max: 25, detail: `${Math.round(props.milestoneRate * 100)}% of milestones complete` },
    { label: "Stage bonus", pts: stagePts, max: 18, detail: `${props.stage} stage (+${stagePts} pts)` },
    { label: "Validation", pts: valPts, max: 20, detail: `${props.validationStrengths ?? 0} confirmed strengths` },
    { label: "Streak", pts: Math.round(streakPts), max: 15, detail: `${props.streak} day streak` },
  ];
}

export function ScoreBreakdown(props: ScoreBreakdownProps) {
  const [open, setOpen] = useState(false);
  const rows = computeBreakdown(props);
  const color = SCORE_COLOR(props.score);

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {/* Score badge — click to open */}
      <button
        onClick={() => setOpen(v => !v)}
        title="What moves my score?"
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          padding: 0, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4,
        }}
      >
        <span style={{ fontSize: 32, fontWeight: 800, color, lineHeight: 1 }}>{props.score}</span>
        <span style={{ fontSize: 11, color: "#555", marginTop: 14 }}>/ 100 ⓘ</span>
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
                background: "rgba(14,14,22,0.97)", border: "1px solid rgba(255,255,255,0.09)",
                borderRadius: 14, padding: "16px 18px", boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                What builds your score
              </div>

              {rows.map(row => (
                <div key={row.label} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "#ccc" }}>{row.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: row.pts >= row.max * 0.6 ? "#4ade80" : "#fbbf24" }}>
                      +{row.pts} <span style={{ color: "#444", fontWeight: 400 }}>/ {row.max}</span>
                    </span>
                  </div>
                  {/* Mini bar */}
                  <div style={{ height: 3, background: "#1a1a2e", borderRadius: 2, overflow: "hidden" }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, (row.pts / row.max) * 100)}%` }}
                      transition={{ duration: 0.5, delay: 0.05 }}
                      style={{ height: "100%", background: row.pts >= row.max * 0.6 ? "#4ade80" : "#fbbf24", borderRadius: 2 }}
                    />
                  </div>
                  <div style={{ fontSize: 10, color: "#444", marginTop: 2 }}>{row.detail}</div>
                </div>
              ))}

              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 11, color: "#444" }}>
                Score updates after each reflection. Complete tasks and hit milestones to move it.
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
