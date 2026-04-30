"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, ArrowRight, Chrome, Zap, Target, Flame } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BrandMark } from "@/components/layout/logo";

// ── Value props shown on the left panel ───────────────────────────────────────
const VALUE_PROPS = [
  { icon: Zap, text: "AI-powered execution plans built for your stage" },
  { icon: Target, text: "Score your startup progress in real time" },
  { icon: Flame, text: "Stay accountable with daily streaks and check-ins" },
];

// ── SVG grid overlay ──────────────────────────────────────────────────────────
function GridOverlay() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.07]"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
    </svg>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Clear error when switching tabs
  useEffect(() => {
    setError(null);
    setSuccessMsg(null);
    setPassword("");
  }, [tab]);

  useEffect(() => {
    if (searchParams.get("error") === "auth_callback_failed") {
      setError("That sign-in link expired or was already used. Please sign in again.");
    }
  }, [searchParams]);

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (tab === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        router.replace("/today");
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding` },
        });
        if (err) throw err;
        if (data.session || data.user) {
          router.replace("/onboarding");
          return;
        }
        setSuccessMsg("Check your email to confirm your account. After confirmation, onboarding opens next.");
        setTab("signin");
      }
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleOAuth() {
    setOauthLoading(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback?next=/today` },
      });
      if (err) throw err;
    } catch (err: any) {
      setError(err?.message ?? "Google sign-in failed.");
      setOauthLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Enter your email above to reset your password.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset`,
      });
      if (err) throw err;
      setSuccessMsg("Password reset email sent. Check your inbox.");
    } catch (err: any) {
      setError(err?.message ?? "Failed to send reset email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex"
      style={{ background: "var(--bm-bg)" }}
    >
      {/* ── Left panel (desktop only) ─────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6 }}
        className="hidden lg:flex w-1/2 relative flex-col justify-between p-12 overflow-hidden"
        style={{ background: "var(--grad-primary)" }}
      >
        <GridOverlay />

        {/* Ambient blobs */}
        <div
          className="absolute top-[-80px] right-[-60px] w-72 h-72 rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute bottom-[-60px] left-[-40px] w-56 h-56 rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)",
          }}
        />

        {/* Logo */}
        <div className="relative flex items-center gap-2">
          <BrandMark size={36} href="/" />
          <span className="text-white font-semibold text-lg">BuildMind</span>
        </div>

        {/* Main copy */}
        <div className="relative flex flex-col gap-8">
          <div>
            <h2 className="text-4xl font-bold text-white tracking-tight leading-tight mb-3">
              The operating system
              <br />
              for founder execution.
            </h2>
            <p className="text-white/70 text-base leading-relaxed">
              Join founders who replaced scattered docs and missed deadlines with
              one focused system that keeps them moving.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {VALUE_PROPS.map((v, i) => {
              const Icon = v.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className="flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                    <Icon size={15} className="text-white" />
                  </div>
                  <span className="text-white/85 text-sm">{v.text}</span>
                </motion.div>
              );
            })}
          </div>
        </div>

        <p className="relative text-white/40 text-xs">
          © {new Date().getFullYear()} BuildMind. Built for founders who ship.
        </p>
      </motion.div>

      {/* ── Right panel ──────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="flex-1 flex items-center justify-center p-6"
      >
        <div className="w-full max-w-md flex flex-col gap-6">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2 mb-2">
            <BrandMark size={32} href="/" />
            <span className="font-semibold text-sm text-[var(--bm-text)]">BuildMind</span>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-[var(--bm-text)] tracking-tight">
              {tab === "signin" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="text-sm text-[var(--bm-text3)] mt-1">
              {tab === "signin"
                ? "Sign in to your BuildMind account."
                : "Start building in under 60 seconds."}
            </p>
          </div>

          {/* Tab toggle */}
          <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "signup")} variant="pill">
            <TabsList className="w-full">
              <TabsTrigger value="signin" className="flex-1">Sign In</TabsTrigger>
              <TabsTrigger value="signup" className="flex-1">Sign Up</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Success message */}
          <AnimatePresence>
            {successMsg && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-sm p-3 rounded-lg"
                style={{
                  background: "rgba(92,200,138,0.08)",
                  border: "1px solid var(--bm-accent-bd)",
                  color: "var(--bm-green)",
                }}
              >
                {successMsg}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-sm p-3 rounded-lg"
                style={{
                  background: "rgba(224,85,85,0.08)",
                  border: "1px solid rgba(224,85,85,0.22)",
                  color: "var(--bm-red)",
                }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form */}
          <form onSubmit={handleEmailAuth} className="flex flex-col gap-4">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            <Input
              label="Password"
              type={showPassword ? "text" : "password"}
              placeholder={tab === "signup" ? "Min. 8 characters" : "Your password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={tab === "signin" ? "current-password" : "new-password"}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="text-[var(--bm-text3)] hover:text-[var(--bm-text2)] transition-colors"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              }
            />

            {/* Remember me + Forgot */}
            {tab === "signin" && (
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-[var(--bm-accent)]"
                  />
                  <span className="text-xs text-[var(--bm-text3)]">Remember me</span>
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs text-[var(--bm-accent)] hover:underline transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <Button type="submit" fullWidth loading={loading} className="mt-1">
              {tab === "signin" ? "Sign In" : "Create Account"}
              {!loading && <ArrowRight size={14} />}
            </Button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: "var(--bm-border)" }} />
            <span className="text-xs text-[var(--bm-text3)]">or</span>
            <div className="flex-1 h-px" style={{ background: "var(--bm-border)" }} />
          </div>

          {/* Google OAuth */}
          <Button
            variant="secondary"
            fullWidth
            loading={oauthLoading}
            onClick={handleGoogleOAuth}
            type="button"
          >
            {!oauthLoading && (
              <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            Continue with Google
          </Button>

          <p className="text-center text-xs text-[var(--bm-text3)]">
            By continuing, you agree to our{" "}
            <a href="/legal/terms" className="underline hover:text-[var(--bm-text2)]">Terms</a>
            {" "}and{" "}
            <a href="/legal/privacy" className="underline hover:text-[var(--bm-text2)]">Privacy Policy</a>.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
