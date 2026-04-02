"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Bot, FolderKanban, Gauge, LineChart, Settings, Zap, Flame } from "lucide-react";
import { FEATURES } from "@/lib/features";

const BrandMark = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width={22} height={22} style={{ flexShrink: 0 }}>
    <defs>
      <linearGradient id="sb-nd" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#C4B5FD" /><stop offset="100%" stopColor="#7C3AED" />
      </linearGradient>
      <filter id="sb-gl">
        <feGaussianBlur stdDeviation="0.8" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
    <rect width="32" height="32" rx="7" fill="#09090B" />
    <rect width="32" height="32" rx="7" fill="none" stroke="rgba(139,92,246,0.4)" strokeWidth="0.8" />
    <circle cx="6"  cy="9"  r="1.6" fill="#4F46E5" opacity="0.75" />
    <circle cx="6"  cy="16" r="1.6" fill="#4F46E5" opacity="0.75" />
    <circle cx="6"  cy="23" r="1.6" fill="#4F46E5" opacity="0.75" />
    <circle cx="16" cy="7"  r="1.6" fill="#7C3AED" opacity="0.8" />
    <circle cx="16" cy="14" r="1.6" fill="#7C3AED" opacity="0.8" />
    <circle cx="16" cy="21" r="1.6" fill="#7C3AED" opacity="0.8" />
    <circle cx="26" cy="9"  r="1.6" fill="#A78BFA" opacity="0.75" />
    <circle cx="26" cy="16" r="1.6" fill="#A78BFA" opacity="0.75" />
    <circle cx="26" cy="23" r="1.6" fill="#A78BFA" opacity="0.75" />
    <line x1="7.6"  y1="16" x2="14.4" y2="14" stroke="#6D28D9" strokeWidth="1" opacity="0.95" />
    <line x1="17.6" y1="14" x2="24.4" y2="16" stroke="#8B5CF6" strokeWidth="1" opacity="0.95" />
    <circle cx="6"  cy="16" r="2.2" fill="url(#sb-nd)" filter="url(#sb-gl)" />
    <circle cx="16" cy="14" r="2.4" fill="#A78BFA" filter="url(#sb-gl)" />
    <circle cx="26" cy="16" r="2.2" fill="#C4B5FD" filter="url(#sb-gl)" />
  </svg>
);

const nav = [
  { href: "/today",            label: "Today",        icon: Zap,          enabled: true,                    primary: true },
  { href: "/dashboard",        label: "Overview",     icon: Gauge,        enabled: true,                    primary: false },
  { href: "/projects",         label: "Projects",     icon: FolderKanban, enabled: true,                    primary: false },
  // FIX: renamed from "AI Coach" to "AI Coach"
  { href: "/ai-coach",         label: "AI Coach",     icon: Bot,          enabled: FEATURES.aiCoach,        primary: false },
  { href: "/break-my-startup", label: "Break Startup",icon: Flame,        enabled: FEATURES.breakMyStartup, primary: false },
  { href: "/reports",          label: "Progress",     icon: LineChart,    enabled: FEATURES.analytics,      primary: false },
  { href: "/settings",         label: "Settings",     icon: Settings,     enabled: true,                    primary: false },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside style={{
      display: "flex", flexDirection: "column", height: "100%", width: "100%",
      background: "#000", borderRight: "1px solid #1c1c1c",
      padding: "14px 10px", fontFamily: "system-ui,sans-serif",
    }}>
      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 8px 18px", borderBottom: "1px solid #1c1c1c", marginBottom: 10 }}>
        <BrandMark />
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#FAFAFA", letterSpacing: "-0.01em", lineHeight: 1 }}>BuildMind</div>
          <div style={{ fontSize: 9, color: "#333", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 1 }}>Founder OS</div>
        </div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1 }}>
        {nav.filter((i) => i.enabled).map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          // Today gets special primary treatment — always stands out
          const dataTour =
            item.href === "/today"
              ? "nav-today"
              : item.href === "/ai-coach"
              ? "nav-ai-coach"
              : item.href === "/break-my-startup"
              ? "nav-break-startup"
              : undefined;

          if (item.primary) {
            return (
              <Link key={item.href} href={item.href}
                data-tour={dataTour}
                style={{
                  display: "flex", alignItems: "center", gap: 9, padding: "9px 10px",
                  borderRadius: 7, textDecoration: "none", marginBottom: 6,
                  background: active ? "rgba(139,92,246,0.2)" : "rgba(139,92,246,0.08)",
                  border: active ? "1px solid rgba(139,92,246,0.35)" : "1px solid rgba(139,92,246,0.15)",
                  color: active ? "#fff" : "#c4b5fd",
                  fontSize: 13, fontWeight: 600,
                }}>
                <Icon size={14} />
                {item.label}
                {/* Pulse dot when not on Today — nudges user toward action */}
                {!active && (
                  <motion.span
                    animate={{ opacity: [0.5, 1, 0.5], scale: [0.9, 1.1, 0.9] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: "#7c3aed", display: "block" }}
                  />
                )}
              </Link>
            );
          }

          return (
            <Link key={item.href} href={item.href}
              data-tour={dataTour}
              style={{
                position: "relative", display: "flex", alignItems: "center", gap: 9,
                padding: "8px 10px", borderRadius: 6, textDecoration: "none",
                color: active ? "#fff" : "#555",
                fontSize: 13, fontWeight: active ? 500 : 400,
                background: active ? "#141414" : "transparent",
                border: active ? "1px solid #222" : "1px solid transparent",
                transition: "color 0.15s",
              }}>
              <Icon size={14} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom action button */}
      <div style={{ borderTop: "1px solid #111", paddingTop: 12 }}>
        <Link href="/today"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "9px", borderRadius: 8, textDecoration: "none",
            background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
            color: "white", fontSize: 12, fontWeight: 600,
          }}>
          <Zap size={12} />
          Today&apos;s action
        </Link>
      </div>
    </aside>
  );
}
