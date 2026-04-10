"use client";

/**
 * LimitModal — shown when a free user hits any usage limit.
 * Appears as a full-screen overlay with a personal, contextual message.
 * 
 * Usage:
 *   const { showLimit } = useLimitModal();
 *   showLimit("ai_coach");   // "ai_coach" | "break_startup" | "today_action" | "weekly_report" | "generic"
 */

import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

// ─── Context ──────────────────────────────────────────────────────────────────

type LimitReason = "ai_coach" | "break_startup" | "today_action" | "weekly_report" | "generic";

interface LimitModalContextValue {
  showLimit: (reason?: LimitReason) => void;
}

const LimitModalContext = createContext<LimitModalContextValue>({
  showLimit: () => {},
});

export function useLimitModal() {
  return useContext(LimitModalContext);
}

// ─── Contextual copy per limit reason ────────────────────────────────────────

const LIMIT_COPY: Record<LimitReason, { emoji: string; title: string; body: string; cta: string }> = {
  ai_coach: {
    emoji: "🤖",
    title: "You've hit your AI limit for today.",
    body: "Free plan includes 3 AI messages per day. You're clearly using this — that's the point. Builder plan gives you unlimited AI Coach, weekly strategy reports, and full Break My Startup analysis.",
    cta: "Unlock unlimited AI →",
  },
  break_startup: {
    emoji: "🔥",
    title: "Full analysis is a Builder feature.",
    body: "The free preview shows you a taste. The real analysis — survival probability calculated from your actual data, all kill reasons, every survive reason, and the one thing that saves you — is Builder only.",
    cta: "Unlock full analysis →",
  },
  today_action: {
    emoji: "⚡",
    title: "You've used your free actions for today.",
    body: "Free plan gives you 3 AI-powered actions per day. Builder removes all limits and gives you unlimited daily actions, AI coaching, and weekly reports.",
    cta: "Unlock unlimited actions →",
  },
  weekly_report: {
    emoji: "📋",
    title: "Weekly reports are a Builder feature.",
    body: "Every week: your intention vs action gap, momentum score, biggest blocker, and a brutal honest assessment of where you're headed. This is the feature that keeps you honest.",
    cta: "Unlock weekly reports →",
  },
  generic: {
    emoji: "🔒",
    title: "You've reached your free plan limit.",
    body: "Builder plan removes all limits — unlimited AI Coach, full Break My Startup analysis, weekly strategy reports, startup kit generator, and everything else. You're clearly building. Don't stop because of a paywall.",
    cta: "Upgrade to Builder →",
  },
};

// ─── What you get bullets ─────────────────────────────────────────────────────

const BUILDER_BULLETS = [
  "Unlimited AI Coach — no daily caps",
  "Full Break My Startup analysis",
  "Weekly AI strategy report",
  "Startup kit: names, domains, branding",
  "Unlimited projects and tasks",
];

// ─── Modal UI ─────────────────────────────────────────────────────────────────

function LimitModalUI({
  reason,
  onClose,
  onUpgrade,
}: {
  reason: LimitReason;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  const copy = LIMIT_COPY[reason];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0, zIndex: 999,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(8px)",
        fontFamily: "system-ui,sans-serif",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        style={{
          width: "100%", maxWidth: 420,
          background: "var(--bm-bg2, #0d0d0d)",
          border: "1px solid rgba(99,102,241,0.3)",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 0 60px rgba(99,102,241,0.15), 0 24px 80px rgba(0,0,0,0.5)",
        }}
      >
        {/* Top accent bar */}
        <div style={{ height: 3, background: "linear-gradient(90deg,#6366f1,#8b5cf6,#a78bfa)" }} />

        <div style={{ padding: "24px 24px 20px" }}>
          {/* Icon + title */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
            }}>
              {copy.emoji}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--bm-text, #fff)", lineHeight: 1.3, marginBottom: 6 }}>
                {copy.title}
              </div>
              <div style={{ fontSize: 12, color: "var(--bm-text3, #666)", lineHeight: 1.65 }}>
                {copy.body}
              </div>
            </div>
          </div>

          {/* What you unlock */}
          <div style={{
            background: "rgba(99,102,241,0.06)",
            border: "1px solid rgba(99,102,241,0.15)",
            borderRadius: 10, padding: "12px 14px", marginBottom: 18,
          }}>
            <div style={{ fontSize: 10, color: "#818cf8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: "monospace" }}>
              Builder unlocks
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {BUILDER_BULLETS.map((b, i) => (
                <motion.div
                  key={b}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * i + 0.1 }}
                  style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--bm-text2, #aaa)" }}
                >
                  <span style={{ color: "#4ade80", flexShrink: 0, fontSize: 10 }}>✓</span>
                  {b}
                </motion.div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <motion.button
            onClick={onUpgrade}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            style={{
              width: "100%", padding: "12px 0",
              background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
              color: "#fff", fontWeight: 700, fontSize: 14,
              borderRadius: 10, border: "none", cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: "0 0 24px rgba(99,102,241,0.3)",
              marginBottom: 10,
            }}
          >
            {copy.cta}
          </motion.button>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 11, color: "#334155" }}>GHS 290/mo · cancel anytime</div>
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", color: "#333", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
            >
              Not now
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function LimitModalProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [reason, setReason] = useState<LimitReason | null>(null);

  const showLimit = useCallback((r: LimitReason = "generic") => {
    setReason(r);
  }, []);

  const handleUpgrade = () => {
    setReason(null);
    router.push(`/upgrade?plan=builder&reason=${reason ?? "generic"}`);
  };

  return (
    <LimitModalContext.Provider value={{ showLimit }}>
      {children}
      <AnimatePresence>
        {reason && (
          <LimitModalUI
            reason={reason}
            onClose={() => setReason(null)}
            onUpgrade={handleUpgrade}
          />
        )}
      </AnimatePresence>
    </LimitModalContext.Provider>
  );
}
