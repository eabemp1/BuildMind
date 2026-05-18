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
      <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
        <motion.div
          initial={{ width: `${prev}%` }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          style={{
            height: "100%",
            borderRadius: 3,
            background:
              score > 60
                ? "linear-gradient(90deg, #16a34a, #22c55e)"
                : score > 30
                ? "linear-gradient(90deg, #d97706, #f59e0b)"
                : "linear-gradient(90deg, #b91c1c, #ef4444)",
          }}
        />
      </div>
    </div>
  );
}
