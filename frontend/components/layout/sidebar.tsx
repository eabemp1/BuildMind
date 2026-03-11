"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Bell, Bot, Compass, FileText, FolderKanban, Gauge, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/ai-coach", label: "BuildMini", icon: Bot },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="glass-panel panel-glow flex h-full w-full flex-col border-r border-white/10 p-4">
      <div className="mb-8 rounded-xl bg-gradient-to-r from-indigo-500/20 to-purple-500/20 p-4">
        <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">BuildMind</p>
        <h1 className="mt-1 text-xl font-semibold text-zinc-100">Founder OS</h1>
      </div>

      <nav className="space-y-1.5">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
                active ? "text-white" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
              )}
            >
              {active ? (
                <motion.span
                  layoutId="activeNav"
                  className="absolute inset-0 -z-10 rounded-lg bg-gradient-to-r from-indigo-500/70 to-purple-500/70"
                  transition={{ type: "spring", duration: 0.4 }}
                />
              ) : null}
              <Icon size={16} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-lg border border-white/10 bg-black/20 p-3">
        <p className="text-xs text-zinc-400">Workspace</p>
        <p className="text-sm font-semibold text-zinc-100">BuildMind</p>
      </div>
    </aside>
  );
}
