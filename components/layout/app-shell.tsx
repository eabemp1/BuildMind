"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar, { SidebarContent } from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";
import { trackPageView, trackFunnelStep } from "@/lib/onboarding-analytics";
import { createClient } from "@/lib/supabase/client";
import { TrialBanner, TrialPaywall } from "@/components/TrialBanner";
import { storage } from "@/lib/storage";

// REC 4.2: Persistent daily loop status bar
function DailyLoopStatusBar() {
  const [loopState, setLoopState] = useState<{
    dayOfWeek: number;
    taskDone: boolean;
    reflectionDone: boolean;
    hoursUntilBriefing: number;
  } | null>(null);

  useEffect(() => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
    const hoursUntilBriefing = now.getHours() < 7
      ? 7 - now.getHours()
      : 24 - now.getHours() + 7;

    const today = now.toISOString().slice(0, 10);
    const taskDone = storage.get(`bm_task_done_${today}`) === "1";
    const reflectionDone = storage.get(`bm_reflect_done_${today}`) === "1";

    setLoopState({ dayOfWeek, taskDone, reflectionDone, hoursUntilBriefing });
  }, []);

  if (!loopState) return null;

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayLabel = dayNames[loopState.dayOfWeek];
  const briefingNote = loopState.hoursUntilBriefing <= 2
    ? "Briefing arriving soon"
    : `Briefing at 7am`;

  return (
    <div style={{
      borderBottom: "1px solid var(--bm-border)",
      background: "var(--bm-bg)",
      padding: "5px 12px",
      display: "flex",
      alignItems: "center",
      gap: 10,
      fontSize: 11,
      color: "var(--bm-text4)",
      overflowX: "auto",
      whiteSpace: "nowrap",
      scrollbarWidth: "none",
    }}>
      <span style={{ color: "var(--bm-text3)", fontWeight: 600 }}>{dayLabel}</span>
      <span style={{ color: "var(--bm-border2)" }}>·</span>
      <span>
        Task:{" "}
        <span style={{ color: loopState.taskDone ? "var(--bm-accent)" : "var(--bm-text4)", fontWeight: loopState.taskDone ? 500 : 400 }}>
          {loopState.taskDone ? "done" : "not yet"}
        </span>
      </span>
      <span style={{ color: "var(--bm-border2)" }}>·</span>
      <span>
        Reflection:{" "}
        <span style={{ color: loopState.reflectionDone ? "var(--bm-accent)" : "var(--bm-text4)", fontWeight: loopState.reflectionDone ? 500 : 400 }}>
          {loopState.reflectionDone ? "done" : "pending"}
        </span>
      </span>
      <span style={{ color: "var(--bm-border2)" }}>·</span>
      <span>{briefingNote}</span>
    </div>
  );
}

const PATH_TO_FUNNEL: Record<string, Parameters<typeof trackFunnelStep>[0]> = {
  "/today":   "first_today",
  "/reports": "first_report",
  "/upgrade": "upgrade_seen",
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  // ── 7-Day Free Trial state ────────────────────────────────────────────────
  const [trialDaysRemaining, setTrialDaysRemaining] = useState(0);
  const [trialExpired, setTrialExpired] = useState(false);

  useEffect(() => {
    // Fetch authoritative trial state from billing/status once per page.
    fetch("/api/billing/status", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((d: { trial?: { active?: boolean; expired?: boolean; daysRemaining?: number } } | null) => {
        if (!d?.trial) return;
        if (d.trial.expired) {
          setTrialExpired(true);
        } else if (d.trial.active) {
          setTrialDaysRemaining(d.trial.daysRemaining ?? 0);
        }
      })
      .catch(() => {});
  }, [pathname]);

  useEffect(() => {
    try {
      trackPageView(pathname);
      const step = PATH_TO_FUNNEL[pathname];
      if (step) trackFunnelStep(step);
    } catch {}
  }, [pathname]);

  async function handleSignOut() {
    const { storage } = await import("@/lib/storage");
    storage.onSignOut();
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <div className="relative flex h-dvh min-h-dvh overflow-hidden" style={{ background: "var(--bm-bg)" }}>

      {/* ── Sidebar — desktop ── */}
      <aside className="sticky top-0 hidden h-dvh w-[220px] shrink-0 md:flex"
             style={{ borderRight: "1px solid var(--bm-border)" }}>
        <Sidebar />
      </aside>

      {/* ── Sidebar — mobile overlay ── */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 flex md:hidden">
            <motion.div
              className="absolute inset-0"
              style={{ background: "rgba(7,8,10,0.75)", backdropFilter: "blur(6px)" }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              className="relative h-full w-[220px] overflow-hidden"
              style={{ borderRight: "1px solid var(--bm-border)", background: "var(--bm-bg2)" }}
              initial={{ x: -270 }} animate={{ x: 0 }} exit={{ x: -270 }}
              transition={{ type: "spring", stiffness: 340, damping: 30 }}
            >
              <SidebarContent
                onNavClick={() => setMobileOpen(false)}
                onSignOut={handleSignOut}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Main ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header
          className="sticky top-0 z-30"
          style={{
            height: 50,
            borderBottom: "1px solid var(--bm-border)",
            background: "color-mix(in srgb, var(--bm-bg) 94%, transparent)",
            backdropFilter: "blur(20px)",
          }}
        >
          <Topbar onToggleSidebar={() => setMobileOpen(p => !p)} />
        </header>

        {/* REC 4.2: Persistent daily loop status bar — visible from every dashboard page */}
        <DailyLoopStatusBar />

        {/* ── 7-Day Free Trial banner (active trial) + hard paywall (expired) ── */}
        {trialDaysRemaining > 0 && (
          <div style={{ padding: "8px 16px 0" }}>
            <TrialBanner daysRemaining={trialDaysRemaining} />
          </div>
        )}
        <TrialPaywall expired={trialExpired} />

        {/* Page */}
        <AnimatePresence mode="wait">
          <motion.main
            key={pathname}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="flex-1 overflow-y-auto px-3 py-5 sm:px-8 sm:py-8"
          >
            <div style={{ maxWidth: 1120, margin: "0 auto", width: "100%" }}>{children}</div>
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  );
}
