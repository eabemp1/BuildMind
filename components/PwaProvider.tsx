/**
 * components/PwaProvider.tsx
 *
 * Add this to your app/layout.tsx (or providers.tsx).
 * It:
 *   1. Registers the service worker on mount
 *   2. After a user's FIRST completed task, prompts them to enable notifications
 *      (this is the best moment — they're engaged, they just got value)
 *
 * Usage in app/layout.tsx or components/providers.tsx:
 *   import PwaProvider from "@/components/PwaProvider";
 *   <PwaProvider userId={user?.id}>{children}</PwaProvider>
 */

"use client";

import { useEffect, useState } from "react";
import { registerServiceWorker, getPushStatus, requestPushPermission, subscribeToPush } from "@/lib/push";

const PROMPT_KEY = "bm_push_prompted";

export default function PwaProvider({
  userId,
  children,
}: {
  userId?: string;
  children: React.ReactNode;
}) {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Always register the SW so offline + manifest work even without push
    registerServiceWorker();
  }, []);

  useEffect(() => {
    if (!userId) return;

    // Listen for the first task completion event
    const handleTaskDone = async () => {
      const alreadyPrompted = localStorage.getItem(PROMPT_KEY);
      if (alreadyPrompted) return;

      const status = await getPushStatus();
      if (status === "subscribed" || status === "denied" || status === "unsupported") return;

      // Show our gentle in-app prompt (not the browser native dialog yet)
      setShowPrompt(true);
    };

    window.addEventListener("bm_task_completed", handleTaskDone);
    return () => window.removeEventListener("bm_task_completed", handleTaskDone);
  }, [userId]);

  async function handleAccept() {
    if (!userId) return;
    localStorage.setItem(PROMPT_KEY, "1");
    setShowPrompt(false);
    const permission = await requestPushPermission();
    if (permission === "granted") {
      await subscribeToPush(userId);
    }
  }

  function handleDecline() {
    localStorage.setItem(PROMPT_KEY, "1");
    setShowPrompt(false);
  }

  return (
    <>
      {children}

      {/* Gentle in-app notification prompt — shown after first task done */}
      {showPrompt && (
        <div style={{
          position: "fixed", bottom: 24, left: 16, right: 16,
          maxWidth: 420, margin: "0 auto",
          zIndex: 9999,
          background: "var(--bm-bg3)",
          border: "1px solid var(--bm-border2)",
          borderRadius: 14,
          padding: "16px 18px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ fontSize: 24, flexShrink: 0 }}>🔔</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--bm-text)", marginBottom: 3 }}>
                Stay on streak tomorrow?
              </div>
              <div style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.5, marginBottom: 12 }}>
                Get a morning nudge when your next action is ready. No spam. Turn off anytime.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleAccept}
                  style={{
                    flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
                    background: "rgba(139,131,232,.18)", color: "var(--bm-purple)",
                    fontSize: 12, fontWeight: 500, cursor: "pointer",
                  }}
                >
                  Yes, remind me daily
                </button>
                <button
                  onClick={handleDecline}
                  style={{
                    padding: "8px 14px", borderRadius: 8, fontSize: 12,
                    border: "1px solid var(--bm-border2)", background: "transparent",
                    color: "var(--bm-text3)", cursor: "pointer",
                  }}
                >
                  Not now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
