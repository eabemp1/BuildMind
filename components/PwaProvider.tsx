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
import { createClient } from "@/lib/supabase/client";

const PROMPT_KEY = "bm_push_prompted";
const PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export default function PwaProvider({
  userId: userIdProp,
  children,
}: {
  userId?: string;
  children: React.ReactNode;
}) {
  const [userId, setUserId] = useState<string | undefined>(userIdProp);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showForceEnable, setShowForceEnable] = useState(false);

  const getCompletedTaskCount = () => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem("bm_tasks_done") ?? "0");
  };

  const openBrowserNotificationSettings = () => {
    if (typeof window === "undefined") return;
    const ua = window.navigator.userAgent.toLowerCase();
    if (ua.includes("edg/")) {
      window.open("edge://settings/content/notifications", "_blank");
      return;
    }
    if (ua.includes("chrome") || ua.includes("chromium")) {
      window.open("chrome://settings/content/notifications", "_blank");
      return;
    }
    if (ua.includes("firefox")) {
      window.open("about:preferences#privacy", "_blank");
    }
  };

  const evaluatePromptState = async () => {
    if (typeof window === "undefined") return;
    const taskCount = getCompletedTaskCount();
    if (taskCount < 1) return;

    const status = await getPushStatus();
    if (status === "unsupported" || status === "subscribed") {
      setShowPrompt(false);
      setShowForceEnable(false);
      return;
    }

    if (status === "denied") {
      setShowPrompt(false);
      setShowForceEnable(true);
      return;
    }

    const lastPrompted = Number(localStorage.getItem(PROMPT_KEY) ?? "0");
    if (!lastPrompted || Date.now() - lastPrompted > PROMPT_COOLDOWN_MS) {
      setShowPrompt(true);
    }
  };

  useEffect(() => {
    if (userIdProp) {
      setUserId(userIdProp);
      return;
    }
    const hydrateUser = async () => {
      try {
        const sb = createClient();
        const { data } = await sb.auth.getUser();
        if (data.user?.id) setUserId(data.user.id);
      } catch {}
    };
    void hydrateUser();
  }, [userIdProp]);

  useEffect(() => {
    // Always register the SW so offline + manifest work even without push
    registerServiceWorker();
  }, []);

  useEffect(() => {
    if (!userId) return;

    // Handle first-task event and also delayed checks (reload/tab-switch).
    const handleTaskDone = () => {
      void evaluatePromptState();
    };

    void evaluatePromptState();

    window.addEventListener("bm_task_completed", handleTaskDone);
    const visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        void evaluatePromptState();
      }
    };
    document.addEventListener("visibilitychange", visibilityHandler);

    return () => {
      window.removeEventListener("bm_task_completed", handleTaskDone);
      document.removeEventListener("visibilitychange", visibilityHandler);
    };
  }, [userId]);

  async function handleAccept() {
    if (!userId) return;
    localStorage.setItem(PROMPT_KEY, String(Date.now()));
    setShowPrompt(false);
    const permission = await requestPushPermission();
    if (permission === "granted") {
      await subscribeToPush(userId);
      setShowForceEnable(false);
      return;
    }

    if (permission === "denied") {
      setShowForceEnable(true);
    }
  }

  function handleDecline() {
    localStorage.setItem(PROMPT_KEY, String(Date.now()));
    setShowPrompt(false);
  }

  async function handleRecheckPermission() {
    if (!userId) return;
    const permission = await requestPushPermission();
    if (permission === "granted") {
      const ok = await subscribeToPush(userId);
      if (ok) {
        setShowForceEnable(false);
      }
    }
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

      {showForceEnable && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 460,
              borderRadius: 16,
              border: "1px solid var(--bm-border2)",
              background: "var(--bm-bg3)",
              padding: "18px 18px 16px",
              boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 22 }}>🔒</span>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--bm-text)" }}>
                Enable notifications to continue streak mode
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.6, marginBottom: 12 }}>
              Notifications are currently blocked in your browser. BuildMind requires notifications after your first completed task so you do not miss tomorrow's action and break your momentum.
            </div>
            <div style={{ fontSize: 11, color: "var(--bm-text4)", lineHeight: 1.5, marginBottom: 14 }}>
              Open your browser notification settings, allow notifications for this site, then click "I've enabled notifications".
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={openBrowserNotificationSettings}
                style={{
                  flex: 1,
                  padding: "9px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--bm-border2)",
                  background: "transparent",
                  color: "var(--bm-text2)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Open browser settings
              </button>
              <button
                onClick={() => void handleRecheckPermission()}
                style={{
                  flex: 1,
                  padding: "9px 10px",
                  borderRadius: 8,
                  border: "none",
                  background: "rgba(139,131,232,.22)",
                  color: "var(--bm-purple)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                I've enabled notifications
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
