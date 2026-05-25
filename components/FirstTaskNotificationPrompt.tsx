"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X } from "lucide-react";
import { getPushStatus, requestPushPermission, subscribeToPush } from "@/lib/push";
import { storage } from "@/lib/storage";
import { fetchBehaviorState, persistBehaviorState } from "@/lib/userBehaviorState";

interface FirstTaskNotificationPromptProps {
  userId: string;
}

export default function FirstTaskNotificationPrompt({ userId }: FirstTaskNotificationPromptProps) {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const checkShowPrompt = async () => {
      try {
        const serverState = await fetchBehaviorState<{ push_prompt_shown: boolean }>(["push_prompt_shown"]);
        const alreadyPrompted = serverState.push_prompt_shown === true || storage.get("bm_push_prompt_shown") === "true";
        if (serverState.push_prompt_shown === true) storage.set("bm_push_prompt_shown", "true");
        const status = await getPushStatus();
        if (!alreadyPrompted && (status === "default" || status === "granted")) {
          setShow(true);
        }
      } catch {}
    };

    // Give a brief delay to avoid visual jank during page load
    const timer = setTimeout(checkShowPrompt, 500);
    return () => clearTimeout(timer);
  }, []);

  const handleEnable = async () => {
    setLoading(true);
    setError("");
    try {
      const permission = await requestPushPermission();
      if (permission !== "granted") {
        storage.set("bm_push_prompt_shown", "true");
        persistBehaviorState({ push_prompt_shown: true });
        setShow(false);
        return;
      }
      const subscribed = await subscribeToPush(userId);
      if (!subscribed) {
        setError("Could not enable notifications. Check your browser settings and try again in Settings.");
        return;
      }
      storage.set("bm_push_prompt_shown", "true");
      persistBehaviorState({ push_prompt_shown: true });
      setShow(false);
    } catch (error) {
      console.error("Push permission error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    storage.set("bm_push_prompt_shown", "true");
    persistBehaviorState({ push_prompt_shown: true });
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            background: "rgba(12, 13, 15, 0.82)",
            backdropFilter: "blur(10px)",
            fontFamily: "inherit",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleDismiss();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            style={{
              width: "100%",
              maxWidth: 420,
              background: "var(--bm-bg2)",
              border: "1px solid var(--bm-border2)",
              borderRadius: 18,
              overflow: "hidden",
              boxShadow: "0 0 80px rgba(0,255,135,0.08), 0 32px 80px rgba(0,0,0,0.6)",
            }}
          >
            {/* Top accent stripe */}
            <div style={{ height: 2, background: "var(--bm-accent)" }} />

            <div style={{ padding: "24px 24px 20px", position: "relative" }}>
              {/* Close button */}
              <button
                onClick={handleDismiss}
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--bm-text4)",
                  padding: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                aria-label="Close"
              >
                <X size={16} />
              </button>

              {/* Icon + title */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 18, paddingRight: 24 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    flexShrink: 0,
                    background: "var(--bm-green-dim)",
                    border: "1px solid rgba(0,255,135,0.18)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Bell size={20} style={{ color: "var(--bm-accent)" }} />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: "var(--bm-text)",
                      lineHeight: 1.35,
                      marginBottom: 6,
                    }}
                  >
                    Stay on track with reminders
                  </div>
                  <div style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.65 }}>
                    Get daily push notifications so you don't lose momentum. You can disable anytime in settings.
                  </div>
                </div>
              </div>

              {/* Features */}
              <div
                style={{
                  background: "var(--bm-accent-dim, rgba(0,255,135,0.08))",
                  border: "1px solid rgba(0,255,135,0.18)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  marginBottom: 18,
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    color: "var(--bm-accent)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: 10,
                    fontWeight: 600,
                  }}
                >
                  Why enable?
                </div>
                {["Daily reminders about your top task", "Never miss your reflection window", "Track momentum without opening app"].map((feature, i) => (
                  <motion.div
                    key={feature}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * i + 0.1 }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      color: "var(--bm-text2)",
                      marginBottom: i < 2 ? 6 : 0,
                    }}
                  >
                    <span style={{ color: "var(--bm-accent)", flexShrink: 0, fontSize: 11, fontWeight: 700 }}>
                      ✓
                    </span>
                    {feature}
                  </motion.div>
                ))}
              </div>

              {error && (
                <div
                  style={{
                    borderRadius: 8,
                    background: "rgba(248,113,113,0.08)",
                    border: "1px solid rgba(248,113,113,0.2)",
                    color: "#f87171",
                    fontSize: 12,
                    lineHeight: 1.5,
                    marginBottom: 14,
                    padding: "10px 12px",
                  }}
                >
                  {error}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={handleDismiss}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: "10px 16px",
                    borderRadius: 8,
                    border: "1px solid var(--bm-border)",
                    background: "transparent",
                    color: "var(--bm-text2)",
                    cursor: loading ? "not-allowed" : "pointer",
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: "inherit",
                    transition: "all 0.2s",
                    opacity: loading ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      (e.currentTarget as HTMLButtonElement).style.background = "var(--bm-bg3)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  Not now
                </button>
                <button
                  onClick={handleEnable}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: "10px 16px",
                    borderRadius: 8,
                    border: "none",
                    background: "var(--bm-accent)",
                    color: "#000",
                    cursor: loading ? "not-allowed" : "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: "inherit",
                    transition: "all 0.2s",
                    opacity: loading ? 0.7 : 1,
                    boxShadow: "0 4px 12px rgba(0,255,135,0.2)",
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 18px rgba(0,255,135,0.3)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 12px rgba(0,255,135,0.2)";
                  }}
                >
                  {loading ? "Enabling..." : "Enable notifications"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
