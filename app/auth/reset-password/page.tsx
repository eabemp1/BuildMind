"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandMark } from "@/components/layout/logo";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const recoveryParams = useMemo(() => {
    if (typeof window === "undefined") return new URLSearchParams();
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
    return new URLSearchParams(hash);
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const accessToken = recoveryParams.get("access_token");
        const refreshToken = recoveryParams.get("refresh_token");
        if (accessToken && refreshToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (typeof window !== "undefined") {
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
          }
        }
        const { data } = await supabase.auth.getSession();
        setHasSession(Boolean(data.session));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to verify reset link.");
      }
    };
    void init();
  }, [recoveryParams, supabase.auth]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!hasSession) {
      setError("Open the reset link from your email to set a new password.");
      return;
    }
    if (!password || !confirm) {
      setError("Enter and confirm your new password.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }
    setNotice("Password updated. Redirecting...");
    setLoading(false);
    router.replace("/today");
  };

  const sendResetEmail = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    if (!email.trim()) {
      setError("Enter your email to receive a reset link.");
      setLoading(false);
      return;
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    if (resetError) {
      setError(resetError.message);
      setLoading(false);
      return;
    }
    setNotice("Password reset email sent. Check your inbox.");
    setLoading(false);
  };

  return (
    <div
      className="relative grid min-h-screen place-items-center overflow-hidden p-6"
      style={{
        background: "#0C0C0D",
        color: "#E8E8E8",
        ["--bm-bg" as string]: "#0C0C0D",
        ["--bm-bg2" as string]: "#131315",
        ["--bm-bg3" as string]: "#1A1A1D",
        ["--bm-border" as string]: "#1E1E22",
        ["--bm-border2" as string]: "#282830",
        ["--bm-text" as string]: "#E8E8E8",
        ["--bm-text2" as string]: "#888892",
        ["--bm-text3" as string]: "#50505C",
        ["--bm-text4" as string]: "#34343E",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[-60px]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(92,200,138,0.012) 1px, transparent 1px),
            linear-gradient(90deg, rgba(92,200,138,0.012) 1px, transparent 1px)
          `,
          backgroundSize: "52px 52px",
          maskImage: "radial-gradient(ellipse 80% 70% at 50% 42%, black 12%, transparent 82%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 50% 42%, black 12%, transparent 82%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(92,200,138,0.075) 0%, transparent 65%)" }}
      />
      <div
        className="relative z-10 w-full max-w-md rounded-[18px] p-8"
        style={{
          background: "var(--bm-bg2)",
          border: "1px solid var(--bm-border2)",
          boxShadow: "0 0 0 1px rgba(92,200,138,0.045), 0 24px 64px rgba(0,0,0,0.46)",
        }}
      >
        <div className="mb-6 flex items-center gap-2.5">
          <BrandMark size={32} href="/" />
          <span className="text-sm font-semibold tracking-[-0.01em] text-[var(--bm-text)]">BuildMind</span>
        </div>
        <h1 className="font-display text-3xl italic leading-tight text-[var(--bm-text)]">Reset password</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--bm-text2)]">Set a new password for your account.</p>

        {!hasSession ? (
          <form className="mt-5 space-y-4" onSubmit={sendResetEmail}>
            <Input
              className="border-[var(--bm-border2)] bg-black/20 bm-text placeholder:text-zinc-500"
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button className="w-full" disabled={loading}>
              {loading ? "Sending..." : "Send reset link"}
            </Button>
            {error ? <p className="text-sm text-rose-400">{error}</p> : null}
            {notice ? <p className="text-sm text-emerald-300">{notice}</p> : null}
            <p className="text-xs bm-text3">
              You will receive an email with a secure link. Open it to set a new password.
            </p>
          </form>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          <Input
            className="border-[var(--bm-border2)] bg-black/20 bm-text placeholder:text-zinc-500"
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            className="border-[var(--bm-border2)] bg-black/20 bm-text placeholder:text-zinc-500"
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
            <Button className="w-full" disabled={loading}>
              {loading ? "Updating..." : "Update password"}
            </Button>
            {error ? <p className="text-sm text-rose-400">{error}</p> : null}
            {notice ? <p className="text-sm text-emerald-300">{notice}</p> : null}
          </form>
        )}
      </div>
    </div>
  );
}
