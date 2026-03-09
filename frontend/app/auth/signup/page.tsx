"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { ensureUserProfile } from "@/lib/buildmind";

function formatAuthError(err: unknown): string {
  if (err instanceof Error && err.message.toLowerCase().includes("email not confirmed")) {
    return "Account created. Please check your email and confirm your account before logging in.";
  }
  if (err instanceof TypeError && err.message.toLowerCase().includes("fetch")) {
    return "Cannot reach Supabase. Set real NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in frontend/.env.local, then restart docker compose.";
  }
  return err instanceof Error ? err.message : "Unable to create account";
}

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
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
      setNotice("");
      const { data: signupData, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) throw signUpError;
      if (!signupData.user) throw new Error("Signup failed");
      if (!signupData.session) {
        setNotice("Account created. Check your email for the confirmation link, then log in.");
        return;
      }
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) throw loginError;
      await ensureUserProfile({ id: signupData.user.id, email: signupData.user.email });
      router.replace("/onboarding");
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const oauth = async (provider: "google" | "github") => {
    try {
      setError("");
      setNotice("");
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
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-semibold text-slate-900">Create your BuildMind account</h1>
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
            {loading ? "Creating account..." : "Continue with Email"}
          </Button>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
        </form>
        <p className="mt-5 text-sm text-slate-600">
          Already have an account?{" "}
          <Link href="/auth/login" className="font-medium text-slate-900 underline">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
