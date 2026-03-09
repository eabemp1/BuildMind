"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ensureUserProfile, getOnboardingStatus } from "@/lib/buildmind";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const check = async () => {
      const supabase = createClient();
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
        await ensureUserProfile(data.user);
        const onboarded = await getOnboardingStatus(data.user.id);
        if (!onboarded) {
          router.replace("/onboarding");
          return;
        }
        router.replace("/dashboard");
      } catch {
        // keep landing page for anonymous users
      }
    };
    void check();
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center bg-gray-50 p-6">
      <section className="w-full max-w-5xl rounded-3xl border border-slate-200 bg-white p-8 shadow-xl md:p-12">
        <p className="text-xs uppercase tracking-[0.25em] text-slate-400">EvolvAI OS</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">BuildMind</h1>
        <p className="mt-4 max-w-2xl text-base text-slate-600">
          Startup operating system for founders. Move from idea to roadmap, milestones, and execution in a single SaaS workflow.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/auth/signup" className="inline-flex h-11 items-center rounded-lg bg-slate-900 px-5 text-sm font-medium text-white hover:bg-slate-800">
            Start Free
          </Link>
          <Link href="/auth/login" className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Login
          </Link>
        </div>
      </section>
    </main>
  );
}
