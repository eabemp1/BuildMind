/**
 * components/layout/sidebar.tsx  (refactored — Fix 4)
 *
 * Reduced from 687 → ~290 lines by extracting:
 *   • Nav config, pure atoms, and NavItem → sidebar-nav.tsx
 *
 * This file now contains only:
 *   • SidebarUser     — user card + sign-out button
 *   • SidebarContent  — composed layout (nav loop, admin links, bottom bar)
 *   • Sidebar (default export) — desktop always-visible + mobile slide-in
 */
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  Menu, X, Sun, Moon, LogOut, ChevronRight, ChevronDown, Sparkles, Users,
} from "lucide-react";
import { getUnseenCount } from "@/lib/achievements";
import { type Plan, canAccess, syncStreakFromServer } from "@/lib/plan";
import { usePlan } from "@/lib/usePlan";
import { useTheme } from "@/components/layout/theme-provider";
import CofounderPulse from "@/components/CofounderPulse";
import AIUsageBadge from "@/components/AIUsageBadge";
import { createClient } from "@/lib/supabase/client";
import {
  NAV, hasPlanAccess, SectionLabel, SidebarLogo, NavItem,
} from "@/components/layout/sidebar-nav";
import { getTasksCompleted, syncTasksCompletedFromServer } from "@/lib/nav-config";
import { storage } from "@/lib/storage";

// ── User card at bottom ───────────────────────────────────────────────────────
function SidebarUser({ onSignOut }: { onSignOut: () => void }) {
  const { plan } = usePlan();
  const [user, setUser] = useState<{ email?: string; user_metadata?: Record<string, unknown> } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  const displayName =
    (user?.user_metadata?.full_name as string) ||
    (user?.user_metadata?.name as string) ||
    user?.email?.split("@")[0] ||
    "Founder";

  const initials = displayName
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className="flex items-center gap-2.5 px-4 py-3 mx-2 rounded-xl"
      style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border)" }}
    >
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
        style={{ background: "var(--bm-bg4)", color: "var(--bm-text2)", border: "1px solid var(--bm-border)" }}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: "var(--bm-text)" }}>
          {displayName}
        </p>
        <span
          className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-0.5"
          style={
            plan === "builder"
              ? { background: "var(--bm-bg4)", color: "var(--bm-text2)", border: "1px solid var(--bm-border)" }
              : { background: "var(--bm-bg)", color: "var(--bm-text4)" }
          }
        >
          {plan === "builder" ? "Builder" : "Free"}
        </span>
      </div>
      <button
        onClick={onSignOut}
        className="p-1.5 rounded-lg transition-all"
        style={{ color: "var(--bm-text3)" }}
        title="Sign out"
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--bm-text2)"; e.currentTarget.style.background = "var(--bm-bg4)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--bm-text3)"; e.currentTarget.style.background = "transparent"; }}
      >
        <LogOut size={14} />
      </button>
    </div>
  );
}

// ── Sidebar content (used on both desktop & mobile slide-in) ──────────────────
export function SidebarContent({ onNavClick, onSignOut }: { onNavClick?: () => void; onSignOut: () => void }) {
  const pathname = usePathname();
  const { plan } = usePlan();
  const { theme, toggle } = useTheme();
  const [isAdmin, setIsAdmin] = useState(false);
  const [reflectPending, setReflectPending] = useState(false);
  const [unseenBadges, setUnseenBadges] = useState(0);
  const [streakDays, setStreakDays] = useState(0);
  const [founderMenuOpen, setFounderMenuOpen] = useState(false);
  const [tasksCompleted, setTasksCompleted] = useState(0);

  useEffect(() => {
    const checkPending = () => {
      try {
        setReflectPending(storage.get("bm_reflect_pending") === "true");
        setUnseenBadges(getUnseenCount());
        setTasksCompleted(getTasksCompleted());
      } catch {}
      syncStreakFromServer().then(s => setStreakDays(s)).catch(() => {});
    };
    checkPending();
    // Sync tasks_completed_total from Supabase so progressive unlock survives device switches
    void syncTasksCompletedFromServer().then(checkPending);
    window.addEventListener("storage", checkPending);
    window.addEventListener("bm_streak_updated", checkPending);
    const interval = setInterval(checkPending, 8000);
    return () => {
      window.removeEventListener("storage", checkPending);
      window.removeEventListener("bm_streak_updated", checkPending);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const check = async () => {
      try {
        const sb = createClient();
        const { data } = await sb.auth.getUser();
        const aid = process.env.NEXT_PUBLIC_ADMIN_USER_ID;
        setIsAdmin(!!aid && data.user?.id === aid);
      } catch {}
    };
    void check();
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bm-bg2)" }}>
      <SidebarLogo streakDays={streakDays} />

      <nav className="flex-1 overflow-y-auto py-2" style={{ scrollbarWidth: "none" }}>
        {NAV.filter((i) => i.enabled && !i.hidden).map((item) => {
          const unlockedAt = item.unlocksAt ?? 0;
          const isProgressLocked = tasksCompleted < unlockedAt;
          if (isProgressLocked) {
            // REC 4.1: Show ALL locked items as ghost entries with progress toward unlock
            // This makes the product's feature depth visible and turns locks into reward mechanisms
            const tasksNeeded = unlockedAt - tasksCompleted;
            const progressPct = Math.min(100, Math.round((tasksCompleted / unlockedAt) * 100));
            return (
              <React.Fragment key={item.href}>
                {item.section && <SectionLabel label={item.section} />}
                <div
                  className="px-3 py-2 mx-2 rounded-lg select-none"
                  title={`Complete ${tasksNeeded} more task${tasksNeeded !== 1 ? "s" : ""} to unlock ${item.label}`}
                  style={{ cursor: "default", opacity: 0.45 }}
                >
                  <div className="flex items-center gap-3" style={{ color: "var(--bm-text4)" }}>
                    <item.icon size={15} />
                    <span className="flex-1 truncate" style={{ fontSize: 13 }}>{item.label}</span>
                    <span style={{ fontSize: 9, color: "var(--bm-text4)", whiteSpace: "nowrap" }}>
                      {tasksNeeded} left
                    </span>
                  </div>
                  {/* Progress bar toward unlock */}
                  <div style={{ height: 2, background: "var(--bm-bg4)", borderRadius: 99, marginTop: 5, marginLeft: 24, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${progressPct}%`, background: "var(--bm-text3)", borderRadius: 99, transition: "width 0.4s" }} />
                  </div>
                </div>
              </React.Fragment>
            );
          }
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const showLock = !!item.requiredPlan && !hasPlanAccess(plan, item.requiredPlan as Plan);
          return (
            <React.Fragment key={item.href}>
              {item.section && <SectionLabel label={item.section} />}
              <NavItem
                href={item.href} label={item.label} icon={item.icon as React.ElementType}
                active={active} badge={item.badge} showLock={showLock}
                showDot={item.showDot} reflectPending={reflectPending}
                unseenBadges={unseenBadges} onClick={onNavClick}
              />
            </React.Fragment>
          );
        })}

        {isAdmin && (
          <>
            <SectionLabel label="ADMIN" />
            <Link href="/admin"
              className="flex items-center justify-between gap-2 px-3 py-2.5 mx-2 rounded-lg text-sm transition-colors group"
              style={{ color: "var(--bm-text4)" }}
            >
              <div className="flex items-center gap-3"><Shield size={16} />Dashboard</div>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--bm-bg4)", color: "var(--bm-text3)" }}>Admin</span>
            </Link>
          </>
        )}
      </nav>

      <div className="shrink-0 flex flex-col gap-2 pt-2 pb-3" style={{ borderTop: "1px solid var(--bm-border)" }}>
        {canAccess("cofounderPulse", plan) && (
          <div className="px-2"><CofounderPulse /></div>
        )}
        {plan === "free" && (
          <div className="px-2"><AIUsageBadge /></div>
        )}

        <button onClick={toggle}
          className="flex items-center gap-2 px-3 py-2 mx-2 rounded-lg text-sm transition-all"
          style={{ border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text3)", cursor: "pointer", fontFamily: "inherit" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bm-bg3)"; e.currentTarget.style.color = "var(--bm-text2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--bm-text3)"; }}
        >
          {theme === "dark" ? <><Sun size={13} /><span>Light mode</span></> : <><Moon size={13} /><span>Dark mode</span></>}
        </button>

        <button onClick={() => setFounderMenuOpen((o) => !o)}
          className="flex items-center gap-2 px-3 py-2.5 mx-2 rounded-lg transition-all"
          style={{ border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text3)", cursor: "pointer", fontFamily: "inherit" }}
        >
          <Sparkles size={13} strokeWidth={1.6} style={{ color: "var(--bm-text4)", flexShrink: 0 }} />
          <span className="flex-1 text-left text-xs font-medium" style={{ color: "var(--bm-text2)" }}>Founder menu</span>
          <ChevronDown size={12} style={{ color: "var(--bm-text4)", transform: founderMenuOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }} />
        </button>

        <AnimatePresence initial={false}>
          {founderMenuOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden flex flex-col gap-2">
              {plan === "free" ? (
                <Link href="/upgrade" className="no-underline block px-2">
                  <div className="px-3 py-2.5 rounded-xl cursor-pointer" style={{ border: "1px solid var(--bm-border)", background: "var(--bm-bg3)" }}>
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-xs font-medium" style={{ color: "var(--bm-text2)" }}>Free plan</div>
                        <div className="text-[10px] mt-0.5" style={{ color: "var(--bm-text4)" }}>Unlock all features</div>
                      </div>
                      <span className="text-xs font-bold" style={{ color: "var(--bm-text2)" }}>Upgrade</span>
                    </div>
                  </div>
                </Link>
              ) : (
                <div className="px-3 py-2.5 mx-2 rounded-xl" style={{ border: "1px solid var(--bm-border)", background: "var(--bm-bg3)" }}>
                  <div className="flex items-center gap-1.5"><Sparkles size={11} style={{ color: "var(--bm-text3)" }} /><span className="text-xs font-medium" style={{ color: "var(--bm-text2)" }}>Builder plan</span></div>
                  <div className="text-[10px] mt-0.5" style={{ color: "var(--bm-text4)" }}>Unlimited · All features</div>
                </div>
              )}
              <Link href="/invite" className="flex items-center gap-2 px-3 py-2.5 mx-2 rounded-lg transition-all no-underline" style={{ border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text3)" }}>
                <Users size={13} strokeWidth={1.6} style={{ color: "var(--bm-text4)", flexShrink: 0 }} />
                <div className="flex-1">
                  <div className="text-xs font-medium leading-none" style={{ color: "var(--bm-text2)" }}>Invite a founder</div>
                  <div className="text-[9px] mt-0.5" style={{ color: "var(--bm-text4)" }}>1 month free for you both</div>
                </div>
                <ChevronRight size={11} style={{ color: "var(--bm-text4)" }} />
              </Link>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-center gap-3 px-3 pb-1">
          <Link href="/legal/terms" className="text-[10px] transition-colors hover:underline" style={{ color: "var(--bm-text4)" }}>Terms</Link>
          <span style={{ color: "var(--bm-border)" }}>·</span>
          <Link href="/legal/privacy" className="text-[10px] transition-colors hover:underline" style={{ color: "var(--bm-text4)" }}>Privacy</Link>
        </div>

        <div className="px-0"><SidebarUser onSignOut={onSignOut} /></div>
      </div>
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────
export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  async function handleSignOut() {
    const { storage } = await import("@/lib/storage");
    storage.onSignOut();
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <>
      <button onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3.5 left-3.5 z-[200] p-2 rounded-lg transition-colors"
        style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", color: "var(--bm-text2)" }}
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>

      <aside className="hidden md:flex flex-col h-full w-full relative overflow-hidden" style={{ background: "var(--bm-bg2)" }}>
        <SidebarContent onSignOut={handleSignOut} />
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-[300] flex md:hidden">
            <motion.div className="absolute inset-0"
              style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.div className="relative z-10 w-[260px] h-full flex flex-col"
              style={{ borderRight: "1px solid var(--bm-border)" }}
              initial={{ x: -260 }} animate={{ x: 0 }} exit={{ x: -260 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <SidebarContent onNavClick={() => setMobileOpen(false)} onSignOut={handleSignOut} />
            </motion.div>
            <motion.button className="absolute top-4 right-4 z-20 p-2 rounded-lg text-white"
              style={{ background: "var(--bm-bg3)" }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)} aria-label="Close menu"
            >
              <X size={16} />
            </motion.button>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
