"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  Bot, FolderKanban, LineChart, Settings, Zap, Flame,
  Map, Shield, Sun, Moon, RefreshCw, Lightbulb, LayoutDashboard,
  Trophy, Bell, Users, Globe,
} from "lucide-react";
import { getUnseenCount } from "@/lib/achievements";
import { getUnreadCount } from "@/lib/notifications";
import { FEATURES } from "@/lib/features";
import { getPlan, type Plan } from "@/lib/plan";
import { useTheme } from "@/components/layout/theme-provider";

/* ── Notification badge ── */
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
    <span style={{
      fontSize: 9, padding: "2px 7px", borderRadius: 20,
      fontWeight: 700, background: "rgba(240,108,108,0.12)",
      color: "var(--bm-red)", letterSpacing: "0.04em",
    }}>
      {count}
    </span>
  );
}

/* ── Logo mark — celadon ── */
const Logo = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width={26} height={26} style={{ flexShrink: 0 }}>
    <defs>
      <linearGradient id="lg-a" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="var(--bm-accent)" stopOpacity="0.9" />
        <stop offset="100%" stopColor="var(--bm-accent2)" stopOpacity="0.7" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="8" fill="var(--bm-bg3)" />
    <rect width="32" height="32" rx="8" fill="none" stroke="var(--bm-accent-bd)" strokeWidth="1" />
    {/* nodes */}
    <circle cx="6"  cy="9"  r="1.5" fill="var(--bm-accent)" opacity="0.5" />
    <circle cx="6"  cy="16" r="1.5" fill="var(--bm-accent)" opacity="0.5" />
    <circle cx="6"  cy="23" r="1.5" fill="var(--bm-accent)" opacity="0.5" />
    <circle cx="16" cy="7"  r="1.5" fill="var(--bm-accent)" opacity="0.65" />
    <circle cx="16" cy="14" r="1.5" fill="var(--bm-accent)" opacity="0.65" />
    <circle cx="16" cy="21" r="1.5" fill="var(--bm-accent)" opacity="0.65" />
    <circle cx="26" cy="9"  r="1.5" fill="var(--bm-accent)" opacity="0.5" />
    <circle cx="26" cy="16" r="1.5" fill="var(--bm-accent)" opacity="0.5" />
    <circle cx="26" cy="23" r="1.5" fill="var(--bm-accent)" opacity="0.5" />
    {/* hero connections */}
    <line x1="7.5" y1="16" x2="14.5" y2="14" stroke="var(--bm-accent)" strokeWidth="0.8" opacity="0.8" />
    <line x1="17.5" y1="14" x2="24.5" y2="16" stroke="var(--bm-accent)" strokeWidth="0.8" opacity="0.8" />
    {/* hero nodes */}
    <circle cx="6"  cy="16" r="2.4" fill="url(#lg-a)" />
    <circle cx="16" cy="14" r="2.6" fill="var(--bm-accent)" opacity="0.9" />
    <circle cx="26" cy="16" r="2.4" fill="url(#lg-a)" />
  </svg>
);

const NAV = [
  { href: "/today",           label: "Today",          icon: Zap,            enabled: true,                     primary: true,  badge: null,       showDot: false },
  { href: "/overview",        label: "Overview",        icon: LayoutDashboard,enabled: true,                     primary: false, badge: null,       showDot: false },
  { href: "/reflect",         label: "Reflect",         icon: RefreshCw,      enabled: true,                     primary: true,  badge: null,       showDot: true  },
  { href: "/projects",        label: "Projects",        icon: FolderKanban,   enabled: true,                     primary: false, badge: null,       showDot: false },
  { href: "/ventures",        label: "Roadmap Tracks",  icon: Map,            enabled: true,                     primary: false, badge: "New",      showDot: false },
  { href: "/explore",         label: "Founder Feed",    icon: Globe,          enabled: FEATURES.publicProjects,  primary: false, badge: null,       showDot: false },
  { href: "/ai-coach",        label: "AI Coach",        icon: Bot,            enabled: FEATURES.aiCoach,         primary: false, badge: null,       showDot: false },
  { href: "/break-my-startup",label: "Break Startup",   icon: Flame,          enabled: FEATURES.breakMyStartup,  primary: false, badge: null,       showDot: false },
  { href: "/startup-kit",     label: "Startup Kit",     icon: Lightbulb,      enabled: FEATURES.startupKit,      primary: false, badge: null,       requiredPlan: "builder" as Plan, showDot: false },
  { href: "/notifications",   label: "Notifications",   icon: Bell,           enabled: FEATURES.notifications,   primary: false, badge: null,       showDot: false },
  { href: "/reports",         label: "Report",          icon: LineChart,      enabled: FEATURES.analytics,       primary: false, badge: null,       requiredPlan: "builder" as Plan, showDot: false },
  { href: "/achievements",    label: "Badges",          icon: Trophy,         enabled: true,                     primary: false, badge: null,       showDot: false },
  { href: "/invite",          label: "Invite & Earn",   icon: Users,          enabled: true,                     primary: false, badge: "Free mo",  showDot: false },
  { href: "/settings",        label: "Settings",        icon: Settings,       enabled: true,                     primary: false, badge: null,       showDot: false },
];

function hasPlanAccess(current: Plan, required: Plan): boolean {
  const order: Plan[] = ["free", "builder", "venture"];
  return order.indexOf(current) >= order.indexOf(required);
}

/* ── Section label ── */
const SectionLabel = ({ label }: { label: string }) => (
  <div style={{
    fontSize: 9, color: "var(--bm-text4)", letterSpacing: "0.12em",
    textTransform: "uppercase", padding: "14px 10px 5px",
    fontWeight: 600,
  }}>
    {label}
  </div>
);

export default function Sidebar() {
  const pathname = usePathname();
  const plan = getPlan();
  const { theme, toggle } = useTheme();
  const [isAdmin, setIsAdmin] = useState(false);
  const [reflectPending, setReflectPending] = useState(false);
  const [unseenBadges, setUnseenBadges] = useState(0);

  useEffect(() => {
    const checkPending = () => {
      try {
        setReflectPending(localStorage.getItem("bm_reflect_pending") === "true");
        setUnseenBadges(getUnseenCount());
      } catch {}
    };
    checkPending();
    window.addEventListener("storage", checkPending);
    const interval = setInterval(checkPending, 8000);
    return () => { window.removeEventListener("storage", checkPending); clearInterval(interval); };
  }, []);

  useEffect(() => {
    const check = async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const sb = createClient();
        const { data } = await sb.auth.getUser();
        const aid = process.env.NEXT_PUBLIC_ADMIN_USER_ID;
        setIsAdmin(!!aid && data.user?.id === aid);
      } catch {}
    };
    void check();
  }, []);

  return (
    <aside style={{
      display: "flex", flexDirection: "column",
      height: "100%", width: "100%",
      background: "var(--bm-bg2)",
      fontFamily: "inherit",
    }}>

      {/* Logo */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "18px 14px 16px",
        borderBottom: "1px solid var(--bm-border)",
      }}>
        <Logo />
        <div>
          <div style={{
            fontSize: 14, fontWeight: 600,
            color: "var(--bm-text)", letterSpacing: "-0.02em", lineHeight: 1,
          }}>
            BuildMind
          </div>
          <div style={{
            fontSize: 9, color: "var(--bm-text4)",
            letterSpacing: "0.07em", textTransform: "uppercase",
            marginTop: 3, lineHeight: 1,
          }}>
            One decision. Already made.
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ display: "flex", flexDirection: "column", flex: 1, overflowY: "auto", padding: "6px 8px", scrollbarWidth: "none" }}>
        <SectionLabel label="Daily" />
        {NAV.filter(i => i.enabled).map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          const showNotif = item.showDot && reflectPending && !active;
          const showLock = !!item.requiredPlan && !hasPlanAccess(plan, item.requiredPlan);

          /* section breaks */
          const sections: Record<string, string> = {
            "/projects": "Workspace",
            "/ai-coach": "AI Tools",
            "/notifications": "Account",
          };

          return (
            <React.Fragment key={item.href}>
              {sections[item.href] && <SectionLabel label={sections[item.href]} />}
              <Link
                href={item.href}
                data-tour={`nav-${item.href.replace("/", "")}`}
                style={{
                  position: "relative",
                  display: "flex", alignItems: "center",
                  gap: 8, padding: "7px 10px",
                  borderRadius: 8,
                  textDecoration: "none",
                  color: active ? "var(--bm-text)" : "var(--bm-text3)",
                  fontSize: 13,
                  fontWeight: active ? 500 : 400,
                  background: active ? "var(--bm-accent-dim)" : "transparent",
                  border: `1px solid ${active ? "var(--bm-accent-bd)" : "transparent"}`,
                  transition: "all 0.12s ease",
                  justifyContent: "space-between",
                  marginBottom: 1,
                }}
                onMouseEnter={e => {
                  if (!active) {
                    e.currentTarget.style.background = "var(--bm-bg3)";
                    e.currentTarget.style.color = "var(--bm-text2)";
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--bm-text3)";
                  }
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
                  <Icon
                    size={14}
                    strokeWidth={active ? 2 : 1.5}
                    style={{ color: active ? "var(--bm-accent)" : "inherit", flexShrink: 0 }}
                  />
                  {item.label}
                  {showNotif && (
                    <motion.span
                      initial={{ scale: 0 }} animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 18 }}
                      style={{
                        position: "absolute", top: -3, left: -3,
                        width: 6, height: 6, borderRadius: "50%",
                        background: "var(--bm-amber)",
                        boxShadow: "0 0 6px rgba(240,180,41,0.5)",
                      }}
                    />
                  )}
                </div>

                {/* Right badges */}
                {showNotif ? (
                  <span style={{ fontSize: 8, padding: "2px 5px", borderRadius: 4, fontWeight: 600, background: "rgba(240,180,41,0.1)", color: "var(--bm-amber)", letterSpacing: "0.05em" }}>
                    NOW
                  </span>
                ) : showLock ? (
                  <span style={{ fontSize: 11, opacity: 0.4 }}>🔒</span>
                ) : item.badge ? (
                  item.badge === "🔒" ? (
                    <span style={{ fontSize: 11, opacity: 0.4 }}>🔒</span>
                  ) : (
                    <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 20, fontWeight: 600, background: "var(--bm-accent-dim)", color: "var(--bm-accent)", letterSpacing: "0.04em" }}>
                      {item.badge}
                    </span>
                  )
                ) : (item.href === "/achievements" && unseenBadges > 0) ? (
                  <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, fontWeight: 700, background: "rgba(240,180,41,0.12)", color: "var(--bm-amber)", letterSpacing: "0.04em" }}>
                    {unseenBadges} new
                  </span>
                ) : item.href === "/notifications" ? (
                  <NotifBadge />
                ) : null}
              </Link>
            </React.Fragment>
          );
        })}

        {isAdmin && (
          <>
            <SectionLabel label="Admin" />
            <Link href="/my-ventures" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "7px 10px", borderRadius: 8, textDecoration: "none", color: pathname === "/my-ventures" ? "var(--bm-red)" : "var(--bm-text4)", fontSize: 13 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Map size={14} strokeWidth={1.5} />My Ventures</div>
              <span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, background: "rgba(240,108,108,0.1)", color: "var(--bm-red)" }}>Private</span>
            </Link>
            <Link href="/owner" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "7px 10px", borderRadius: 8, textDecoration: "none", color: pathname === "/owner" ? "var(--bm-amber)" : "var(--bm-text4)", fontSize: 13 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Shield size={14} strokeWidth={1.5} />Owner Panel</div>
              <span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, background: "rgba(240,180,41,0.1)", color: "var(--bm-amber)" }}>Admin</span>
            </Link>
          </>
        )}
      </nav>

      {/* Bottom */}
      <div style={{ borderTop: "1px solid var(--bm-border)", padding: "10px 8px" }}>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "7px 10px", borderRadius: 8,
            border: "1px solid var(--bm-border)",
            background: "transparent",
            color: "var(--bm-text3)", fontSize: 11,
            cursor: "pointer", width: "100%",
            fontFamily: "inherit", marginBottom: 6,
            transition: "all 0.12s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--bm-bg3)"; e.currentTarget.style.color = "var(--bm-text2)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--bm-text3)"; }}
        >
          {theme === "dark"
            ? <><Sun size={12} /><span>Light mode</span></>
            : <><Moon size={12} /><span>Dark mode</span></>
          }
        </button>

        {/* Invite nudge */}
        <Link
          href="/invite"
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 10px", borderRadius: 8,
            textDecoration: "none",
            border: "1px solid var(--bm-border)",
            background: "var(--bm-bg3)",
            marginBottom: 8, transition: "border-color 0.12s",
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "var(--bm-accent-bd)"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "var(--bm-border)"}
        >
          <Users size={12} style={{ color: "var(--bm-text4)", flexShrink: 0 }} strokeWidth={1.5} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--bm-text2)", lineHeight: 1 }}>Invite a founder</div>
            <div style={{ fontSize: 9, color: "var(--bm-text4)", marginTop: 2 }}>1 month free for you both</div>
          </div>
          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--bm-text4)" }}>→</span>
        </Link>

        {/* Plan chip */}
        {plan === "free" ? (
          <Link href="/upgrade" style={{ textDecoration: "none" }}>
            <div
              style={{
                padding: "10px 12px", borderRadius: 10,
                border: "1px solid var(--bm-accent-bd)",
                background: "var(--bm-accent-dim)",
                cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(111,207,151,0.14)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--bm-accent-dim)"; }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--bm-text3)" }}>Free plan</div>
                  <div style={{ fontSize: 10, color: "var(--bm-text4)", marginTop: 2 }}>Limited features</div>
                </div>
                <span style={{ fontSize: 11, color: "var(--bm-accent)", fontWeight: 600 }}>Upgrade →</span>
              </div>
            </div>
          </Link>
        ) : (
          <div style={{
            padding: "8px 12px", borderRadius: 8,
            border: "1px solid var(--bm-border)",
          }}>
            <div style={{ fontSize: 11, color: "var(--bm-text3)" }}>
              Builder plan
            </div>
            <div style={{ fontSize: 10, color: "var(--bm-text4)", marginTop: 1 }}>Unlimited · All features</div>
          </div>
        )}
      </div>
    </aside>
  );
}
