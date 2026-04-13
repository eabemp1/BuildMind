/**
 * components/PushNotificationToggle.tsx
 *
 * Drop into your Settings page.
 * Uses the push.ts lib to manage subscription.
 *
 * Usage in settings/page.tsx:
 *   import PushNotificationToggle from "@/components/PushNotificationToggle";
 *   <PushNotificationToggle userId={user.id} />
 */

"use client";

import { useState, useEffect } from "react";
import {
  requestPushPermission,
  subscribeToPush,
  unsubscribeFromPush,
  getPushStatus,
} from "@/lib/push";

type Status = "loading" | "unsupported" | "denied" | "default" | "subscribed";

export default function PushNotificationToggle({ userId }: { userId: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    getPushStatus().then((s) => setStatus(s as Status));
  }, []);

  async function handleEnable() {
    setWorking(true);
    const permission = await requestPushPermission();
    if (permission !== "granted") {
      setStatus("denied");
      setWorking(false);
      return;
    }
    const ok = await subscribeToPush(userId);
    setStatus(ok ? "subscribed" : "default");
    setWorking(false);
  }

  async function handleDisable() {
    setWorking(true);
    await unsubscribeFromPush(userId);
    setStatus("default");
    setWorking(false);
  }

  if (status === "loading") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 40, height: 22, borderRadius: 11,
          background: "var(--bm-bg4)", animation: "pulse 1.5s infinite"
        }} />
        <span style={{ fontSize: 12, color: "var(--bm-text3)" }}>Checking…</span>
      </div>
    );
  }

  if (status === "unsupported") {
    return (
      <div style={{ fontSize: 12, color: "var(--bm-text3)" }}>
        Push notifications are not supported in this browser.
        <br />
        <span style={{ fontSize: 11, opacity: 0.7 }}>
          Try Chrome or Edge on Android/Desktop.
        </span>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div style={{
        borderRadius: 8, background: "rgba(248,113,113,0.08)",
        border: "1px solid rgba(248,113,113,0.2)",
        padding: "10px 14px", fontSize: 12, color: "#f87171",
      }}>
        Notifications are blocked in your browser settings.
        <br />
        <span style={{ fontSize: 11, opacity: 0.8 }}>
          Open your browser settings → Site settings → Notifications → Allow buildmind.live
        </span>
      </div>
    );
  }

  const isSubscribed = status === "subscribed";

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 16px",
      borderRadius: 10,
      border: `1px solid ${isSubscribed ? "rgba(139,131,232,.3)" : "var(--bm-border2)"}`,
      background: isSubscribed ? "rgba(139,131,232,.06)" : "var(--bm-bg3)",
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--bm-text)", marginBottom: 2 }}>
          {isSubscribed ? "🔔 Push notifications on" : "🔕 Push notifications off"}
        </div>
        <div style={{ fontSize: 11, color: "var(--bm-text3)", lineHeight: 1.5 }}>
          {isSubscribed
            ? "You'll get a daily reminder when your action is ready."
            : "Get a daily reminder to stay on streak. No spam ever."}
        </div>
      </div>

      <button
        onClick={isSubscribed ? handleDisable : handleEnable}
        disabled={working}
        style={{
          flexShrink: 0,
          marginLeft: 16,
          padding: "7px 14px",
          borderRadius: 7,
          fontSize: 12,
          fontWeight: 500,
          cursor: working ? "not-allowed" : "pointer",
          opacity: working ? 0.6 : 1,
          transition: "all .2s",
          border: "none",
          background: isSubscribed ? "rgba(248,113,113,0.15)" : "rgba(139,131,232,.18)",
          color: isSubscribed ? "#f87171" : "var(--bm-purple)",
        }}
      >
        {working ? "…" : isSubscribed ? "Disable" : "Enable"}
      </button>
    </div>
  );
}
