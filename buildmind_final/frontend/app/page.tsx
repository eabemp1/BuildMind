"use client";
/**
 * frontend/app/page.tsx — Root page
 *
 * Logged-in users → redirect to /dashboard (existing behaviour)
 * Anonymous users → render the conversion-first LandingPage
 *
 * This replaces the old page.tsx which sent anonymous users straight
 * to a features-heavy marketing page with a "Sign up" CTA.
 * Now anonymous users land on the conversion flow immediately.
 */

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
        if (!data.user) return; // anonymous → show landing page below
        await ensureUserProfile(data.user);
        const onboarded = await getOnboardingStatus(data.user.id);
        if (!onboarded) {
          router.replace("/onboarding");
          return;
        }
        router.replace("/dashboard");
      } catch {
        // network error or missing env vars → keep landing page
      }
    };
    void check();
  }, [router]);

  // Render the new conversion landing page for anonymous visitors
  return <LandingPage />;
}
