"use client";

import { motion } from "framer-motion";

export function SurvivalBar({ score, prev }: { score: number; prev: number }) {
  const delta = score - prev;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--bm-text3)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          survival probability
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {delta !== 0 && (
            <motion.span
              initial={{ opacity: 0, y: delta < 0 ? -8 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ fontSize: 11, color: delta < 0 ? "#ef4444" : "#22c55e", fontFamily: "monospace" }}
            >
              {delta > 0 ? "+" : ""}{delta}%
            </motion.span>
          )}
          <span style={{ fontSize: 18, fontWeight: 700, color: score > 60 ? "#22c55e" : score > 30 ? "#f59e0b" : "#ef4444", fontFamily: "monospace" }}>
            {score}%
          </span>
        </div>
      </div>
      <div style={{ height: 6, background: "var(--bm-border2)", borderRadius: 3, overflow: "hidden" }}>
        <motion.div
          initial={{ width: `${prev}%` }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          style={{
            height: "100%",
            borderRadius: 3,
            background:
              score > 60
                ? "var(--bm-green)"
                : score > 30
                ? "var(--bm-accent)"
                : "var(--bm-red)",
          }}
        />
      </div>
    </div>
  );
}
