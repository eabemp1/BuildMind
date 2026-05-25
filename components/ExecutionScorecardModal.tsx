"use client";
/**
 * ExecutionScorecardModal — NEW IN V4 (Playbook §4.3)
 * Shown after Day 7 check-in with 3+ tasks completed.
 * Renders the shareable scorecard and the one-tap X share button.
 */
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import type { ScorecardSharePayload } from "@/lib/executionScorecard";
import { shareToX } from "@/lib/executionScorecard";

interface Props {
  daysActive: number;
  marketGap?: string;
  onDismiss?: () => void;
}

export default function ExecutionScorecardModal({ daysActive, marketGap, onDismiss }: Props) {
  const [payload, setPayload] = useState<ScorecardSharePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/scorecard/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ marketGap, daysActive }),
        });
        if (res.ok) {
          const { data } = await res.json();
          setPayload(data);
        }
      } catch {}
      setLoading(false);
    })();
  }, [marketGap, daysActive]);

  const handleShare = async () => {
    if (!payload) return;
    shareToX(payload);
    setShared(true);
    await fetch("/api/scorecard/generate", { method: "PATCH" }).catch(() => {});
  };

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 20, padding: 28, maxWidth: 420, width: "100%", position: "relative" }}>

          {/* Close */}
          <button onClick={onDismiss} style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", color: "var(--bm-text4)", cursor: "pointer", fontSize: 18, fontFamily: "inherit" }}>✕</button>

          <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--bm-text4)", marginBottom: 4, fontWeight: 700 }}>Week 1 Complete</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", marginBottom: 16 }}>Your Execution Scorecard</div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: "var(--bm-text4)", fontSize: 12 }}>Generating your scorecard…</div>
          ) : payload ? (
            <>
              {/* Scorecard visual */}
              <div style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderRadius: 14, padding: 20, marginBottom: 16, position: "relative", overflow: "hidden" }}>
                {/* Gradient top bar */}
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "var(--bm-accent)" }} />
                <div style={{ fontSize: 10, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Execution Scorecard</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--bm-text)", marginBottom: 2 }}>{payload.card.startupCategory}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, margin: "14px 0" }}>
                  {[
                    { label: "Momentum", value: `${payload.card.momentumScore}/100`, color: "#4ade80" },
                    { label: "Tasks Done", value: String(payload.card.tasksCompleted), color: "var(--bm-text)" },
                    { label: "Stage", value: payload.card.stage, color: "var(--bm-text)" },
                    { label: "Days Active", value: String(payload.card.daysActive), color: "var(--bm-text)" },
                  ].map(cell => (
                    <div key={cell.label} style={{ background: "var(--bm-border)", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ fontSize: 9, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{cell.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: cell.color }}>{cell.value}</div>
                    </div>
                  ))}
                </div>
                {payload.card.marketGap && (
                  <div style={{ background: "var(--bm-border)", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontSize: 9, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Market Gap</div>
                    <div style={{ fontSize: 12, color: "var(--bm-text2)", fontStyle: "italic", lineHeight: 1.4 }}>&ldquo;{payload.card.marketGap}&rdquo;</div>
                  </div>
                )}
                <div style={{ fontSize: 10, color: "var(--bm-text4)", textAlign: "center", marginTop: 10 }}>buildmind.co</div>
              </div>

              <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.97 }} onClick={handleShare}
                style={{ width: "100%", padding: "13px 0", borderRadius: 12, background: shared ? "rgba(74,222,128,0.1)" : "#000", color: shared ? "#4ade80" : "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: shared ? "1px solid rgba(74,222,128,0.3)" : "1px solid #333", transition: "all 0.2s" }}>
                <span style={{ fontSize: 16 }}>𝕏</span>
                {shared ? "Shared! Keep building." : "Share on X → #buildinpublic"}
              </motion.button>
              <div style={{ fontSize: 11, color: "var(--bm-text4)", textAlign: "center", marginTop: 10, lineHeight: 1.4 }}>
                One founder sharing this card reaches their entire network.
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "12px 0", color: "var(--bm-text3)", fontSize: 13 }}>
              Complete 7 days with 3+ tasks to unlock your scorecard.
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
