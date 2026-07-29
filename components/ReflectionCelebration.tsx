"use client";

/**
 * components/ReflectionCelebration.tsx
 *
 * Duolingo-style "lesson complete" popup — fired the moment a reflection is
 * saved, before the founder reads the AI causality/witnessed copy. Purpose:
 * make the act of reflecting feel like it *registered* somewhere, the same
 * instant a Duolingo streak/XP screen does after a lesson.
 *
 * Shows, in a short animated sequence:
 *   1. A burst/checkmark confirming the reflection landed
 *   2. The momentum ring animating from its pre-reflection value to its new
 *      one (reuses MomentumScore, which already knows how to render a delta)
 *   3. The streak counter, with a little "pop" if it just extended
 *
 * Auto-dismisses after ~4.5s, or on tap. Non-blocking — this sits on top of
 * the results screen that's already rendering underneath it.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Sparkles } from "lucide-react";
import MomentumScore from "@/components/MomentumScore";

interface Props {
  open: boolean;
  streak: number;
  streakExtended: boolean;
  momentum?: { before: number; after: number };
  onDismiss: () => void;
}

export default function ReflectionCelebration({ open, streak, streakExtended, momentum, onDismiss }: Props) {
  const [phase, setPhase] = useState<"burst" | "stats">("burst");

  useEffect(() => {
    if (!open) { setPhase("burst"); return; }
    const t1 = setTimeout(() => setPhase("stats"), 550);
    const t2 = setTimeout(() => onDismiss(), 4500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="reflection-celebration"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onDismiss}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(6,6,8,0.72)",
            backdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: 20,
          }}
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(320px, 100%)",
              background: "var(--bm-bg2)",
              border: "1px solid var(--bm-accent-bd)",
              borderRadius: 20,
              padding: "32px 24px 24px",
              textAlign: "center",
              position: "relative",
              overflow: "hidden",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
          >
            {/* Particle burst behind the check */}
            <div style={{ position: "absolute", top: 46, left: "50%", pointerEvents: "none" }}>
              {[...Array(10)].map((_, i) => (
                <motion.div
                  key={i}
                  style={{
                    position: "absolute",
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: "var(--bm-accent)",
                  }}
                  initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                  animate={{
                    opacity: 0,
                    x: Math.cos((i / 10) * Math.PI * 2) * 70,
                    y: Math.sin((i / 10) * Math.PI * 2) * 70,
                    scale: 0,
                  }}
                  transition={{ duration: 0.7, delay: 0.05 }}
                />
              ))}
            </div>

            {/* Check burst */}
            <motion.div
              initial={{ scale: 0, rotate: -15 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 16, delay: 0.05 }}
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "var(--bm-accent-dim)",
                border: "1.5px solid var(--bm-accent-bd)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 14px",
              }}
            >
              <Sparkles size={24} color="var(--bm-accent)" />
            </motion.div>

            <motion.h3
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              style={{ fontSize: 17, fontWeight: 800, color: "var(--bm-text)", margin: "0 0 4px", letterSpacing: "-0.02em" }}
            >
              Reflection logged
            </motion.h3>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              style={{ fontSize: 12, color: "var(--bm-text3)", margin: "0 0 22px" }}
            >
              That's one more day of real signal.
            </motion.p>

            <AnimatePresence>
              {phase === "stats" && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 28, marginBottom: 6 }}
                >
                  {momentum && (
                    <MomentumScore score={momentum.after} previousScore={momentum.before} size="sm" showWarning={false} />
                  )}

                  <motion.div
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 380, damping: 14, delay: 0.15 }}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
                  >
                    <motion.div
                      animate={streakExtended ? { scale: [1, 1.25, 1] } : {}}
                      transition={{ duration: 0.5, delay: 0.3 }}
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: "50%",
                        background: "rgba(232,160,32,0.1)",
                        border: "1px solid rgba(232,160,32,0.3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexDirection: "column",
                      }}
                    >
                      <Flame size={18} color="var(--bm-amber)" />
                      <span style={{ fontSize: 14, fontWeight: 800, color: "var(--bm-amber)", lineHeight: 1 }}>{streak}</span>
                    </motion.div>
                    <div style={{ fontSize: 9, color: "var(--bm-text4, #555)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                      {streakExtended ? "Streak extended" : "Day streak"}
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              onClick={onDismiss}
              style={{
                marginTop: 18,
                width: "100%",
                padding: "11px 0",
                borderRadius: 10,
                border: "none",
                background: "var(--grad-primary)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Continue
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
