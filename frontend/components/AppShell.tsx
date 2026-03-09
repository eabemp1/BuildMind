"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  if (isAdmin) {
    return (
      <div className="flex min-h-screen bg-slate-50">
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="max-app w-full flex-1 py-8">{children}</main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="max-app w-full flex-1 py-8">{children}</main>
      </div>
    </div>
  );
}
