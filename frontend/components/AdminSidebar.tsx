"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin/dashboard", label: "Admin Dashboard" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/projects", label: "Projects" },
  { href: "/admin/feedback", label: "Feedback" },
  { href: "/admin/newsletter", label: "Newsletter" },
  { href: "/admin/activity", label: "Activity Logs" },
  { href: "/admin/system-settings", label: "System Settings" },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-64 flex-none border-r border-slate-200 bg-white px-4 py-6 lg:block">
      <p className="px-2 text-xs font-semibold uppercase tracking-widest text-slate-400">BuildMind Admin</p>
      <nav className="mt-5 space-y-1">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
