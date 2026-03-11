"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const adminNavItems = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/projects", label: "Projects" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/ai-usage", label: "AI Usage" },
  { href: "/admin/notifications", label: "Notifications" },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="glass-panel panel-glow flex h-full w-full flex-col overflow-y-auto p-4">
      <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">BuildMind</p>
        <h1 className="mt-1 text-xl font-semibold text-zinc-100">Admin Console</h1>
      </div>

      <nav className="space-y-1">
        {adminNavItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block rounded-lg px-3 py-2 text-sm font-medium transition",
                active ? "bg-gradient-to-r from-indigo-500/80 to-purple-500/80 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-lg border border-amber-400/30 bg-amber-500/10 p-3">
        <p className="text-xs text-amber-200">Restricted Area</p>
        <p className="text-sm font-medium text-amber-100">Admin access only</p>
      </div>
    </aside>
  );
}
