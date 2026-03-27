"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, FolderKanban, Gauge, LineChart, Settings } from "lucide-react";
import { FEATURES } from "@/lib/features";

const nav = [
  { href: "/dashboard", label: "Overview",  icon: Gauge,        enabled: true },
  { href: "/projects",  label: "Projects",  icon: FolderKanban, enabled: true },
  { href: "/ai-coach",  label: "BuildMini", icon: Bot,          enabled: FEATURES.aiCoach },
  { href: "/reports",   label: "Progress",  icon: LineChart,    enabled: true },
  { href: "/settings",  label: "Settings",  icon: Settings,     enabled: true },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside style={{
      display: "flex", flexDirection: "column", height: "100%", width: "100%",
      background: "#000", borderRight: "1px solid #1c1c1c",
      padding: "14px 10px", fontFamily: "system-ui,sans-serif",
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 8px 18px", borderBottom: "1px solid #1c1c1c", marginBottom: 10 }}>
        <div style={{ width: 24, height: 24, borderRadius: 5, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Image src="/brand/bui.svg" width={18} height={18} alt="BuildMind" style={{ objectFit: "contain" }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 500, color: "#fff", letterSpacing: "-0.01em" }}>BuildMind</span>
      </div>

      {/* Nav */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1 }}>
        {nav.filter((i) => i.enabled).map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}
              style={{
                display: "flex", alignItems: "center", gap: 9,
                padding: "8px 10px", borderRadius: 6, textDecoration: "none",
                color: active ? "#fff" : "#777",
                fontSize: 13, fontWeight: active ? 500 : 400,
                background: active ? "#141414" : "transparent",
                border: active ? "1px solid #222" : "1px solid transparent",
                transition: "color 0.1s",
              }}>
              <Icon size={14} style={{ color: active ? "#fff" : "#555", flexShrink: 0 }} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div style={{ borderTop: "1px solid #1c1c1c", paddingTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 8px 0" }}>
        <span style={{ fontSize: 12, color: "#555" }}>Free plan</span>
        <Link href="/upgrade" style={{ fontSize: 11, color: "#888", textDecoration: "none", background: "#111", border: "1px solid #222", borderRadius: 4, padding: "2px 8px" }}>
          Upgrade
        </Link>
      </div>
    </aside>
  );
}
