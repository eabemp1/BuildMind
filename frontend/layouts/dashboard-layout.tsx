"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/app-shell";
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
    return <div className="grid min-h-screen place-items-center text-sm text-zinc-400">Loading workspace...</div>;
  }

  return <AppShell>{children}</AppShell>;
}
