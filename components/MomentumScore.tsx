/**
 * components/MomentumScore.tsx — Playbook §4.1
 *
 * Replaces streaks. Never breaks. Decays slowly. AI warns before it drops.
 * Kill the word "streak" everywhere in the UI → use this.
 */
"use client";

import { motion } from "framer-motion";
import { momentumLabel } from "@/lib/founderContext";

interface MomentumScoreProps {
  score: number;
  previousScore?: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  showWarning?: boolean;
}

export default function MomentumScore({
  score,
  previousScore,
  size = "md",
  showLabel = true,
  showWarning = true,
}: MomentumScoreProps) {
  const { label, color, emoji } = momentumLabel(score);
  const isDecaying = previousScore !== undefined && previousScore - score >= 5;
  const delta = previousScore !== undefined ? score - previousScore : null;

  const sizes = {
    sm: { score: 22, label: 10, ring: 44, strokeW: 5 },
    md: { score: 28, label: 11, ring: 56, strokeW: 6 },
    lg: { score: 38, label: 13, ring: 76, strokeW: 8 },
  };
  const s = sizes[size];
  const r = (s.ring - s.strokeW) / 2;
  const circ = 2 * Math.PI * r;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      {/* Ring */}
      <div style={{ position: "relative", width: s.ring, height: s.ring, flexShrink: 0 }}>
        <svg width={s.ring} height={s.ring} viewBox={`0 0 ${s.ring} ${s.ring}`} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={s.ring / 2} cy={s.ring / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={s.strokeW} />
          <motion.circle
            cx={s.ring / 2} cy={s.ring / 2} r={r} fill="none"
            stroke={color} strokeWidth={s.strokeW} strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ - (Math.min(score, 100) / 100) * circ }}
            transition={{ duration: 1.0, ease: "easeOut", delay: 0.1 }}
          />
        </svg>
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 0,
        }}>
          <motion.span
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
            style={{ fontSize: s.score, fontWeight: 700, color, lineHeight: 1 }}
          >
            {score}
          </motion.span>
        </div>
      </div>

      {/* Label */}
      {showLabel && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: s.label, fontWeight: 600, color, lineHeight: 1 }}>
            {emoji} {label}
          </div>
          <div style={{ fontSize: 9, color: "var(--bm-text4, #555)", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 2 }}>
            Momentum
          </div>
        </div>
      )}

      {/* Delta */}
      {delta !== null && delta !== 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{
            fontSize: 10, fontWeight: 600,
            color: delta > 0 ? "#4ade80" : "#f87171",
            background: delta > 0 ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
            border: `1px solid ${delta > 0 ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`,
            borderRadius: 6, padding: "2px 7px",
          }}
        >
          {delta > 0 ? "+" : ""}{delta} pts
        </motion.div>
      )}

      {/* Decay warning */}
      {showWarning && isDecaying && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            fontSize: 10, color: "#fb923c",
            background: "rgba(251,146,60,0.08)",
            border: "1px solid rgba(251,146,60,0.2)",
            borderRadius: 8, padding: "6px 10px", textAlign: "center", maxWidth: 180,
          }}
        >
          ⚠️ Momentum dropping. Do today&apos;s action to recover.
        </motion.div>
      )}
    </div>
  );
}
