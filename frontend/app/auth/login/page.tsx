"use client";

import { FormEvent, useEffect, useState } from "react";
import { z } from "zod";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { ensureUserProfile, getOnboardingStatus } from "@/lib/buildmind";
import { authSchema } from "@/lib/validation";
import { identifyUser } from "@/lib/analytics";

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
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      await ensureUserProfile(data.user);
      identifyUser(data.user.id, data.user.email);
      const onboarded = await getOnboardingStatus(data.user.id);
      router.replace(onboarded ? "/dashboard" : "/onboarding");
    };
    void check();
  }, [router, supabase.auth]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setError("");
      setNotice("");
      const values = authSchema.parse({ email, password });
      setLoading(true);
      const { data, error: loginError } = await supabase.auth.signInWithPassword(values);
      if (loginError) throw loginError;
      if (!data.user) throw new Error("Login failed");
      await ensureUserProfile(data.user);
      identifyUser(data.user.id, data.user.email);
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

  const sendReset = async () => {
    setError("");
    setNotice("");
    if (!email.trim()) {
      setError("Enter your email to reset your password.");
      return;
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    if (resetError) {
      setError(formatAuthError(resetError));
      return;
    }
    setNotice("Password reset email sent. Check your inbox.");
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
        <Image src="/brand/bui.svg" width={160} height={44} alt="BuildMind" />
        <h1 className="mt-2 text-2xl font-semibold text-zinc-100">Welcome back</h1>
        <p className="text-body mt-1">Sign in to continue building your execution roadmap.</p>

        <div className="mt-5 grid gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
            onClick={() => void oauth("google")}
          >
            <span className="mr-2 h-4 w-4" aria-hidden>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                <path d="M23.04 12.26c0-.82-.07-1.64-.22-2.44H12v4.62h6.17a5.29 5.29 0 0 1-2.29 3.47v2.87h3.7c2.17-2 3.46-4.95 3.46-8.52z" fill="#4285F4" />
                <path d="M12 24c3.12 0 5.74-1.03 7.65-2.79l-3.7-2.87c-1.03.7-2.35 1.1-3.95 1.1-3.03 0-5.6-2.05-6.52-4.8H1.62v3.02A11.99 11.99 0 0 0 12 24z" fill="#34A853" />
                <path d="M5.48 14.64a7.2 7.2 0 0 1-.38-2.28c0-.79.14-1.55.38-2.28V7.06H1.62A12 12 0 0 0 0 12.36c0 1.94.46 3.78 1.62 5.3l3.86-3.02z" fill="#FBBC05" />
                <path d="M12 4.76c1.7 0 3.23.58 4.43 1.72l3.32-3.32C17.74 1.06 15.12 0 12 0 7.39 0 3.39 2.68 1.62 7.06l3.86 3.02c.92-2.75 3.49-4.8 6.52-4.8z" fill="#EA4335" />
              </svg>
            </span>
            Continue with Google
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
            onClick={() => void oauth("github")}
          >
            <Github className="mr-2 h-4 w-4" />
            Continue with GitHub
          </Button>
        </div>

        <form className="mt-4 space-y-4" onSubmit={onSubmit}>
          <Input className="border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input
            className="border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="text-left text-xs text-zinc-400 underline"
            onClick={() => void sendReset()}
          >
            Forgot password?
          </button>
          <Button className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white" disabled={loading}>
            {loading ? "Signing in..." : "Continue with Email"}
          </Button>
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          {notice ? <p className="text-sm text-emerald-300">{notice}</p> : null}
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
