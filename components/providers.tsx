"use client";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initAnalytics } from "@/lib/analytics";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { LimitModalProvider } from "@/components/LimitModal";
import AchievementToast from "@/components/AchievementToast";
import { runNotificationChecks } from "@/lib/notifications";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 1000 * 30, refetchOnWindowFocus: false, retry: 1 },
      mutations: { retry: 0 },
    },
  }));
  useEffect(() => {
    initAnalytics();
    // Run notification checks on every app load
    try { runNotificationChecks(); } catch {}
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LimitModalProvider>
          {children}
          <AchievementToast />
        </LimitModalProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
