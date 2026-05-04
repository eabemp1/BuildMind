/**
 * components/PwaProvider.tsx
 *
 * Handles:
 *  1. Service worker registration (offline + manifest — always runs)
 *  2. iOS home screen install detection + instructions
 *  3. Push notification prompts at the right moments:
 *     - Bottom sheet after first completed task
 *     - Persistent Today-page banner if still not subscribed after 3 days
 *     - Cooldown: 3 days (not 7) — re-prompts gently until subscribed
 *  4. "Blocked" modal with browser settings deep-link
 */

"use client";

import { useEffect, useState } from "react";
import {
  registerServiceWorker,
  getPushStatus,
  requestPushPermission,
  subscribeToPush,
} from "@/lib/push";
import { createClient } from "@/lib/supabase/client";

// Re-prompt every 3 days until subscribed (was 7 — too infrequent)
const PROMPT_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
const PROMPT_KEY = "bm_push_prompted";
// Persistent banner shown on Today page after 3+ days of using app without subscribing
const FIRST_SEEN_KEY = "bm_first_seen";
// Dismiss the persistent banner for the session
const BANNER_DISMISSED_KEY = "bm_push_banner_dismissed";

export default function PwaProvider({
  userId: userIdProp,
  children,
}: {
  userId?: string;
  children: React.ReactNode;
}) {
  const [userId, setUserId] = useState<string | undefined>(userIdProp);
  // Bottom-sheet prompt (after first task)
  const [showPrompt, setShowPrompt] = useState(false);
  // Blocked modal (permission denied)
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  // Persistent top banner (after 3+ days, still not subscribed)
  const [showPersistentBanner, setShowPersistentBanner] = useState(false);
  // iOS in-browser (not installed) — show install instructions instead
  const [isIosNotInstalled, setIsIosNotInstalled] = useState(false);

  // ── Hydrate userId from Supabase if not passed ─────────────────────────
  useEffect(() => {
    if (userIdProp) { setUserId(userIdProp); return; }
    createClient().auth.getUser()
      .then(({ data }) => { if (data.user?.id) setUserId(data.user.id); })
      .catch(() => {});
  }, [userIdProp]);

  // ── Register SW always — offline + manifest even without push ──────────
  useEffect(() => {
    registerServiceWorker();
    // Detect iOS Safari in browser tab (not installed PWA)
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
    setIsIosNotInstalled(isIos && !isStandalone);
    // Record first-seen date for persistent banner trigger
    if (!localStorage.getItem(FIRST_SEEN_KEY)) {
      localStorage.setItem(FIRST_SEEN_KEY, String(Date.now()));
    }
  }, []);

  // ── Evaluate whether to show any prompt ────────────────────────────────
  const evaluatePromptState = async () => {
    if (typeof window === "undefined" || !userId) return;

    const status = await getPushStatus();

    // Already subscribed — clear all prompts
    if (status === "subscribed" || status === "unsupported") {
      setShowPrompt(false);
      setShowBlockedModal(false);
      setShowPersistentBanner(false);
      return;
    }

    // Permission explicitly blocked — show the unblock modal
    if (status === "denied") {
      setShowPrompt(false);
      setShowPersistentBanner(false);
      setShowBlockedModal(true);
      return;
    }

    // Check if first-task milestone hit
    const tasksDone = Number(localStorage.getItem("bm_tasks_done") ?? "0");
    const lastPrompted = Number(localStorage.getItem(PROMPT_KEY) ?? "0");
    const cooldownExpired = !lastPrompted || Date.now() - lastPrompted > PROMPT_COOLDOWN_MS;

    if (tasksDone >= 1 && cooldownExpired) {
      setShowPrompt(true);
    }

    // Persistent banner: user has been around 3+ days and still no subscription
    const firstSeen = Number(localStorage.getItem(FIRST_SEEN_KEY) ?? Date.now());
    const daysSinceFirst = (Date.now() - firstSeen) / 86400000;
    const bannerDismissed = sessionStorage.getItem(BANNER_DISMISSED_KEY) === "1";
    if (daysSinceFirst >= 3 && !bannerDismissed && !showPrompt) {
      setShowPersistentBanner(true);
    }
  };

  useEffect(() => {
    if (!userId) return;
    void evaluatePromptState();

    const onTaskDone = () => void evaluatePromptState();
    window.addEventListener("bm_task_completed", onTaskDone);

    const onVisible = () => {
      if (document.visibilityState === "visible") void evaluatePromptState();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("bm_task_completed", onTaskDone);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId]);

  // ── Handlers ───────────────────────────────────────────────────────────
  async function handleAccept() {
    if (!userId) return;
    localStorage.setItem(PROMPT_KEY, String(Date.now()));
    setShowPrompt(false);
    setShowPersistentBanner(false);
    const permission = await requestPushPermission();
    if (permission === "granted") {
      await subscribeToPush(userId);
    } else if (permission === "denied") {
      setShowBlockedModal(true);
    }
  }

  function handleDecline() {
    localStorage.setItem(PROMPT_KEY, String(Date.now()));
    setShowPrompt(false);
  }

  function handleDismissBanner() {
    sessionStorage.setItem(BANNER_DISMISSED_KEY, "1");
    setShowPersistentBanner(false);
  }

  async function handleRecheckPermission() {
    if (!userId) return;
    const permission = await requestPushPermission();
    if (permission === "granted") {
      const ok = await subscribeToPush(userId);
      if (ok) setShowBlockedModal(false);
    }
  }

  function openBrowserNotificationSettings() {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("edg/")) { window.open("edge://settings/content/notifications", "_blank"); return; }
    if (ua.includes("chrome") || ua.includes("chromium")) { window.open("chrome://settings/content/notifications", "_blank"); return; }
    if (ua.includes("firefox")) { window.open("about:preferences#privacy", "_blank"); }
  }

  return (
    <>
      {children}

      {/* ── Persistent top banner — shown after 3 days without subscribing ── */}
      {showPersistentBanner && !isIosNotInstalled && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 9990,
          background: "linear-gradient(135deg, rgba(109,40,217,0.95), rgba(139,92,246,0.9))",
          backdropFilter: "blur(12px)",
          padding: "10px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          borderBottom: "1px solid rgba(196,181,253,0.2)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>🔔</span>
            <span style={{ fontSize: 12, color: "#f5f3ff", lineHeight: 1.4 }}>
              <strong>Never miss your daily action</strong> — turn on notifications
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={() => void handleAccept()} style={{
              padding: "6px 12px", borderRadius: 7, border: "none",
              background: "rgba(255,255,255,0.2)", color: "#fff",
              fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}>
              Enable
            </button>
            <button onClick={handleDismissBanner} style={{
              padding: "6px 10px", borderRadius: 7,
              background: "transparent", border: "1px solid rgba(255,255,255,0.2)",
              color: "rgba(255,255,255,0.7)", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
            }}>
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── iOS: "Add to Home Screen" banner ─────────────────────────────── */}
      {isIosNotInstalled && showPrompt && (
        <div style={{
          position: "fixed", bottom: 80, left: 16, right: 16,
          maxWidth: 420, margin: "0 auto",
          zIndex: 9999,
          background: "var(--bm-bg3)",
          border: "1px solid rgba(139,92,246,0.3)",
          borderRadius: 16, padding: "16px 18px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--bm-text)", marginBottom: 6 }}>
            📲 Add to Home Screen for notifications
          </div>
          <div style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.6, marginBottom: 12 }}>
            iOS only delivers push notifications from installed apps.
            In Safari: tap <strong>Share (□↑)</strong> → <strong>Add to Home Screen</strong>.
          </div>
          <button onClick={handleDecline} style={{
            width: "100%", padding: "8px 0", borderRadius: 8,
            border: "1px solid var(--bm-border2)", background: "transparent",
            color: "var(--bm-text3)", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
          }}>
            Got it
          </button>
        </div>
      )}

      {/* ── Bottom-sheet prompt — after first task ─────────────────────── */}
      {showPrompt && !isIosNotInstalled && (
        <div style={{
          position: "fixed", bottom: 24, left: 16, right: 16,
          maxWidth: 420, margin: "0 auto",
          zIndex: 9999,
          background: "var(--bm-bg3)",
          border: "1px solid var(--bm-border2)",
          borderRadius: 16, padding: "16px 18px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ fontSize: 24, flexShrink: 0 }}>🔔</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--bm-text)", marginBottom: 4 }}>
                Stay on streak tomorrow?
              </div>
              <div style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.5, marginBottom: 12 }}>
                Get a morning nudge when your action is ready. No spam. Turn off anytime.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => void handleAccept()} style={{
                  flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
                  background: "rgba(139,92,246,0.18)", color: "var(--bm-purple)",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}>
                  Yes, remind me
                </button>
                <button onClick={handleDecline} style={{
                  padding: "8px 14px", borderRadius: 8, fontSize: 12,
                  border: "1px solid var(--bm-border2)", background: "transparent",
                  color: "var(--bm-text3)", cursor: "pointer", fontFamily: "inherit",
                }}>
                  Not now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Blocked modal — permission denied ─────────────────────────── */}
      {showBlockedModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 10000,
          background: "rgba(0,0,0,0.65)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }}>
          <div style={{
            width: "100%", maxWidth: 440,
            borderRadius: 18, border: "1px solid var(--bm-border2)",
            background: "var(--bm-bg3)", padding: "22px 20px 18px",
            boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 22 }}>🔒</span>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--bm-text)" }}>
                Notifications are blocked
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.6, marginBottom: 10 }}>
              Your browser is blocking BuildMind notifications. You need to allow them in your browser settings to receive daily action reminders.
            </div>
            <div style={{ fontSize: 11, color: "var(--bm-text4)", lineHeight: 1.5, marginBottom: 16 }}>
              In Chrome: Settings → Privacy &amp; Security → Site Settings → Notifications → Allow buildmind.live
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={openBrowserNotificationSettings} style={{
                flex: 1, padding: "9px 10px", borderRadius: 8,
                border: "1px solid var(--bm-border2)", background: "transparent",
                color: "var(--bm-text2)", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
              }}>
                Open settings
              </button>
              <button onClick={() => void handleRecheckPermission()} style={{
                flex: 1, padding: "9px 10px", borderRadius: 8, border: "none",
                background: "rgba(139,92,246,0.22)", color: "var(--bm-purple)",
                fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}>
                I've allowed it ✓
              </button>
            </div>
            <button onClick={() => setShowBlockedModal(false)} style={{
              width: "100%", marginTop: 8, padding: "7px 0", borderRadius: 8,
              background: "transparent", border: "none",
              color: "var(--bm-text4)", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
            }}>
              Dismiss for now
            </button>
          </div>
        </div>
      )}
    </>
  );
}
