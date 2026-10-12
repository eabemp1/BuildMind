"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar, { SidebarContent } from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";
import { trackPageView, trackFunnelStep } from "@/lib/onboarding-analytics";
import { createClient } from "@/lib/supabase/client";
import { TrialBanner } from "@/components/TrialBanner";
import { storage } from "@/lib/storage";
import { fetchBehaviorState } from "@/lib/userBehaviorState";
import CommandPalette from "@/components/CommandPalette";
import { SidePaneProvider, useSidePane } from "@/components/layout/side-pane-context";
import SidePaneHost from "@/components/layout/side-pane";

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
    fetchBehaviorState<{ checkin_done_date: string; reflect_done_date: string }>([
      "checkin_done_date",
      "reflect_done_date",
    ]).then((values) => {
      setLoopState({
        dayOfWeek,
        taskDone: values.checkin_done_date === today || taskDone,
        reflectionDone: values.reflect_done_date === today || reflectionDone,
        hoursUntilBriefing,
      });
    }).catch(() => {});
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

const NAV_KEY = "bm_nav_open";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidePaneProvider>
      <AppShellInner>{children}</AppShellInner>
    </SidePaneProvider>
  );
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Desktop drawer: the sidebar slides away to give the page the full width.
  const [navOpen, setNavOpen] = useState(true);
  const { pane, openPane, closePane } = useSidePane();
  // When the sidebar was closed automatically to make room for the pane, it
  // comes back when the pane closes. A sidebar the founder closed stays closed.
  const autoClosed = useRef(false);
  const pathname = usePathname();
  const router = useRouter();

  // ── 14-Day Free Trial state ───────────────────────────────────────────────
  const [trialDaysRemaining, setTrialDaysRemaining] = useState(0);

  useEffect(() => {
    // Fetch authoritative trial state from billing/status once per page.
    fetch("/api/billing/status", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((d: { trial?: { active?: boolean; expired?: boolean; daysRemaining?: number } } | null) => {
        if (!d?.trial) return;
        if (d.trial.active) {
          setTrialDaysRemaining(d.trial.daysRemaining ?? 0);
        } else {
          setTrialDaysRemaining(0);
        }
      })
      .catch(() => {});
  }, [pathname]);

  useEffect(() => {
    try { if (window.localStorage.getItem(NAV_KEY) === "0") setNavOpen(false); } catch { /* ignore */ }
  }, []);

  const setNav = (open: boolean, remember = true) => {
    setNavOpen(open);
    if (remember) { try { window.localStorage.setItem(NAV_KEY, open ? "1" : "0"); } catch { /* ignore */ } }
  };

  function toggleSidebar() {
    if (typeof window !== "undefined" && window.innerWidth >= 768) { autoClosed.current = false; setNav(!navOpen); }
    else setMobileOpen((p) => !p);
  }

  // Make room: opening a pane on a mid-size screen tucks the sidebar away.
  useEffect(() => {
    if (pane && navOpen && typeof window !== "undefined" && window.innerWidth >= 1024 && window.innerWidth < 1500) {
      autoClosed.current = true;
      setNavOpen(false);
    } else if (!pane && autoClosed.current) {
      autoClosed.current = false;
      setNavOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane]);

  // Shortcuts: Ctrl/Cmd+B toggles the sidebar, Ctrl/Cmd+J toggles the coach pane.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() === "b") { e.preventDefault(); toggleSidebar(); }
      if (e.key.toLowerCase() === "j") { e.preventDefault(); if (pane?.kind === "coach") closePane(); else openPane({ kind: "coach" }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
      <a href="#main-content" className="bm-skip-link">Skip to main content</a>

      {/* ── Sidebar — desktop ── */}
      <motion.aside className="sticky top-0 hidden h-dvh shrink-0 overflow-hidden md:flex"
             aria-hidden={!navOpen}
             initial={false}
             animate={{ width: navOpen ? 220 : 0 }}
             transition={{ type: "spring", stiffness: 380, damping: 38 }}
             style={{ borderRight: navOpen ? "1px solid var(--bm-border)" : "none" }}>
        <div style={{ width: 220, flexShrink: 0, height: "100%" }} {...(navOpen ? {} : { inert: "" as unknown as boolean })}>
          <Sidebar />
        </div>
      </motion.aside>

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

      {/* ── Main (shrinks when a side pane is open) ── */}
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
          <Topbar onToggleSidebar={toggleSidebar} navOpen={navOpen} />
        </header>

        {/* REC 4.2: Persistent daily loop status bar — visible from every dashboard page */}
        <DailyLoopStatusBar />

        {/* ── 14-Day Free Trial banner (active trial) ── */}
        {trialDaysRemaining > 0 && (
          <div style={{ padding: "8px 16px 0" }}>
            <TrialBanner daysRemaining={trialDaysRemaining} />
          </div>
        )}

        {/* Page */}
        {/* min-w-0 + overflow-x-hidden: a flex child cannot shrink below its widest
            content by default, so one wide card made the whole page scroll
            sideways on phones (Today). */}
        <CommandPalette />
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 outline-none overflow-y-auto overflow-x-hidden px-3 py-5 sm:px-8 sm:py-8">
          <div style={{ maxWidth: 1120, margin: "0 auto", width: "100%", minWidth: 0 }}>{children}</div>
        </main>
      </div>

      {/* ── Side pane: coach, insights, projects, agent output ── */}
      <SidePaneHost />
    </div>
  );
}
