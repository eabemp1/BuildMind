"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { ensureUserProfile, getOnboardingStatus } from "@/lib/buildmind";

function formatAuthError(err: unknown): string {
  if (err instanceof TypeError && err.message.toLowerCase().includes("fetch")) {
    return "Cannot reach Supabase. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in frontend/.env.local, then restart docker compose.";
  }
  return err instanceof Error ? err.message : "Unable to login";
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const check = async () => {
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
        // no-op when unauthenticated
      }
    };
    void check();
  }, [router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError("");
      const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) throw loginError;
      if (!data.user) throw new Error("Login failed");
      await ensureUserProfile(data.user);
      const onboarded = await getOnboardingStatus(data.user.id);
      if (!onboarded) {
        router.replace("/onboarding");
        return;
      }
      router.replace("/dashboard");
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const oauth = async (provider: "google" | "github") => {
    try {
      setError("");
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/onboarding`,
        },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      setError(formatAuthError(err));
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-gray-50 p-6">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl md:grid-cols-2">
        <div className="hidden bg-slate-950 p-10 text-white md:block">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">EvolvAI Ecosystem</p>
          <h1 className="mt-6 text-4xl font-semibold">BuildMind</h1>
          <p className="mt-3 text-sm text-slate-300">Plan, execute, and ship your startup roadmap in one focused workspace.</p>
        </div>
        <div className="p-8">
          <h1 className="text-2xl font-semibold text-slate-900">Welcome Back</h1>
          <div className="mt-5 mb-5 grid gap-2">
            <Button type="button" variant="outline" onClick={() => void oauth("google")}>
              Continue with Google
            </Button>
            <Button type="button" variant="outline" onClick={() => void oauth("github")}>
              Continue with GitHub
            </Button>
          </div>
          <form className="space-y-4" onSubmit={onSubmit}>
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Continue with Email"}
            </Button>
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          </form>
          <p className="mt-5 text-sm text-slate-600">
            New to BuildMind?{" "}
            <Link href="/auth/signup" className="font-medium text-slate-900 underline">
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
