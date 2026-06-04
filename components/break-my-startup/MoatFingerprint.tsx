"use client";

import { motion } from "framer-motion";
import type { MoatDimension } from "./types";
import { sanitizeOutput } from "@/lib/sanitizeOutput";

export function MoatFingerprint({ dimensions }: { dimensions: MoatDimension[] }) {
  const allFromAgent = dimensions.every((d) => d.source === "agent");

  return (
    <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 10, padding: "16px 18px", marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "var(--bm-text3)", fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          moat fingerprint
        </div>
        <div style={{ fontSize: 10, color: allFromAgent ? "#22c55e" : "var(--bm-text3)", fontFamily: "monospace", letterSpacing: "0.06em" }}>
          {allFromAgent ? "● agent-scored" : "○ estimated"}
        </div>
      </div>
      {dimensions.map((dim, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: "var(--bm-text)", fontWeight: 500 }}>{sanitizeOutput(dim.label)}</span>
            <span style={{ fontSize: 12, color: dim.score >= 7 ? "#22c55e" : dim.score >= 4 ? "#f59e0b" : "#ef4444", fontFamily: "monospace" }}>
              {dim.score}/10
            </span>
          </div>
          <div style={{ height: 3, background: "var(--bm-border)", borderRadius: 2, overflow: "hidden", marginBottom: 3 }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${dim.score * 10}%` }}
              transition={{ delay: i * 0.1 + 0.3, duration: 0.6 }}
              style={{
                height: "100%", borderRadius: 2,
                background: dim.score >= 7 ? "#22c55e" : dim.score >= 4 ? "#f59e0b" : "#ef4444",
              }}
            />
          </div>
          <p style={{ fontSize: 11, color: "var(--bm-text3)", margin: 0, lineHeight: 1.5 }}>{sanitizeOutput(dim.note)}</p>
        </div>
      ))}
      {!allFromAgent && (
        <p style={{ fontSize: 10, color: "var(--bm-text3)", margin: "10px 0 0", lineHeight: 1.5 }}>
          ⓘ Scores estimated — run with a full project for agent-scored moat analysis.
        </p>
      )}
    </div>
  );
}
