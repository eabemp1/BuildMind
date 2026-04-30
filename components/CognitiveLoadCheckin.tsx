/**
 * components/CognitiveLoadCheckin.tsx — Playbook §4.1
 *
 * Three options at session start: Fresh / Drained / Auto-pilot
 * Routes the founder to the right task category.
 * One question, no setup. Stores in Founder Context Object.
 */
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { type CognitiveLoad, recordCognitiveLoad } from "@/lib/founderContext";

interface CognitiveLoadCheckinProps {
  onComplete: (load: CognitiveLoad) => void;
  compact?: boolean;
}

const OPTIONS: {
  id: CognitiveLoad;
  label: string;
  description: string;
  taskType: string;
  color: string;
  bg: string;
  emoji: string;
}[] = [
  {
    id: "fresh",
    label: "Fresh",
    description: "Brain is clear. I can think.",
    taskType: "Hard, strategic tasks — the ones you've been avoiding.",
    color: "#4ade80",
    bg: "rgba(74,222,128,0.08)",
    emoji: "⚡",
  },
  {
    id: "drained",
    label: "Drained",
    description: "Low energy. Running on fumes.",
    taskType: "Simple, executable tasks — no decisions required.",
    color: "#fb923c",
    bg: "rgba(251,146,60,0.08)",
    emoji: "🔋",
  },
  {
    id: "autopilot",
    label: "Auto-pilot",
    description: "Going through the motions.",
    taskType: "Routine tasks that move the ball without burning you out.",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.08)",
    emoji: "⚙️",
  },
];

export default function CognitiveLoadCheckin({ onComplete, compact = false }: CognitiveLoadCheckinProps) {
  const [selected, setSelected] = useState<CognitiveLoad | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSelect = async (load: CognitiveLoad) => {
    setSelected(load);
    setSaving(true);
    await recordCognitiveLoad(load).catch(() => {});
    setSaving(false);
    setTimeout(() => onComplete(load), 300);
  };

  if (compact) {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        {OPTIONS.map(opt => (
          <button
            key={opt.id}
            onClick={() => handleSelect(opt.id)}
            disabled={saving}
            style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              padding: "8px 4px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
              border: `1px solid ${selected === opt.id ? opt.color + "60" : "var(--bm-border)"}`,
              background: selected === opt.id ? opt.bg : "transparent",
              transition: "all 0.15s",
            }}
          >
            <span style={{ fontSize: 16 }}>{opt.emoji}</span>
            <span style={{ fontSize: 10, color: selected === opt.id ? opt.color : "var(--bm-text3)", fontWeight: 500 }}>
              {opt.label}
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: "var(--bm-bg2, #111)",
        border: "1px solid var(--bm-border, #222)",
        borderRadius: 16, padding: "20px",
      }}
    >
      <div style={{ fontSize: 10, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
        Before we start — how is your brain today?
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {OPTIONS.map(opt => (
          <motion.button
            key={opt.id}
            onClick={() => handleSelect(opt.id)}
            disabled={saving}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            style={{
              display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px",
              borderRadius: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              border: `1px solid ${selected === opt.id ? opt.color + "50" : "var(--bm-border, #222)"}`,
              background: selected === opt.id ? opt.bg : "transparent",
              transition: "all 0.18s",
            }}
          >
            <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{opt.emoji}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: selected === opt.id ? opt.color : "var(--bm-text, #fff)", marginBottom: 2 }}>
                {opt.label}
              </div>
              <div style={{ fontSize: 11, color: "var(--bm-text3, #888)", lineHeight: 1.45 }}>
                {opt.description}
              </div>
              <AnimatePresence>
                {selected === opt.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    style={{ fontSize: 10, color: opt.color, marginTop: 5, fontWeight: 500 }}
                  >
                    → {opt.taskType}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
