"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Bot, FolderKanban, Gauge, LineChart, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { FEATURES } from "@/lib/features";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge, enabled: true },
  { href: "/projects", label: "Projects", icon: FolderKanban, enabled: true },
  { href: "/ai-coach", label: "BuildMini", icon: Bot, enabled: FEATURES.aiCoach },
  { href: "/reports", label: "Progress", icon: LineChart, enabled: true },
  { href: "/settings", label: "Settings", icon: Settings, enabled: true },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-full flex-col bg-black/40 p-4">
      <div className="glass-panel panel-glow mb-8 flex items-center gap-3 rounded-2xl p-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5">
          <Image src="/brand/buidmind-logo-app-icon.jpeg" width={36} height={36} alt="BuildMind" />
        </div>
        <div className="flex flex-col justify-center">
          <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-300">BUILD MIND</p>
          <h1 className="mt-1 text-xs uppercase tracking-widest text-white/60">Founder OS</h1>
        </div>
      </div>

      <nav className="space-y-1.5">
        {nav.filter((item) => item.enabled).map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition",
                active ? "text-white" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
              )}
            >
              {active ? (
                <motion.span
                  layoutId="activeNav"
                  className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-r from-indigo-500/70 to-purple-500/70"
                  transition={{ type: "spring", duration: 0.4 }}
                />
              ) : null}
              <Icon size={16} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="glass-panel panel-glow mt-auto rounded-xl p-3">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Workspace</p>
        <p className="text-sm font-semibold text-zinc-100">BuildMind</p>
      </div>
    </aside>
  );
}
