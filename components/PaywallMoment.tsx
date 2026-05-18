"use client";

/**
 * components/PaywallMoment.tsx — Contextual paywall moments (Playbook §6.2)
 *
 * The three conversion moments defined in the playbook, triggered at the right time:
 *
 *   Free → Builder:
 *     "Your Morning Briefing is ready. You need Builder to receive it every day."
 *
 *   Builder → Operator (future):
 *     "You've avoided customer discovery tasks 4 times this week.
 *      Your competitor just updated their onboarding. Upgrade to unlock your full intelligence map."
 *
 *   Pattern-triggered (any upgrade):
 *     Surfaces when pattern detection fires + user is on free plan
 *
 * Usage:
 *   <PaywallMoment trigger="morning_briefing" />
 *   <PaywallMoment trigger="pattern" patternMessage="You've avoided outreach 4 times." />
 */

import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { X, Zap, ArrowRight } from "lucide-react";

export type PaywallTrigger =
  | "morning_briefing"   // Free user whose briefing is ready but gated
  | "pattern"            // Pattern detected — upgrade to unlock full intelligence
  | "weekly_limit"       // Hit weekly action limit
  | "ai_limit";          // Hit daily AI limit

interface PaywallMomentProps {
  trigger: PaywallTrigger;
  /** For "pattern" trigger — the specific pattern message to show */
  patternMessage?: string;
  /** Called when user dismisses without upgrading */
  onDismiss?: () => void;
  /** Called when user clicks upgrade */
  onUpgrade?: () => void;
}

const COPY: Record<PaywallTrigger, { headline: string; body: string; cta: string }> = {
  morning_briefing: {
    headline: "Your Morning Briefing is ready.",
    body: "You need Builder to receive it every day — before you wake up, before you open the app, BuildMind has already decided what you should do.",
    cta: "Unlock daily briefings — $39/mo",
  },
  pattern: {
    headline: "BuildMind has detected a pattern.",
    body: "Upgrade to Builder so the system can name what's blocking you and fix it — not just observe it.",
    cta: "Unlock pattern intelligence — $39/mo",
  },
  weekly_limit: {
    headline: "You've hit your weekly action limit.",
    body: "Free founders get 3 AI-powered actions per week. Builder gives you unlimited — because execution should never be throttled.",
    cta: "Go unlimited — $39/mo",
  },
  ai_limit: {
    headline: "You've used your daily AI calls.",
    body: "Builder gives you unlimited AI calls so the system never goes quiet when you need it most.",
    cta: "Go unlimited — $39/mo",
  },
};

export function PaywallMoment({ trigger, patternMessage, onDismiss, onUpgrade }: PaywallMomentProps) {
  const router = useRouter();
  const [visible, setVisible] = useState(true);
  const copy = COPY[trigger];

  const handleUpgrade = () => {
    onUpgrade?.();
    router.push("/upgrade");
  };

  const handleDismiss = () => {
    setVisible(false);
    onDismiss?.();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          style={{
            position: "relative",
            background: "var(--bm-bg2)",
            border: "1px solid var(--bm-accent-bd)",
            borderTop: "2px solid var(--bm-accent)",
            borderRadius: 14,
            padding: "20px 20px 18px",
            fontFamily: "inherit",
          }}
        >
          {/* Dismiss */}
          <button
            onClick={handleDismiss}
            style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", cursor: "pointer", color: "var(--bm-text3)", padding: 4, borderRadius: 6, display: "flex" }}
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>

          {/* Icon */}
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--grad-primary)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            <Zap size={15} color="#fff" />
          </div>

          {/* Headline */}
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--bm-text)", margin: "0 0 6px", lineHeight: 1.3 }}>
            {copy.headline}
          </p>

          {/* Pattern message if provided */}
          {trigger === "pattern" && patternMessage && (
            <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: "0 0 8px", lineHeight: 1.45, fontStyle: "italic" }}>
              "{patternMessage}"
            </p>
          )}

          {/* Referral flywheel: share pattern CTA (Audit v8 GROWTH #2)
              High-severity patterns are honest and relatable — founders share them.
              This drives organic awareness in exactly the founder communities we want. */}
          {trigger === "pattern" && patternMessage && (
            <button
              onClick={() => {
                const text = `BuildMind caught me: ${patternMessage} It noticed before I did. buildmind.live`;
                if (typeof window !== "undefined") {
                  window.open(
                    `https://twitter.com/intent/tweet?text=${encodeURIComponent(text.slice(0, 270))}`,
                    "_blank"
                  );
                }
              }}
              style={{ fontSize: 11, color: "var(--bm-text3)", background: "transparent", border: "1px solid var(--bm-border)", borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit", marginBottom: 8, display: "block" }}>
              Share this pattern on 𝕏
            </button>
          )}

          {/* Body */}
          <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: "0 0 16px", lineHeight: 1.5 }}>
            {copy.body}
          </p>

          {/* CTA */}
          <button
            onClick={handleUpgrade}
            style={{
              width: "100%",
              padding: "11px 18px",
              background: "var(--grad-primary)",
              color: "#fff",
              border: "none",
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontFamily: "inherit",
            }}
          >
            <ArrowRight size={13} /> {copy.cta}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * useMorningBriefingPaywall — call on the today page for free users.
 * Returns { shouldShow, dismiss } based on whether a briefing is available
 * but the user is on free plan.
 */
export function useMorningBriefingPaywall(plan: string, briefingAvailable: boolean) {
  const [dismissed, setDismissed] = useState(false);
  const shouldShow = plan === "free" && briefingAvailable && !dismissed;
  return { shouldShow, dismiss: () => setDismissed(true) };
}
