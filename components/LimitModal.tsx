"use client";

import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { PLAN_PRICE_LABEL } from "@/lib/pricing";

type LimitReason = "ai_coach" | "break_startup" | "today_action" | "weekly_report" | "generic";
type LegacyLimitReason = "aiCoach" | "breakMyStartup" | "projects";
interface LimitModalContextValue {
  showLimit: (reason?: LimitReason) => void;
  showLimitModal: (reason?: LimitReason | LegacyLimitReason) => void;
}
const LimitModalContext = createContext<LimitModalContextValue>({
  showLimit: () => {},
  showLimitModal: () => {},
});
export function useLimitModal() { return useContext(LimitModalContext); }

const LIMIT_COPY: Record<LimitReason, { emoji: string; title: string; body: string; cta: string; feature: string }> = {
  ai_coach:     { emoji: "🤖", title: "That's your 3 AI Coach messages for today.", body: "More tomorrow — or upgrade to Builder to keep going right now. Builder removes the daily limit so the AI Coach is always there when the decision can't wait.", cta: "Keep going with Builder →", feature: "coach" },
  break_startup:{ emoji: "⚡", title: "Full analysis is a Builder feature.", body: "The brutal AI stress test tells you why your startup will fail, then turns the result into the next action. The preview is only a taste.", cta: "Unlock full stress test →", feature: "break_startup" },
  today_action: { emoji: "🎯", title: "You've used your 3 actions this week.", body: "Builder runs the Reflexion Loop every day. Your next action is ready — you just need Builder to receive it.", cta: "Get daily actions with Builder →", feature: "actions" },
  weekly_report:{ emoji: "📋", title: "Your weekly report is a Builder feature.", body: "Every Friday: your intention vs action gap, momentum trend, biggest blocker, and what the AI thinks you're actually avoiding. The week doesn't close without it.", cta: "Unlock weekly reports →", feature: "report" },
  generic:      { emoji: "🔒", title: "Builder is where serious founders operate.", body: "Daily Reflexion Loop, Morning Briefing before you wake, unlimited AI Coach, full Strategy Blueprints, Recovery Mode, Pattern Detection. Not more features — a different level of execution.", cta: "Upgrade to Builder →", feature: "generic" },
};

const BUILDER_BULLETS = [
  "Daily Reflexion Loop — full 3-agent personalisation",
  "Morning Briefing every day before you wake",
  "Unlimited AI Coach — no daily caps",
  "Unlimited Strategy Blueprints + Execution Systems",
  "Recovery Mode — forgiving when you fall behind",
  "Pattern Detection — AI names what you're avoiding",
];

function LimitModalUI({ reason, onClose, onUpgrade }: { reason: LimitReason; onClose: () => void; onUpgrade: () => void }) {
  const copy = LIMIT_COPY[reason];
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0, zIndex: 999,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, background: "rgba(12,13,15,0.82)", backdropFilter: "blur(10px)",
        fontFamily: "inherit",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        style={{
          width: "100%", maxWidth: 420,
          background: "var(--bm-bg2)",
          border: "1px solid var(--bm-border2)",
          borderRadius: 18, overflow: "hidden",
          boxShadow: "0 0 80px rgba(111,207,151,0.08), 0 32px 80px rgba(0,0,0,0.6)",
        }}
      >
        {/* Top accent stripe */}
        <div style={{ height: 2, background: "var(--bm-accent)" }} />

        <div style={{ padding: "24px 24px 20px" }}>
          {/* Icon + title */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 18 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
            }}>
              {copy.emoji}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--bm-text)", lineHeight: 1.35, marginBottom: 6 }}>
                {copy.title}
              </div>
              <div style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.65 }}>
                {copy.body}
              </div>
            </div>
          </div>

          {/* Unlock list */}
          <div style={{
            background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)",
            borderRadius: 10, padding: "12px 14px", marginBottom: 18,
          }}>
            <div style={{ fontSize: 9, color: "var(--bm-accent)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, fontWeight: 600 }}>
              Builder unlocks
            </div>
            {BUILDER_BULLETS.map((b, i) => (
              <motion.div key={b}
                initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * i + 0.1 }}
                style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--bm-text2)", marginBottom: i < BUILDER_BULLETS.length - 1 ? 6 : 0 }}
              >
                <span style={{ color: "var(--bm-accent)", flexShrink: 0, fontSize: 11, fontWeight: 700 }}>✓</span>
                {b}
              </motion.div>
            ))}
          </div>

          {/* CTA */}
          <motion.button
            onClick={onUpgrade} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            style={{
              width: "100%", padding: "12px 0",
              background: "var(--bm-accent)", color: "var(--bm-text-inv)",
              fontWeight: 700, fontSize: 14, borderRadius: 10, border: "none",
              cursor: "pointer", fontFamily: "inherit", marginBottom: 10,
            }}
          >
            {copy.cta}
          </motion.button>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 11, color: "var(--bm-text4)" }}>{PLAN_PRICE_LABEL.builder} · cancel anytime</div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--bm-text4)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              Not now
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function LimitModalProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [reason, setReason] = useState<LimitReason | null>(null);
  const showLimit = useCallback((r: LimitReason = "generic") => setReason(r), []);
  const showLimitModal = useCallback((r: LimitReason | LegacyLimitReason = "generic") => {
    const normalized: LimitReason =
      r === "aiCoach" ? "ai_coach" :
      r === "breakMyStartup" ? "break_startup" :
      r === "projects" ? "generic" :
      r;
    setReason(normalized);
  }, []);
  const handleUpgrade = () => { setReason(null); const feat = reason ? LIMIT_COPY[reason].feature : "generic"; router.push(`/upgrade?feature=${feat}`); };
  return (
    <LimitModalContext.Provider value={{ showLimit, showLimitModal }}>
      {children}
      <AnimatePresence>
        {reason && <LimitModalUI reason={reason} onClose={() => setReason(null)} onUpgrade={handleUpgrade} />}
      </AnimatePresence>
    </LimitModalContext.Provider>
  );
}
