"use client";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initAnalytics } from "@/lib/analytics";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { LimitModalProvider } from "@/components/LimitModal";
import AchievementToast from "@/components/AchievementToast";
import { runNotificationChecks } from "@/lib/notifications";
import { fetchAndSyncStoredPlanFromBillingStatus } from "@/lib/plan";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 1000 * 30, refetchOnWindowFocus: false, retry: 1 },
      mutations: { retry: 0 },
    },
  }));
  const [showBillingSynced, setShowBillingSynced] = useState(false);

  useEffect(() => {
    initAnalytics();
    // Run notification checks on every app load
    try { runNotificationChecks(); } catch {}

    const syncPlan = async () => {
      const syncedPlan = await fetchAndSyncStoredPlanFromBillingStatus();
      if (syncedPlan !== "builder") return;

      const shownKey = "bm_builder_sync_indicator_shown";
      if (sessionStorage.getItem(shownKey)) return;

      sessionStorage.setItem(shownKey, "1");
      setShowBillingSynced(true);

      window.setTimeout(() => {
        setShowBillingSynced(false);
      }, 2600);
    };

    void syncPlan();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void syncPlan();
      }
    };

    const handleFocus = () => {
      void syncPlan();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);
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
