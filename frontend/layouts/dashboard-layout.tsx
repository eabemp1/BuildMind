"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/sidebar";
import Topbar from "@/components/topbar";
import { createClient } from "@/lib/supabase/client";
import { ensureUserProfile, getOnboardingStatus } from "@/lib/buildmind";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const check = async () => {
      const supabase = createClient();
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        const user = data.user;
        if (!user) throw new Error("Not authenticated");
        await ensureUserProfile(user);
        const onboarded = await getOnboardingStatus(user.id);
        if (!onboarded) {
          router.replace("/onboarding");
          return;
        }
      } catch {
        router.replace("/auth/login");
        return;
      }
      setChecked(true);
    };
    void check();
  }, [router]);

  if (!checked) {
    return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading workspace...</div>;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white/95 shadow-sm">
        <Sidebar />
      </aside>
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(20,184,166,0.08),transparent_28%),radial-gradient(circle_at_85%_5%,rgba(59,130,246,0.08),transparent_25%)]" />
        <header className="glass relative z-10 border-b border-slate-200/70 px-6 py-4">
          <Topbar />
        </header>
        <main className="relative z-10 flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
