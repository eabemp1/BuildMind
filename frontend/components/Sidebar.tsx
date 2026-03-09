"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Projects", href: "/projects" },
  { label: "Roadmaps", href: "/execution" },
  { label: "Feedback", href: "/feedback" },
  { label: "Activity", href: "/activity" },
  { label: "Notifications", href: "/notifications" },
  { label: "Profile", href: "/profile" },
  { label: "Settings", href: "/settings" }
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      <div className="border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <nav className="flex gap-2 overflow-x-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <aside className="sticky top-0 hidden h-screen w-64 flex-none border-r border-slate-200 bg-white px-4 py-6 lg:block">
        <div className="mb-8 px-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">BuildMind</p>
          <h1 className="mt-2 text-xl font-semibold text-slate-900">Startup Operating System</h1>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
