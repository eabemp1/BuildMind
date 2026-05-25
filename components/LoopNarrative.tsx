"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, RotateCcw } from "lucide-react";
import { storage } from "@/lib/storage";

interface Props {
  reflectionCount: number;
  tasksCompleted: number;
  avoidanceZones?: string[];
  completionRate?: number;
  topConfidencePattern?: string;
  lowMomentumDay?: string;
}

const MILESTONES = [5, 10, 20, 30, 50];

function getStorageKey(count: number) { return `bm_loop_narrative_seen_${count}`; }

export function LoopNarrative({
  reflectionCount, tasksCompleted, avoidanceZones = [],
  completionRate = 70, topConfidencePattern, lowMomentumDay,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [milestone, setMilestone] = useState(0);

  useEffect(() => {
    const hit = MILESTONES.find((m) => reflectionCount >= m);
    if (!hit) return;
    const seen = storage.get(getStorageKey(hit));
    if (!seen) { setMilestone(hit); setVisible(true); }
  }, [reflectionCount]);

  function dismiss() { storage.set(getStorageKey(milestone), "1"); setVisible(false); }

  const rate = Math.round(completionRate);
  const lines: string[] = [];
  lines.push(`You've completed ${tasksCompleted} of ${Math.round(tasksCompleted / (rate / 100))} tasks (${rate}% completion rate).`);
  if (avoidanceZones.length > 0) {
    lines.push(`You've been avoiding ${avoidanceZones[0]} tasks — BuildMind has started routing those to lower-friction windows.`);
  } else if (lowMomentumDay) {
    lines.push(`Your momentum drops on ${lowMomentumDay}s — tasks on those days are now calibrated to be 20% lighter.`);
  } else {
    lines.push(`No persistent avoidance patterns detected yet — your task variety suggests broad execution range.`);
  }
  if (topConfidencePattern) {
    lines.push(`Your confidence score goes up when tasks involve ${topConfidencePattern}. More of those are coming.`);
  } else {
    lines.push(`Confidence is trending up across the last 7 reflections. The calibration is working.`);
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div key="loop-narrative"
          initial={{ opacity: 0, y: -12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          transition={{ type: "spring", damping: 26, stiffness: 280 }}
          style={{
            position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
            zIndex: 90, width: "min(480px, calc(100vw - 32px))",
            background: "var(--bm-bg2)", border: "1px solid var(--bm-accent-bd)",
            borderRadius: 16, padding: "20px 20px 18px",
            boxShadow: "0 16px 48px rgba(0,0,0,0.42)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <RotateCcw size={14} color="var(--bm-accent)" />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-accent)", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>
                Reflexion Loop · {milestone} reflections
              </p>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--bm-text)", letterSpacing: "-0.02em", margin: 0, lineHeight: 1.3 }}>
                Here's what BuildMind has learned about you.
              </p>
            </div>
            <button onClick={dismiss} style={{ background: "none", border: "none", color: "var(--bm-text4)", cursor: "pointer", padding: 4, flexShrink: 0 }} aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>

          <div style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderRadius: 10, padding: "14px 16px", marginBottom: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {lines.map((line, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontSize: 11, color: "var(--bm-accent)", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", flexShrink: 0, paddingTop: 1 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.55, margin: 0 }}>{line}</p>
              </div>
            ))}
          </div>

          <button onClick={dismiss}
            style={{ width: "100%", padding: "10px", borderRadius: 10, border: "none", background: "var(--bm-accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Got it — keep going
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default LoopNarrative;