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
        background: "var(--bm-bg4)",
        color: "var(--bm-text2)",
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
            color: "var(--bm-text4)",
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
            background: "var(--bm-bg3)",
            border: "1px solid var(--bm-border)",
            color: "var(--bm-text3)",
          }}
        >
          {streakDays}d
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
              color: "var(--bm-text)",
              background: "var(--bm-bg3)",
              borderLeft: "2px solid var(--bm-text3)",
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
            color: active ? "var(--bm-text)" : undefined,
          }}
        />
        {showNotifDot && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 18 }}
            className="absolute -top-1 -left-1 w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--bm-text3)" }}
          />
        )}
      </div>

      <span
        className="truncate flex-1 transition-colors group-hover:text-[var(--bm-text)]"
        style={{
          fontSize: 11,
          color: active ? "var(--bm-text)" : "var(--bm-text4)",
          fontWeight: active ? 600 : 400,
        }}
      >
        {label}
      </span>

      {showNotifDot ? (
        <span
          className="text-[8px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: "var(--bm-bg4)", color: "var(--bm-text2)" }}
        >
          NOW
        </span>
      ) : showLock ? (
        <span className="text-[9px] opacity-40">Lock</span>
      ) : href === "/notifications" ? (
        <NotifBadge />
      ) : href === "/achievements" && (unseenBadges ?? 0) > 0 ? (
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
          style={{ background: "var(--bm-bg4)", color: "var(--bm-text2)" }}
        >
          {unseenBadges} new
        </span>
      ) : badge ? (
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
          style={{
            background: "var(--bm-bg4)",
            color: "var(--bm-text2)",
            letterSpacing: "0.04em",
            border: "1px solid var(--bm-border)",
          }}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
