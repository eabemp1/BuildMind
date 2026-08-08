"use client";

/**
 * components/providers.tsx — v2
 *
 * Cross-account localStorage fix:
 *   Calls initStorageAuthSync() at app boot so the user-scoped storage
 *   wrapper knows which account is active. Every localStorage read/write
 *   in the app now goes through lib/storage.ts and is automatically
 *   namespaced to "bm_u:<userId>:<key>".
 *
 *   When User A signs out and User B signs in on the same device,
 *   storage.onSignOut() wipes all unscoped legacy keys and storage.onSignIn()
 *   loads User B's own namespace — so User B can never see User A's data.
 */

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initAnalytics } from "@/lib/analytics";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { LimitModalProvider } from "@/components/LimitModal";
import AchievementToast from "@/components/AchievementToast";
import { runNotificationChecks, seedScheduledNotifications, syncNotificationsFromServer } from "@/lib/notifications";
import { syncAchievementsFromServer } from "@/lib/achievements";
import { fetchAndSyncStoredPlanFromBillingStatus } from "@/lib/plan";
import { initStorageAuthSync } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { broadcastTabEvent } from "@/lib/tabSync";

/**
 * AUDIT FIX M1: Accepts nonce prop and stores it on window for any dynamically
 * injected scripts to consume. Prevents silent CSP failures when scripts added
 * through this provider tree lack the per-request nonce.
 */
export default function Providers({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  // Store nonce on window so any dynamically injected scripts can read it
  if (typeof window !== 'undefined' && nonce) {
    (window as typeof window & { __CSP_NONCE__?: string }).__CSP_NONCE__ = nonce;
  }
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 1000 * 30, refetchOnWindowFocus: false, retry: 1 },
      mutations: { retry: 0 },
    },
  }));
  const [showBillingSynced, setShowBillingSynced] = useState(false);

  useEffect(() => {
    initAnalytics();

    // ── Cross-account localStorage scoping (fix for account data bleed) ──────
    // Wire the user-scoped storage singleton to Supabase auth state changes.
    // This must happen before any other code reads from localStorage.
    const supabase = createClient();
    const unsubscribeStorage = initStorageAuthSync(supabase);
    let activeUserId: string | null = null;

    supabase.auth.getUser().then(({ data }) => {
      activeUserId = data.user?.id ?? null;
    }).catch(() => {
      activeUserId = null;
      queryClient.clear();
    });

    const { data: { subscription: cacheSubscription } } = supabase.auth.onAuthStateChange((event, session) => {
     const nextUserId = session?.user?.id ?? null;
     const isGenuineAccountSwitch =
    activeUserId !== null && nextUserId !== null && activeUserId !== nextUserId;
     if (event === "SIGNED_OUT" || nextUserId !== activeUserId) {
    // Cancel any in-flight queries before clearing — otherwise a resolving
        void queryClient.cancelQueries().then(() => {
          queryClient.clear();
          if (isGenuineAccountSwitch && typeof window !== "undefined") {
            window.location.reload();
          }
        });
        setShowBillingSynced(false);

    // ── Notification checks ────────────────────────────────────────────────────
    try {
      void syncNotificationsFromServer().finally(() => {
        runNotificationChecks();
        seedScheduledNotifications();
      });
      void syncAchievementsFromServer();
    } catch {}

    // ── Plan sync ─────────────────────────────────────────────────────────────
    const syncPlan = async () => {
      const syncedPlan = await fetchAndSyncStoredPlanFromBillingStatus();
      // Notify other open tabs of the plan change regardless of which tier
      broadcastTabEvent({ type: "plan_updated", plan: syncedPlan });
      if (syncedPlan !== "builder") return;
      const shownKey = "bm_builder_sync_indicator_shown";
      if (sessionStorage.getItem(shownKey)) return;
      sessionStorage.setItem(shownKey, "1");
      setShowBillingSynced(true);
      window.setTimeout(() => setShowBillingSynced(false), 2600);
    };

    void syncPlan();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") void syncPlan();
    };
    const handleFocus = () => void syncPlan();

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      unsubscribeStorage();
      cacheSubscription.unsubscribe();
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LimitModalProvider>
          {children}
          <AchievementToast />
          {showBillingSynced && (
            <div
              style={{
                position: "fixed",
                right: 14,
                top: 14,
                zIndex: 10020,
                borderRadius: 999,
                border: "1px solid rgba(74,222,128,0.35)",
                background: "rgba(16,185,129,0.14)",
                color: "#86efac",
                padding: "7px 11px",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.01em",
                boxShadow: "0 6px 20px rgba(0,0,0,0.28)",
              }}
            >
              Billing synced: Builder active
            </div>
          )}
        </LimitModalProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
