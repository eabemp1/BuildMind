"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, FolderKanban, LineChart, Settings, Flame,
  Map, Shield, RefreshCw, Lightbulb, LayoutDashboard,
  Trophy, Bell, Users, Globe, Bot, Sparkles,
  Menu, X, Sun, Moon, LogOut, ChevronRight, ChevronDown,
} from "lucide-react";
import { getUnseenCount } from "@/lib/achievements";
import { getUnreadCount } from "@/lib/notifications";
import { FEATURES } from "@/lib/features";
import { type Plan, canAccess } from "@/lib/plan";
import { usePlan } from "@/lib/usePlan";
import { useTheme } from "@/components/layout/theme-provider";
import CofounderPulse from "@/components/CofounderPulse";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/layout/logo";

// ── Notification badge (live unread count) ────────────────────────────────────
function NotifBadge() {
  const [count, setCount] = React.useState(0);
  React.useEffect(() => {
    const refresh = () => setCount(getUnreadCount());
    refresh();
    window.addEventListener("bm_notification_added", refresh);
    window.addEventListener("storage", refresh);
    const t = setInterval(refresh, 10000);
    return () => {
      window.removeEventListener("bm_notification_added", refresh);
      window.removeEventListener("storage", refresh);
      clearInterval(t);
    };
  }, []);
  if (count === 0) return null;
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
      style={{
        background: "rgba(240,108,108,0.12)",
        color: "var(--bm-red)",
        letterSpacing: "0.04em",
      }}
    >
      {count}
    </span>
  );
}

type NavItemConfig = {
  href: string;
  label: string;
  icon: React.ElementType;
  enabled: boolean;
  section: string | null;
  badge: string | null;
  showDot: boolean;
  requiredPlan?: Plan;
};

// ── Nav items (FEATURES-flagged, single source of truth) ─────────────────────
const NAV: readonly NavItemConfig[] = [
  { href: "/today",            label: "Today",           icon: Zap,             enabled: true,                     section: "DAILY",     badge: null,       showDot: false },
  { href: "/overview",         label: "Overview",        icon: LayoutDashboard, enabled: true,                     section: null,        badge: null,       showDot: false },
  { href: "/reflect",          label: "Reflect",         icon: RefreshCw,       enabled: true,                     section: null,        badge: null,       showDot: true  },
  { href: "/projects",         label: "Projects",        icon: FolderKanban,    enabled: true,                     section: "WORKSPACE", badge: null,       showDot: false },
  { href: "/ventures",         label: "Roadmap Tracks",  icon: Map,             enabled: FEATURES.ventures,        section: null,        badge: "New",      showDot: false },
  { href: "/explore",          label: "Founder Feed",    icon: Globe,           enabled: FEATURES.publicProjects,  section: null,        badge: null,       showDot: false },
  { href: "/ai-coach",         label: "AI Coach",        icon: Bot,             enabled: FEATURES.aiCoach,         section: "AI TOOLS",  badge: null,       showDot: false },
  { href: "/break-my-startup", label: "Break Startup",   icon: Flame,           enabled: FEATURES.breakMyStartup,  section: null,        badge: null,       showDot: false },
  { href: "/startup-kit",      label: "Startup Kit",     icon: Lightbulb,       enabled: FEATURES.startupKit,      section: null,        badge: null,       requiredPlan: "builder" as Plan, showDot: false },
  { href: "/notifications",    label: "Notifications",   icon: Bell,            enabled: FEATURES.notifications,   section: "ACCOUNT",   badge: null,       showDot: false },
  { href: "/reports",          label: "Reports",         icon: LineChart,       enabled: FEATURES.analytics,       section: null,        badge: null,       requiredPlan: "builder" as Plan, showDot: false },
  { href: "/achievements",     label: "Achievements",    icon: Trophy,          enabled: true,                     section: null,        badge: null,       showDot: false },
  { href: "/invite",           label: "Invite & Earn",   icon: Users,           enabled: true,                     section: null,        badge: "Free mo",  showDot: false },
  { href: "/settings",         label: "Settings",        icon: Settings,        enabled: true,                     section: null,        badge: null,       showDot: false },
] as const;

function hasPlanAccess(current: Plan, required: Plan): boolean {
  const order = ["free", "builder", "venture"] as string[];
  return order.indexOf(current) >= order.indexOf(required);
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionLabel({ label }: { label: string }) {
  return (
    <div
      className="px-3 pt-4 pb-1 text-[9px] font-bold tracking-[0.14em] uppercase"
      style={{ color: "var(--bm-text4)" }}
    >
      {label}
    </div>
  );
}

// ── Logo block (uses dashboard layout's "B" gradient box style) ───────────────
function SidebarLogo({ streakDays }: { streakDays: number }) {
  return (
    <div
      className="flex items-center gap-2.5 px-4 h-16 shrink-0"
      style={{ borderBottom: "1px solid var(--bm-border)" }}
    >
      <BrandMark size={32} href="/overview" />
      <div>
        <div className="text-sm font-semibold" style={{ color: "var(--bm-text)", letterSpacing: "-0.02em" }}>
          BuildMind
        </div>
        <div
          className="text-[9px] font-bold tracking-[0.12em] uppercase"
          style={{
            background: "linear-gradient(90deg, var(--bm-accent), var(--bm-teal))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            lineHeight: 1,
          }}
        >
          AI Founder OS
        </div>
      </div>
      {streakDays > 0 && (
        <div
          className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
          style={{
            background: "rgba(240,180,41,0.10)",
            border: "1px solid rgba(240,180,41,0.18)",
            color: "var(--bm-amber)",
          }}
        >
          🔥 {streakDays}
        </div>
      )}
    </div>
  );
}

// ── Single nav link (dashboard layout's left-border active style) ─────────────
function NavItem({
  href,
  label,
  icon: Icon,
  active,
  badge,
  showLock,
  showDot,
  reflectPending,
  unseenBadges,
  onClick,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  badge?: string | null;
  showLock?: boolean;
  showDot?: boolean;
  reflectPending?: boolean;
  unseenBadges?: number;
  onClick?: () => void;
}) {
  const showNotifDot = showDot && reflectPending && !active;

  return (
    <Link
      href={href}
      onClick={onClick}
      data-tour={`nav-${href.replace("/", "")}`}
      className="relative flex items-center gap-3 px-3 py-2.5 rounded-lg mx-2 text-sm transition-all duration-150 group"
      style={
        active
          ? {
              color: "var(--bm-accent)",
              background: "var(--bm-accent-dim, rgba(0,255,135,0.08))",
              borderLeft: "2px solid var(--bm-accent)",
              paddingLeft: "calc(0.75rem - 2px)",
              fontWeight: 500,
            }
          : {
              color: "var(--bm-text2)",
            }
      }
    >
      {/* Icon with optional reflect dot */}
      <div className="relative shrink-0">
        <Icon
          size={16}
          className="transition-colors group-hover:text-[var(--bm-text)]"
          style={{
            color: active ? "var(--bm-accent)" : undefined,
            filter: active ? "drop-shadow(0 0 4px rgba(0,255,135,0.4))" : undefined,
          }}
        />
        {showNotifDot && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 18 }}
            className="absolute -top-1 -left-1 w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--bm-amber)", boxShadow: "0 0 6px rgba(240,180,41,0.6)" }}
          />
        )}
      </div>

      <span className="truncate flex-1 transition-colors group-hover:text-[var(--bm-text)]">
        {label}
      </span>

      {/* Right-side badge / lock */}
      {showNotifDot ? (
        <span
          className="text-[8px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: "rgba(240,180,41,0.12)", color: "var(--bm-amber)" }}
        >
          NOW
        </span>
      ) : showLock ? (
        <span className="text-[10px] opacity-30">🔒</span>
      ) : href === "/notifications" ? (
        <NotifBadge />
      ) : href === "/achievements" && (unseenBadges ?? 0) > 0 ? (
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
          style={{ background: "rgba(240,180,41,0.12)", color: "var(--bm-amber)" }}
        >
          {unseenBadges} new
        </span>
      ) : badge ? (
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
          style={{
            background: "rgba(0,255,135,0.10)",
            color: "var(--bm-accent)",
            letterSpacing: "0.04em",
            border: "1px solid rgba(0,255,135,0.18)",
          }}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

// ── User card at bottom (from dashboard layout's SidebarUser) ─────────────────
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
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
        style={{ background: "var(--grad-primary, linear-gradient(135deg,#00ff87,#00e5cc))" }}
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
              ? {
                  background: "linear-gradient(90deg, var(--bm-accent), var(--bm-teal))",
                  color: "#000",
                }
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
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--bm-red)";
          e.currentTarget.style.background = "rgba(224,85,85,0.08)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--bm-text3)";
          e.currentTarget.style.background = "transparent";
        }}
      >
        <LogOut size={14} />
      </button>
    </div>
  );
}

// ── Sidebar content (used on both desktop & mobile slide-in) ──────────────────
export function SidebarContent({
  onNavClick,
  onSignOut,
}: {
  onNavClick?: () => void;
  onSignOut: () => void;
}) {
  const pathname = usePathname();
  const { plan } = usePlan();
  const { theme, toggle } = useTheme();
  const [isAdmin, setIsAdmin] = useState(false);
  const [reflectPending, setReflectPending] = useState(false);
  const [unseenBadges, setUnseenBadges] = useState(0);
  const [streakDays, setStreakDays] = useState(0);
  const [founderMenuOpen, setFounderMenuOpen] = useState(false);

  useEffect(() => {
    const checkPending = () => {
      try {
        setReflectPending(localStorage.getItem("bm_reflect_pending") === "true");
        setUnseenBadges(getUnseenCount());
        const stats = JSON.parse(localStorage.getItem("bm_achievement_stats") ?? "{}");
        setStreakDays(stats.streakDays ?? 0);
      } catch {}
    };
    checkPending();
    window.addEventListener("storage", checkPending);
    const interval = setInterval(checkPending, 8000);
    return () => {
      window.removeEventListener("storage", checkPending);
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
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute top-[-60px] right-[-60px] w-40 h-40 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(0,255,135,0.06) 0%, transparent 70%)",
          filter: "blur(30px)",
          zIndex: 0,
        }}
      />

      <SidebarLogo streakDays={streakDays} />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2" style={{ scrollbarWidth: "none" }}>
        {NAV.filter((i) => i.enabled).map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const showLock = !!item.requiredPlan && !hasPlanAccess(plan, item.requiredPlan as Plan);

          return (
            <React.Fragment key={item.href}>
              {item.section && <SectionLabel label={item.section} />}
              <NavItem
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={active}
                badge={item.badge}
                showLock={showLock}
                showDot={item.showDot}
                reflectPending={reflectPending}
                unseenBadges={unseenBadges}
                onClick={onNavClick}
              />
            </React.Fragment>
          );
        })}

        {isAdmin && (
          <>
            <SectionLabel label="ADMIN" />
            <Link
              href="/my-ventures"
              className="flex items-center justify-between gap-2 px-3 py-2.5 mx-2 rounded-lg text-sm transition-colors group"
              style={{ color: "var(--bm-text4)" }}
            >
              <div className="flex items-center gap-3">
                <Map size={16} />
                My Ventures
              </div>
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: "rgba(240,108,108,0.08)", color: "var(--bm-red)" }}
              >
                Private
              </span>
            </Link>
            <Link
              href="/owner"
              className="flex items-center justify-between gap-2 px-3 py-2.5 mx-2 rounded-lg text-sm transition-colors group"
              style={{ color: "var(--bm-text4)" }}
            >
              <div className="flex items-center gap-3">
                <Shield size={16} />
                Owner Panel
              </div>
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: "rgba(240,180,41,0.08)", color: "var(--bm-amber)" }}
              >
                Admin
              </span>
            </Link>
          </>
        )}
      </nav>

      {/* Bottom section */}
      <div className="shrink-0 flex flex-col gap-2 pt-2 pb-3" style={{ borderTop: "1px solid var(--bm-border)" }}>
        {/* CofounderPulse (feature-gated via canAccess) */}
        {canAccess("cofounderPulse", plan) && (
          <div className="px-2">
            <CofounderPulse />
          </div>
        )}

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="flex items-center gap-2 px-3 py-2 mx-2 rounded-lg text-sm transition-all"
          style={{
            border: "1px solid var(--bm-border)",
            background: "transparent",
            color: "var(--bm-text3)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bm-bg3)";
            e.currentTarget.style.color = "var(--bm-text2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--bm-text3)";
          }}
        >
          {theme === "dark" ? (
            <><Sun size={13} /><span>Light mode</span></>
          ) : (
            <><Moon size={13} /><span>Dark mode</span></>
          )}
        </button>

        <button
          onClick={() => setFounderMenuOpen((open) => !open)}
          className="flex items-center gap-2 px-3 py-2.5 mx-2 rounded-lg transition-all"
          style={{
            border: "1px solid var(--bm-border)",
            background: "transparent",
            color: "var(--bm-text3)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <Sparkles size={13} strokeWidth={1.6} style={{ color: "var(--bm-text4)", flexShrink: 0 }} />
          <span className="flex-1 text-left text-xs font-medium" style={{ color: "var(--bm-text2)" }}>Founder menu</span>
          <ChevronDown
            size={12}
            style={{
              color: "var(--bm-text4)",
              transform: founderMenuOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.15s",
            }}
          />
        </button>

        <AnimatePresence initial={false}>
          {founderMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden flex flex-col gap-2"
            >
              {plan === "free" ? (
                <Link href="/upgrade" className="no-underline block px-2">
                  <div
                    className="px-3 py-2.5 rounded-xl cursor-pointer transition-all"
                    style={{
                      border: "1px solid rgba(0,255,135,0.18)",
                      background: "linear-gradient(135deg, rgba(0,255,135,0.07) 0%, rgba(0,229,204,0.03) 100%)",
                    }}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-xs font-medium" style={{ color: "var(--bm-text2)" }}>Free plan</div>
                        <div className="text-[10px] mt-0.5" style={{ color: "var(--bm-text4)" }}>Unlock all features</div>
                      </div>
                      <span className="text-xs font-bold" style={{ color: "var(--bm-accent)" }}>Upgrade</span>
                    </div>
                  </div>
                </Link>
              ) : (
                <div className="px-3 py-2.5 mx-2 rounded-xl" style={{ border: "1px solid var(--bm-border)", background: "var(--bm-bg3)" }}>
                  <div className="flex items-center gap-1.5">
                    <Sparkles size={11} style={{ color: "var(--bm-accent)" }} />
                    <span className="text-xs font-medium" style={{ color: "var(--bm-text2)" }}>Builder plan</span>
                  </div>
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

        {/* Terms & Privacy — properly wired links */}
        <div className="flex items-center justify-center gap-3 px-3 pb-1">
          <Link
            href="/legal/terms"
            className="text-[10px] transition-colors hover:underline"
            style={{ color: "var(--bm-text4)" }}
          >
            Terms
          </Link>
          <span style={{ color: "var(--bm-border)" }}>·</span>
          <Link
            href="/legal/privacy"
            className="text-[10px] transition-colors hover:underline"
            style={{ color: "var(--bm-text4)" }}
          >
            Privacy
          </Link>
        </div>

        {/* User card */}
        <div className="px-0">
          <SidebarUser onSignOut={onSignOut} />
        </div>
      </div>
    </div>
  );
}

// ── Root export: handles desktop always-visible + mobile slide-in overlay ─────
export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <>
      {/* ── Mobile hamburger ── */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3.5 left-3.5 z-[200] p-2 rounded-lg transition-colors"
        style={{
          background: "var(--bm-bg2)",
          border: "1px solid var(--bm-border)",
          color: "var(--bm-text2)",
        }}
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>

      {/* ── Desktop sidebar (always visible, md+) ── */}
      <aside
        className="hidden md:flex flex-col h-full w-full relative overflow-hidden"
        style={{ background: "var(--bm-bg2)" }}
      >
        <SidebarContent onSignOut={handleSignOut} />
      </aside>

      {/* ── Mobile slide-in overlay ── */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-[300] flex md:hidden">
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0"
              style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />

            {/* Sidebar panel */}
            <motion.div
              className="relative z-10 w-[260px] h-full flex flex-col"
              style={{ borderRight: "1px solid var(--bm-border)" }}
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <SidebarContent
                onNavClick={() => setMobileOpen(false)}
                onSignOut={handleSignOut}
              />
            </motion.div>

            {/* Close button */}
            <motion.button
              className="absolute top-4 right-4 z-20 p-2 rounded-lg text-white"
              style={{ background: "var(--bm-bg3)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X size={16} />
            </motion.button>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
