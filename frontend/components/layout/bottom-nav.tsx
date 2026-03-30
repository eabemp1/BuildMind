"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, FolderKanban, Gauge, Settings, Zap } from "lucide-react";

const nav = [
  { href: "/today",     label: "Today",    icon: Zap },
  { href: "/dashboard", label: "Overview", icon: Gauge },
  { href: "/projects",  label: "Projects", icon: FolderKanban },
  { href: "/ai-coach",  label: "Coach",    icon: Bot },
  { href: "/settings",  label: "Settings", icon: Settings },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav style={{
      display: "flex",
      background: "#000",
      borderTop: "1px solid #1c1c1c",
      padding: "6px 0 env(safe-area-inset-bottom,6px)",
    }}>
      {nav.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            padding: "6px 0",
            textDecoration: "none",
            color: active ? "#fff" : "#444",
            fontSize: 10,
            fontFamily: "system-ui,sans-serif",
            transition: "color .15s",
          }}>
            <Icon size={20} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
