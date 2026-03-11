"use client";

import { FormEvent, useEffect, useState } from "react";
import { z } from "zod";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { ensureUserProfile, getOnboardingStatus } from "@/lib/buildmind";
import { authSchema } from "@/lib/validation";

function formatAuthError(err: unknown): string {
  if (err instanceof TypeError && err.message.toLowerCase().includes("fetch")) {
    return "Cannot reach Supabase. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.";
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
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      await ensureUserProfile(data.user);
      const onboarded = await getOnboardingStatus(data.user.id);
      router.replace(onboarded ? "/dashboard" : "/onboarding");
    };
    void check();
  }, [router, supabase.auth]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setError("");
      const values = authSchema.parse({ email, password });
      setLoading(true);
      const { data, error: loginError } = await supabase.auth.signInWithPassword(values);
      if (loginError) throw loginError;
      if (!data.user) throw new Error("Login failed");
      await ensureUserProfile(data.user);
      const onboarded = await getOnboardingStatus(data.user.id);
      router.replace(onboarded ? "/dashboard" : "/onboarding");
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0]?.message ?? "Invalid credentials.");
      } else {
        setError(formatAuthError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const oauth = async (provider: "google" | "github") => {
    setError("");
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/onboarding` },
    });
    if (oauthError) setError(formatAuthError(oauthError));
  };

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-panel panel-glow w-full max-w-md p-8">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">BuildMind</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-100">Welcome back</h1>
        <p className="text-body mt-1">Sign in to continue building your execution roadmap.</p>

        <div className="mt-5 grid gap-2">
          <Button type="button" variant="outline" className="border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10" onClick={() => void oauth("google")}>
            Continue with Google
          </Button>
          <Button type="button" variant="outline" className="border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10" onClick={() => void oauth("github")}>
            Continue with GitHub
          </Button>
        </div>

        <form className="mt-4 space-y-4" onSubmit={onSubmit}>
          <Input className="border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input className="border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white" disabled={loading}>
            {loading ? "Signing in..." : "Continue with Email"}
          </Button>
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
        </form>

        <p className="mt-5 text-sm text-zinc-400">
          New to BuildMind?{" "}
          <Link href="/auth/signup" className="font-medium text-zinc-100 underline">
            Create account
          </Link>
        </p>
      </motion.div>
    </div>
  );
}

