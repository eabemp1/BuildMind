"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    router.replace("/dashboard");
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
    <div className="grid min-h-screen place-items-center p-6">
      <div className="glass-panel panel-glow w-full max-w-md p-8">
        <h1 className="text-2xl font-semibold text-zinc-100">Reset password</h1>
        <p className="text-body mt-1">Set a new password for your account.</p>

        {!hasSession ? (
          <form className="mt-5 space-y-4" onSubmit={sendResetEmail}>
            <Input
              className="border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white" disabled={loading}>
              {loading ? "Sending..." : "Send reset link"}
            </Button>
            {error ? <p className="text-sm text-rose-400">{error}</p> : null}
            {notice ? <p className="text-sm text-emerald-300">{notice}</p> : null}
            <p className="text-xs text-zinc-500">
              You will receive an email with a secure link. Open it to set a new password.
            </p>
          </form>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          <Input
            className="border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            className="border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
            <Button className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white" disabled={loading}>
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
