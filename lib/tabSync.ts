"use client";

/**
 * lib/tabSync.ts — Multi-tab state synchronization via BroadcastChannel
 *
 * Problem: task-done state, streak, and billing plan are stored in localStorage
 * and only read on mount. A user who completes their check-in in Tab A still sees
 * the uncompleted form in Tab B. If they submit Tab B, the server gets a duplicate
 * check-in: two score updates, two streak increments, two reflexion-outcome logs.
 *
 * Fix: Every meaningful state change broadcasts a typed message over a shared
 * BroadcastChannel. Subscribers react immediately without a page reload.
 *
 * Usage:
 *   // In the component that writes:
 *   import { broadcastTabEvent } from "@/lib/tabSync";
 *   broadcastTabEvent({ type: "checkin_done", date: today });
 *
 *   // In components that need to react:
 *   import { useTabSync } from "@/lib/tabSync";
 *   useTabSync((event) => {
 *     if (event.type === "checkin_done") setDone(true);
 *   });
 */

import { useEffect } from "react";

export type TabSyncEvent =
  | { type: "checkin_done"; date: string }
  | { type: "streak_updated"; streak: number }
  | { type: "plan_updated"; plan: string }
  | { type: "reflection_done"; date: string }
  | { type: "sign_out" };

const CHANNEL_NAME = "buildmind_tab_sync";

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (!window.BroadcastChannel) return null;
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

/** Broadcast a state-change event to all other tabs. */
export function broadcastTabEvent(event: TabSyncEvent): void {
  try {
    getChannel()?.postMessage(event);
  } catch {
    // BroadcastChannel.postMessage can throw if the channel is closed
  }
}

/** React hook — subscribe to tab-sync events from other tabs. */
export function useTabSync(handler: (event: TabSyncEvent) => void): void {
  useEffect(() => {
    const ch = getChannel();
    if (!ch) return;

    const listener = (msg: MessageEvent<TabSyncEvent>) => {
      try {
        handler(msg.data);
      } catch {
        // Never let a handler crash the channel listener
      }
    };

    ch.addEventListener("message", listener);
    return () => ch.removeEventListener("message", listener);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
