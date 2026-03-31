"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ensureUserProfile } from "@/lib/buildmind";
import { identifyUser, trackEvent } from "@/lib/analytics";
import { motion } from "framer-motion";
import { BrandMark } from "@/components/layout/logo";
import { Input } from "@/components/ui/input";

function formatAuthError(err: unknown): string {
  if (err instanceof Error && err.message.toLowerCase().includes("email not confirmed"))
    return "Check your email and confirm your account before logging in.";
  if (err instanceof TypeError && err.message.toLowerCase().includes("fetch"))
    return "Cannot reach the server. Check your connection.";
  return err instanceof Error ? err.message : "Unable to sign in";
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
      if (data.user) router.replace("/today");
    };
    void check();
  }, [router, supabase.auth]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) { setError("Enter your email and password."); return; }
    try {
      setError(""); setLoading(true);
      const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) throw loginError;
      if (!data.user) throw new Error("Sign in failed");
      await ensureUserProfile(data.user);
      identifyUser(data.user.id, data.user.email);
      trackEvent("user_signed_in");
      router.replace("/today");
    } catch (err) {
      setError(formatAuthError(err));
    } finally { setLoading(false); }
  };

  const oauth = async (provider: "google" | "github") => {
    setError("");
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/today` },
    });
    if (e) setError(formatAuthError(e));
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 py-10 overflow-x-hidden"
      style={{ fontFamily: "system-ui,sans-serif" }}>

      {/* Logo */}
      <div className="flex items-center gap-2 mb-8">
        <BrandMark size={24} href="/" />
        <span className="text-[14px] font-medium text-[#fafafa]">BuildMind</span>
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="w-full max-w-sm border border-[#1c1c1c] rounded-xl overflow-hidden">

        {/* Card header */}
        <div className="px-5 py-4 border-b border-[#1c1c1c] bg-[#080808]">
          <div className="text-[15px] font-medium text-white mb-0.5 tracking-tight">Welcome back</div>
          <div className="text-[12px] text-[#555]">Sign in to continue building</div>
        </div>

        {/* Card body */}
        <div className="px-5 py-5 bg-black space-y-3">

          {/* OAuth */}
          <div className="space-y-2">
            <button onClick={() => void oauth("google")}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#0a0a0a] border border-[#222] text-[#d4d4d4] text-[13px] rounded-lg cursor-pointer transition-colors hover:border-[#333]"
              style={{ fontFamily: "inherit" }}>
              <svg width="15" height="15" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
            <button onClick={() => void oauth("github")}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#0a0a0a] border border-[#222] text-[#d4d4d4] text-[13px] rounded-lg cursor-pointer transition-colors hover:border-[#333]"
              style={{ fontFamily: "inherit" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="#d4d4d4">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
              </svg>
              Continue with GitHub
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#1c1c1c]" />
            <span className="text-[11px] text-[#444]">or</span>
            <div className="flex-1 h-px bg-[#1c1c1c]" />
          </div>

          {/* Form */}
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
            <div>
              <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1.5">Email</div>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                className="border-[#222] bg-[#0a0a0a] text-[#d4d4d4] placeholder:text-[#666]"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[10px] text-[#555] uppercase tracking-wider">Password</div>
                <Link href="/auth/reset-password" className="text-[10px] text-[#555] no-underline hover:text-[#888] transition-colors">Forgot?</Link>
              </div>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="border-[#222] bg-[#0a0a0a] text-[#d4d4d4] placeholder:text-[#666]"
              />
            </div>

            {error && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="text-[12px] text-red-400 leading-relaxed">
                {error}
              </motion.div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3 text-[13px] font-medium rounded-lg border-none cursor-pointer transition-colors"
              style={{ background: loading ? "#222" : "#fff", color: loading ? "#555" : "#000", cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="text-center text-[12px] text-[#555]">
            New to BuildMind?{" "}
            <Link href="/auth/signup" className="text-[#888] no-underline hover:text-white transition-colors">Create account</Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
