"use client";

/**
 * components/providers/IdleDetectionProvider.tsx
 * CoFounder Core — Idle Detection, wired app-wide.
 * Builder plan only — silently does nothing on free.
 */

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { checkIdleStatus, recordActivity, syncIdleDetectionStateFromServer } from "@/lib/cofounder/idleDetection";
import { getLimits } from "@/lib/plan";
import { sanitizeOutput } from "@/lib/sanitizeOutput";

interface IdleToast { message: string; lastGoal?: string; }

export default function IdleDetectionProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<IdleToast | null>(null);

  const runIdleCheck = useCallback(() => {
    const limits = getLimits();
    // Gate to Builder only (free tier silently does nothing).
    if (!limits.unlimitedAITasks) return;
    const result = checkIdleStatus();
    if (result.isIdle && result.cofounderMessage) {
      setToast({ message: result.cofounderMessage, lastGoal: result.lastGoal });
    }
  }, []);

  const handleActivity = useCallback(() => { recordActivity(); }, []);

  useEffect(() => {
    syncIdleDetectionStateFromServer().finally(runIdleCheck);
    const handleVisibility = () => { if (document.visibilityState === "visible") runIdleCheck(); };
    const events = ["click", "keydown", "scroll"] as const;
    events.forEach(e => document.addEventListener(e, handleActivity, { passive: true }));
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      events.forEach(e => document.removeEventListener(e, handleActivity));
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [runIdleCheck, handleActivity]);

  return (
    <>
      {children}
      <AnimatePresence>
        {toast && (
          <motion.div
            key="idle-toast"
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            style={{
              position: "fixed", bottom: 20, right: 20, zIndex: 9999, maxWidth: 320,
              background: "rgba(14,14,22,0.97)", border: "1px solid var(--bm-accent-bd)",
              borderRadius: 14, padding: "14px 16px", boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--bm-accent)", flexShrink: 0, marginTop: 4, boxShadow: "0 0 8px var(--bm-accent)" }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--bm-accent)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>CoFounder</div>
                <div style={{ fontSize: 13, color: "#d0d0e0", lineHeight: 1.5 }}>{sanitizeOutput(toast.message)}</div>
                {toast.lastGoal && <div style={{ fontSize: 11, color: "#555", marginTop: 6, fontStyle: "italic" }}>Last goal: &ldquo;{sanitizeOutput(toast.lastGoal)}&rdquo;</div>}
              </div>
              <button onClick={() => setToast(null)} style={{ background: "transparent", border: "none", color: "#444", cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1, flexShrink: 0 }}>✕</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
