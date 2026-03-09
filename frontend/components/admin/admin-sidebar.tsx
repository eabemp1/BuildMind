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
    <aside className="flex h-full w-full flex-col overflow-y-auto bg-white p-4">
      <div className="mb-6 px-2">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">BuildMind</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">Admin Console</h1>
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
                active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs text-amber-700">Restricted Area</p>
        <p className="text-sm font-medium text-amber-900">Admin access only</p>
      </div>
    </aside>
  );
}
