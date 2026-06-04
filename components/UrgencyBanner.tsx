"use client";

/**
 * components/UrgencyBanner.tsx
 *
 * A compact, context-aware urgency signal that sits at the top of the
 * dashboard and Today page. Shows "falling behind" signals based on:
 *   - Days missed
 *   - Streak risk
 *   - Score decay
 *   - Task debt
 *
 * NOT shown when urgency level is "none".
 * Dismissible per session (reappears next day).
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { computeUrgencySignal, type UrgencySignal, type UrgencyLevel } from "@/lib/urgency";
import { storage } from "@/lib/storage";
import { fetchBehaviorState, persistBehaviorState } from "@/lib/userBehaviorState";
import { sanitizeOutput } from "@/lib/sanitizeOutput";

const LEVEL_STYLES: Record<UrgencyLevel, { bg: string; border: string; dot: string; text: string }> = {
  none:     { bg: "transparent", border: "transparent", dot: "#555", text: "var(--bm-text2)" },
  low:      { bg: "rgba(251,191,36,0.04)", border: "rgba(251,191,36,0.18)", dot: "#fbbf24", text: "#fbbf24" },
  medium:   { bg: "rgba(249,115,22,0.05)", border: "rgba(249,115,22,0.22)", dot: "#f97316", text: "#f97316" },
  high:     { bg: "rgba(239,68,68,0.06)",  border: "rgba(239,68,68,0.28)",  dot: "#ef4444", text: "#ef4444" },
  critical: { bg: "rgba(127,29,29,0.12)",  border: "rgba(239,68,68,0.5)",   dot: "#ef4444", text: "#fca5a5" },
};

const DISMISS_KEY = "bm_urgency_dismissed";

function getDismissedDate(): string {
  return storage.get(DISMISS_KEY) ?? "";
}

function setDismissedToday(): void {
  const date = todayDismissKey();
  storage.set(DISMISS_KEY, date);
  persistBehaviorState({ urgency_dismissed_date: date });
}

function isDismissedToday(): boolean {
  return getDismissedDate() === todayDismissKey();
}

function todayDismissKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function UrgencyBanner({ currentScore }: { currentScore: number }) {
  const router = useRouter();
  const [signal, setSignal] = useState<UrgencySignal | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isDismissedToday()) { setDismissed(true); return; }
    const s = computeUrgencySignal(currentScore);
    setSignal(s);
    setVisible(s.level !== "none");
    fetchBehaviorState<{ urgency_dismissed_date: string }>(["urgency_dismissed_date"]).then(values => {
      if (values.urgency_dismissed_date === todayDismissKey()) {
        storage.set(DISMISS_KEY, values.urgency_dismissed_date);
        setDismissed(true);
        setVisible(false);
      }
    }).catch(() => {});
  }, [currentScore]);

  const handleDismiss = () => {
    setDismissedToday();
    setDismissed(true);
    setVisible(false);
  };

  if (dismissed || !signal || signal.level === "none") return null;

  const style = LEVEL_STYLES[signal.level];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          transition={{ duration: 0.25 }}
          style={{
            background: style.bg,
            border: `1px solid ${style.border}`,
            borderRadius: 10,
            padding: "11px 14px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          {/* Pulsing dot */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <motion.div
              animate={signal.level === "critical" ? { scale: [1, 1.4, 1], opacity: [1, 0.4, 1] } : {}}
              transition={{ duration: 1.5, repeat: Infinity }}
              style={{ width: 8, height: 8, borderRadius: "50%", background: style.dot }}
            />
          </div>

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: style.text }}>
              {sanitizeOutput(signal.headline)}
            </span>
            {signal.subtext && (
              <span style={{ fontSize: 12, color: "var(--bm-text2)", marginLeft: 8 }}>
                {sanitizeOutput(signal.subtext)}
              </span>
            )}
          </div>

          {/* CTA */}
          {signal.cta && (
            <button
              onClick={() => router.push(signal.ctaHref)}
              style={{
                flexShrink: 0,
                fontSize: 11,
                fontWeight: 600,
                padding: "5px 11px",
                borderRadius: 6,
                background: style.dot + "22",
                border: `1px solid ${style.dot}44`,
                color: style.text,
                cursor: "pointer",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
              }}
            >
              {signal.cta} →
            </button>
          )}

          {/* Dismiss */}
          <button
            onClick={handleDismiss}
            style={{
              flexShrink: 0,
              fontSize: 14,
              background: "none",
              border: "none",
              color: "var(--bm-text3)",
              cursor: "pointer",
              padding: "0 4px",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
