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
    return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Checking admin access...</div>;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white">
        <AdminSidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-6 py-4">
          <AdminTopbar />
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
