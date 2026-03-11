"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/admin-sidebar";
import AdminTopbar from "@/components/admin/admin-topbar";
import { requireAdminAccess } from "@/lib/admin";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const verifyAdminAccess = async () => {
      try {
        await requireAdminAccess();
        setChecked(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message.toLowerCase() : "";
        if (msg.includes("unauthenticated") || msg.includes("auth")) {
          router.replace("/auth/login");
          return;
        }
        router.replace("/dashboard");
      }
    };
    void verifyAdminAccess();
  }, [router]);

  if (!checked) {
    return <div className="grid min-h-screen place-items-center text-sm text-zinc-400">Checking admin access...</div>;
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-zinc-950 via-slate-950 to-black">
      <aside className="w-64 shrink-0 p-3">
        <AdminSidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col p-3 pl-0">
        <header className="glass-panel panel-glow p-4">
          <AdminTopbar />
        </header>
        <main className="flex-1 overflow-y-auto pt-6">{children}</main>
      </div>
    </div>
  );
}
