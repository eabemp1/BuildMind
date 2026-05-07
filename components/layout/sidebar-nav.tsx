/**
 * components/layout/sidebar-nav.tsx
 *
 * Pure data + small UI atoms for the sidebar, extracted from sidebar.tsx
 * to bring it below 400 lines.
 *
 * Exports:
 *   NAV                 — the navigation item config array
 *   hasPlanAccess()     — plan comparison helper
 *   SectionLabel        — section header atom
 *   SidebarLogo         — logo + streak pill
 *   NavItem             — single nav link
 *   NotifBadge          — live notification count badge
 */

"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { getUnreadCount } from "@/lib/notifications";
import { BrandMark } from "@/components/layout/logo";
import { NAV, hasPlanAccess, type NavItemConfig } from "@/lib/nav-config";
export { NAV, hasPlanAccess, type NavItemConfig };

// ── Notification badge (live unread count) ────────────────────────────────────
export function NotifBadge() {
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

// ── Section header ────────────────────────────────────────────────────────────
export function SectionLabel({ label }: { label: string }) {
  return (
    <div
      className="px-3 pt-4 pb-1 text-[9px] font-bold tracking-[0.14em] uppercase"
      style={{ color: "var(--bm-text4)" }}
    >
      {label}
    </div>
  );
}

// ── Logo block ────────────────────────────────────────────────────────────────
export function SidebarLogo({ streakDays }: { streakDays: number }) {
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
          Chief of Staff
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

// ── Single nav link ───────────────────────────────────────────────────────────
export function NavItem({
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
