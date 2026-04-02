"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ensureUserProfile, getOnboardingStatus } from "@/lib/buildmind";
import LandingPage from "./landing/page";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const check = async () => {
      const supabase = createClient();
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return; // anonymous → show landing
        await ensureUserProfile(data.user);
        const onboarded = await getOnboardingStatus(data.user.id);
        if (!onboarded) { router.replace("/onboarding"); return; }
        router.replace("/today"); // ← execution engine is home
      } catch { /* network error → keep landing */ }
    };
    void check();
  }, [router]);

  return <LandingPage />;
}
