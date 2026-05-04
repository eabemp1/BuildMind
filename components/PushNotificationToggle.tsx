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

interface PushDiagnostics {
  hasSubscription: boolean;
  hasBriefingToday: boolean;
  envReady: boolean;
  issues: string[];
  diagnosis: string;
  subscribedAt: string | null;
}

export default function PushNotificationToggle({ userId }: { userId: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [working, setWorking] = useState(false);
  const [diagnostics, setDiagnostics] = useState<PushDiagnostics | null>(null);
  const [showDiag, setShowDiag] = useState(false);

  const [iosNotInstalled, setIosNotInstalled] = useState(false);

  useEffect(() => {
    getPushStatus().then((s) => setStatus(s as Status));
    // Detect iOS Safari running as browser tab (not installed PWA)
    // iOS only supports push from home-screen PWA install (16.4+)
    if (typeof window !== "undefined") {
      const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const isStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
      if (isIos && !isStandalone) setIosNotInstalled(true);
    }
    fetch("/api/push/status")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.ok) setDiagnostics(d); })
      .catch(() => {});
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
    if (ok) {
      // Refresh diagnostics after subscribing
      fetch("/api/push/status")
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.ok) setDiagnostics(d); })
        .catch(() => {});
    }
    setWorking(false);
  }

  async function handleDisable() {
    setWorking(true);
    await unsubscribeFromPush(userId);
    setStatus("default");
    setDiagnostics(prev => prev ? { ...prev, hasSubscription: false } : prev);
    setWorking(false);
  }

  if (iosNotInstalled) { return (<div style={{borderRadius:10,padding:"14px 16px",background:"rgba(139,92,246,0.07)",border:"1px solid rgba(139,92,246,0.2)",fontSize:13,color:"var(--bm-text2)",lineHeight:1.6}}><div style={{fontWeight:600,color:"var(--bm-text)",marginBottom:6}}>📲 Add BuildMind to your Home Screen first</div>iOS only supports push from installed PWA — not browser tabs.<br/><br/>In Safari: tap <strong>Share</strong> (□↑) → <strong>Add to Home Screen</strong>. Then open from home screen and enable notifications in Settings.</div>); }

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
  const hasIssues = diagnostics && diagnostics.issues.length > 0 && isSubscribed;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
              ? diagnostics?.hasBriefingToday
                ? "Today's briefing ready. Push sends at 05:30 UTC."
                : "Subscribed. Briefing generates at 05:00 UTC, push at 05:30 UTC."
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

      {/* Issues callout — only shows if subscribed but something is wrong */}
      {hasIssues && (
        <div style={{
          borderRadius: 8, background: "rgba(232,160,32,0.07)",
          border: "1px solid rgba(232,160,32,0.2)",
          padding: "10px 14px",
        }}>
          <button
            onClick={() => setShowDiag(v => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, width: "100%", textAlign: "left", fontFamily: "inherit" }}
          >
            <span style={{ fontSize: 12, color: "var(--bm-amber)", fontWeight: 600 }}>
              ⚠ {diagnostics!.issues.length} issue{diagnostics!.issues.length > 1 ? "s" : ""} found — notifications may not be arriving
            </span>
            <span style={{ fontSize: 11, color: "var(--bm-text3)", marginLeft: 8 }}>{showDiag ? "▲ hide" : "▼ details"}</span>
          </button>
          {showDiag && (
            <ul style={{ margin: "8px 0 0", padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 4 }}>
              {diagnostics!.issues.map((issue, i) => (
                <li key={i} style={{ fontSize: 11, color: "var(--bm-text2)", lineHeight: 1.5 }}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Success state details */}
      {isSubscribed && diagnostics && diagnostics.issues.length === 0 && (
        <div style={{ fontSize: 11, color: "var(--bm-text3)", paddingLeft: 4, lineHeight: 1.6 }}>
          ✓ Subscribed{diagnostics.subscribedAt ? ` since ${new Date(diagnostics.subscribedAt).toLocaleDateString()}` : ""}
          {" · "}
          {diagnostics.hasBriefingToday ? "✓ Briefing ready for today" : "Briefing generates at 05:00 UTC"}
        </div>
      )}
    </div>
  );
}
