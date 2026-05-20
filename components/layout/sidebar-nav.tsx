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
      className="rounded px-1.5 py-0.5 font-mono text-[9px] font-normal"
      style={{
        background: "var(--bm-bg4)",
        color: "var(--bm-text3)",
        letterSpacing: "0.02em",
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
      className="px-5 pb-2 pt-5 font-mono text-[10px] font-normal uppercase tracking-[0.08em]"
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
      className="flex h-[72px] shrink-0 items-center gap-3 px-5"
      style={{ borderBottom: "1px solid var(--bm-border)" }}
    >
      <BrandMark size={28} href="/today" />
      <div>
        <div className="text-[14px] font-semibold" style={{ color: "var(--bm-text)", letterSpacing: "-0.025em" }}>
          BuildMind
        </div>
        <div
          className="font-mono text-[9px] font-normal uppercase tracking-[0.1em]"
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
          className="ml-auto flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] font-normal"
          style={{
            background: "var(--bm-bg2)",
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
      className="group relative mx-2 flex items-center gap-3 rounded-md px-4 py-[9px] text-[13.5px] transition-colors duration-150"
      style={
        active
          ? {
              color: "var(--bm-text)",
              background: "color-mix(in srgb, var(--bm-bg3) 64%, transparent)",
              borderLeft: "2px solid var(--bm-accent)",
              paddingLeft: "calc(1rem - 2px)",
              fontWeight: 500,
            }
          : {
              color: "var(--bm-text3)",
            }
      }
    >
      <div className="relative shrink-0">
        <Icon
          size={15}
          strokeWidth={1.7}
          className="transition-colors group-hover:text-[var(--bm-text2)]"
          style={{
            color: active ? "var(--bm-accent)" : undefined,
            opacity: active ? 0.9 : 0.42,
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

      <span className="flex-1 truncate transition-colors group-hover:text-[var(--bm-text2)]">
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
        <span className="font-mono text-[9px] opacity-40">Lock</span>
      ) : href === "/notifications" ? (
        <NotifBadge />
      ) : href === "/achievements" && (unseenBadges ?? 0) > 0 ? (
        <span
          className="rounded px-1.5 py-0.5 font-mono text-[9px] font-normal"
          style={{ background: "var(--bm-bg4)", color: "var(--bm-text2)" }}
        >
          {unseenBadges} new
        </span>
      ) : badge ? (
        <span
          className="rounded px-1.5 py-0.5 font-mono text-[9px] font-normal"
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
