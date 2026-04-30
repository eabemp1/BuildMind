"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar, { SidebarContent } from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";
import { trackPageView, trackFunnelStep } from "@/lib/onboarding-analytics";
import { createClient } from "@/lib/supabase/client";

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

  useEffect(() => {
    try {
      trackPageView(pathname);
      const step = PATH_TO_FUNNEL[pathname];
      if (step) trackFunnelStep(step);
    } catch {}
  }, [pathname]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <div className="relative flex h-screen overflow-hidden">

      {/* ── Subtle noise texture ── */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-soft-light"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")",
        }}
      />

      {/* ── Neon ambient glow — top-right matching inspiration ── */}
      <div
        className="pointer-events-none absolute"
        style={{
          top: -120, right: -80,
          width: 480, height: 480,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(92,200,138,0.05) 0%, transparent 65%)",
          filter: "blur(1px)",
        }}
      />

      {/* ── Sidebar — desktop ── */}
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 md:flex"
             style={{ borderRight: "1px solid var(--bm-border)" }}>
        <Sidebar />
      </aside>

      {/* ── Sidebar — mobile overlay ── */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 flex md:hidden">
            <motion.div
              className="absolute inset-0"
              style={{ background: "rgba(12,13,15,0.7)", backdropFilter: "blur(4px)" }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              className="relative h-full w-[270px] overflow-hidden"
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
            height: 56,
            borderBottom: "1px solid var(--bm-border)",
            background: "color-mix(in srgb, var(--bm-bg) 88%, transparent)",
            backdropFilter: "blur(16px)",
          }}
        >
          <Topbar onToggleSidebar={() => setMobileOpen(p => !p)} />
        </header>

        {/* Page */}
        <AnimatePresence mode="wait">
          <motion.main
            key={pathname}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="flex-1 overflow-y-auto"
            style={{ padding: "28px 32px" }}
          >
            <div style={{ maxWidth: 1440, margin: "0 auto" }}>{children}</div>
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  );
}
