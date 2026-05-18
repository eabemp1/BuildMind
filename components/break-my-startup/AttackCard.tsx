"use client";

import { motion } from "framer-motion";
import { ROLE_META, SEVERITY_COLORS, type AttackRound } from "./types";

export function AttackCard({
  round,
  index,
  onRebuttal,
  onShare,
}: {
  round: AttackRound;
  index: number;
  onRebuttal: (i: number) => void;
  onShare: (round: AttackRound) => void;
}) {
  const meta = ROLE_META[round.role];
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.08, duration: 0.35 }}
      style={{
        background: "var(--bm-bg2)",
        border: `1px solid ${SEVERITY_COLORS[round.severity]}33`,
        borderLeft: `3px solid ${SEVERITY_COLORS[round.severity]}`,
        borderRadius: 10,
        padding: "16px 18px",
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 14, color: meta.color }}>{meta.icon}</span>
        <span style={{ fontSize: 11, color: meta.color, fontFamily: "monospace", fontWeight: 600, letterSpacing: "0.07em" }}>
          {meta.label.toUpperCase()}
        </span>
        <div style={{ marginLeft: "auto" }}>
          <span style={{
            fontSize: 9, fontFamily: "monospace", padding: "2px 6px", borderRadius: 4,
            background: `${SEVERITY_COLORS[round.severity]}22`, color: SEVERITY_COLORS[round.severity],
            letterSpacing: "0.08em", textTransform: "uppercase",
          }}>
            {round.severity}
          </span>
        </div>
      </div>

      <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--bm-text)", margin: "0 0 8px" }}>{round.title}</h4>
      <p style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.65, margin: 0 }}>{round.body}</p>

      {/* Rebuttal block — shows founder defense + score + adversary counter */}
      {round.rebuttal && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          style={{ marginTop: 12 }}
        >
          {/* Founder defense */}
          <div style={{ padding: "10px 12px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: "#22c55e", fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 6 }}>
              YOUR DEFENSE — {round.rebuttalScore ?? 0}/100
            </div>
            <p style={{ fontSize: 12, color: "var(--bm-text2)", lineHeight: 1.6, margin: 0 }}>{round.rebuttal}</p>
          </div>

          {/* Adversary counter-response */}
          {round.adversaryCounter && (
            <div style={{ padding: "10px 12px", background: `${meta.color}0f`, border: `1px solid ${meta.color}22`, borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: meta.color, fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 6 }}>
                {meta.label.toUpperCase()} RESPONDS
              </div>
              <p style={{ fontSize: 12, color: "var(--bm-text2)", lineHeight: 1.6, margin: 0, fontStyle: "italic" }}>
                &ldquo;{round.adversaryCounter}&rdquo;
              </p>
            </div>
          )}
        </motion.div>
      )}

      {!round.rebuttal && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            onClick={() => onRebuttal(index)}
            style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, background: "transparent", border: "1px solid var(--bm-border)", color: "var(--bm-text2)", cursor: "pointer", fontFamily: "inherit" }}
          >
            Defend yourself →
          </button>
          <button
            onClick={() => onShare(round)}
            style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, background: "transparent", border: "1px solid var(--bm-border)", color: "var(--bm-text2)", cursor: "pointer", fontFamily: "inherit" }}
          >
            Share ↗
          </button>
        </div>
      )}
    </motion.div>
  );
}
