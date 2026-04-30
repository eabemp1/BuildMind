/**
 * lib/push.ts — BuildMind Push Notification Manager
 *
 * Usage:
 *   import { requestPushPermission, subscribeToPush, unsubscribeFromPush } from "@/lib/push";
 *
 * Flow:
 *   1. User clicks "Enable notifications" in Settings
 *   2. requestPushPermission() prompts the browser
 *   3. subscribeToPush() creates a PushSubscription and saves it to Supabase
 *   4. Your Supabase Edge Function reads the subscription and sends pushes
 */

// Your VAPID public key — generate a pair at https://vapidkeys.com/
// Store the PRIVATE key in your Supabase Edge Function secrets (VAPID_PRIVATE_KEY)
// Store the PUBLIC key here and in your edge function (VAPID_PUBLIC_KEY)
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// ── Service worker registration ────────────────────────────────────────────

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });
    if (process.env.NODE_ENV === "development") console.log("[BuildMind SW] Registered:", reg.scope);
    return reg;
  } catch (err) {
    console.error("[BuildMind SW] Registration failed:", err);
    return null;
  }
}

// ── Permission request ─────────────────────────────────────────────────────

export async function requestPushPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return await Notification.requestPermission();
}

// ── Subscribe ──────────────────────────────────────────────────────────────

export async function subscribeToPush(userId: string): Promise<boolean> {
  try {
    const reg = await registerServiceWorker();
    if (!reg) return false;

    // Wait for SW to be active
    await navigator.serviceWorker.ready;

    // Check for existing subscription first
    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
      if (!VAPID_PUBLIC_KEY) {
        console.error("[BuildMind Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set");
        return false;
      }
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    // Save subscription to Supabase via API route
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, subscription: sub.toJSON() }),
    });

    return res.ok;
  } catch (err) {
    console.error("[BuildMind Push] Subscribe failed:", err);
    return false;
  }
}

// ── Unsubscribe ────────────────────────────────────────────────────────────

export async function unsubscribeFromPush(userId: string): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    if (!reg) return true;

    const sub = await reg.pushManager.getSubscription();
    if (!sub) return true;

    await sub.unsubscribe();

    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    return true;
  } catch (err) {
    console.error("[BuildMind Push] Unsubscribe failed:", err);
    return false;
  }
}

// ── Check status ───────────────────────────────────────────────────────────

export async function getPushStatus(): Promise<
  "unsupported" | "denied" | "default" | "subscribed" | "granted"
> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "denied";

  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    if (!reg) return "default";
    const sub = await reg.pushManager.getSubscription();
    return sub ? "subscribed" : Notification.permission;
  } catch {
    return "default";
  }
}
