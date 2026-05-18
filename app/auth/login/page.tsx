"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandMark } from "@/components/layout/logo";

// ── Inline SVG icons ──────────────────────────────────────────────────────────

function GoogleSVG() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function AppleSVG() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.14-2.18 1.27-2.16 3.8.03 3.02 2.65 4.03 2.68 4.04l-.07.28zM13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  );
}

function DiscordSVG() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="#7289DA">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
    </svg>
  );
}

function ShieldSVG() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}

function LockSVG() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

function EyeOffBadgeSVG() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

// ── Brain canvas ───────────────────────────────────────────────────────────────

function BrainCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // 5-node neural graph: 4 outer + 1 centre
    const nodes = [
      { cx: 0, cy: -28 },
      { cx: 28, cy: 0 },
      { cx: 0, cy: 28 },
      { cx: -28, cy: 0 },
      { cx: 0, cy: 0 }, // centre
    ];
    // All outer nodes connect to centre
    const edges = [[0, 4], [1, 4], [2, 4], [3, 4]];

    let raf: number;
    let t = 0;

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;
      ctx.clearRect(0, 0, W, H);
      t += 0.016;

      // Edges
      edges.forEach(([a, b], i) => {
        const ax = cx + nodes[a].cx;
        const ay = cy + nodes[a].cy;
        const bx = cx + nodes[b].cx;
        const by = cy + nodes[b].cy;

        const grad = ctx.createLinearGradient(ax, ay, bx, by);
        grad.addColorStop(0, "rgba(92,200,138,0.25)");
        grad.addColorStop(1, "rgba(74,184,176,0.08)");
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Travelling signal dot
        const progress = (t * 0.4 + i * 0.33) % 1;
        const px = ax + (bx - ax) * progress;
        const py = ay + (by - ay) * progress;
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(92,200,138,0.75)";
        ctx.fill();
      });

      // Nodes
      nodes.forEach((n, i) => {
        const nx = cx + n.cx;
        const ny = cy + n.cy;
        const isCentre = i === 4;

        // Glow
        const glow = ctx.createRadialGradient(nx, ny, 0, nx, ny, 22);
        glow.addColorStop(0, "rgba(92,200,138,0.12)");
        glow.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(nx, ny, 22, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Pulse ring
        const pulsePhase = (t % 1.8) / 1.8;
        const pr = 5 + pulsePhase * 16;
        const pa = (1 - pulsePhase) * 0.4;
        ctx.beginPath();
        ctx.arc(nx, ny, pr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(92,200,138,${pa.toFixed(2)})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Node fill
        ctx.beginPath();
        ctx.arc(nx, ny, 5, 0, Math.PI * 2);
        ctx.fillStyle = isCentre ? "rgba(92,200,138,0.9)" : "rgba(92,200,138,0.55)";
        ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
  );
}

// ── Animated Wordmark ──────────────────────────────────────────────────────────

function AnimatedWordmark() {
  const [mindLetters, setMindLetters] = useState<string[]>([]);

  useEffect(() => {
    "Mind".split("").forEach((ch, i) => {
      setTimeout(() => {
        setMindLetters((prev) => [...prev, ch]);
      }, 800 + i * 110);
    });
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
      <span
        style={{
          fontFamily: "'DM Serif Display', serif",
          fontStyle: "italic",
          fontSize: "1.8rem",
          background: "linear-gradient(135deg,#6EDA9C,#4AB8B0)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          display: "inline-block",
          animation: "build-reveal 2s cubic-bezier(.16,1,.3,1) .3s both",
        }}
      >
        Build
      </span>
      <span
        style={{
          fontFamily: "'Geist Mono', monospace",
          fontSize: "1.8rem",
          color: "var(--bm-text, #E8E8EA)",
          display: "inline-flex",
          alignItems: "baseline",
        }}
      >
        {mindLetters.map((ch, i) => (
          <span
            key={i}
            style={{
              display: "inline-block",
              animation: "letter-drop .42s cubic-bezier(.34,1.56,.64,1) both",
            }}
          >
            {ch}
          </span>
        ))}
        <span
          style={{
            display: "inline-block",
            width: 2.5,
            height: "1.5rem",
            background: "var(--bm-accent, #5CC88A)",
            marginLeft: 2,
            verticalAlign: "middle",
            animation: "blink 1.1s step-end infinite",
          }}
        />
      </span>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  dot: string;
  value: string;
  sub: string;
  style: React.CSSProperties;
  animDuration: string;
  animDelay: string;
}

function StatCard({ label, dot, value, sub, style, animDuration, animDelay }: StatCardProps) {
  return (
    <div
      className="absolute rounded-xl px-3.5 py-2.5 whitespace-nowrap backdrop-blur-sm"
      style={{
        ...style,
        background: "rgba(10,11,14,.85)",
        border: "1px solid rgba(255,255,255,.045)",
        boxShadow: "0 2px 16px rgba(0,0,0,.4)",
        animation: `float ${animDuration} ease-in-out infinite, fade-in .5s ${animDelay} ease forwards`,
        opacity: 0,
        zIndex: 0,
      }}
    >
      <div style={{ position: "absolute", top: 0, left: "12%", right: "12%", height: 1,
        background: "linear-gradient(90deg,transparent,rgba(92,200,138,.2),transparent)" }} />
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em",
        color: "var(--bm-text3, #44445A)", marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ width: 4, height: 4, borderRadius: "50%", background: dot,
          boxShadow: `0 0 5px ${dot}`, flexShrink: 0, display: "inline-block" }} />
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: "var(--bm-text, #E8E8EA)",
        letterSpacing: "-.03em", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: "var(--bm-text3, #44445A)", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

// ── Left Panel ────────────────────────────────────────────────────────────────

function LeftPanel() {
  const orbitDots = [
    { orbit: 80,  dur: "10s", dir: "orbit-cw",  delay: "0s",   color: "#5CC88A" },
    { orbit: 134, dur: "16s", dir: "orbit-ccw", delay: "-3s",  color: "#E8A020" },
    { orbit: 194, dur: "22s", dir: "orbit-cw",  delay: "-6s",  color: "#4AB8B0" },
    { orbit: 240, dur: "28s", dir: "orbit-ccw", delay: "-10s", color: "#9B7FE8" },
    { orbit: 80,  dur: "10s", dir: "orbit-cw",  delay: "-5s",  color: "#5CC88A" },
    { orbit: 134, dur: "16s", dir: "orbit-cw",  delay: "-8s",  color: "#4AB8B0" },
    { orbit: 194, dur: "22s", dir: "orbit-ccw", delay: "-14s", color: "#E8A020" },
    { orbit: 240, dur: "28s", dir: "orbit-cw",  delay: "-20s", color: "#5CC88A" },
  ] as const;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.7 }}
      className="hidden lg:flex w-[52%] relative flex-col justify-between p-12 overflow-hidden"
      style={{ background: "#07090A", minHeight: "100vh" }}
    >
      {/* Dot grid */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: "radial-gradient(rgba(92,200,138,0.18) 1px, transparent 1px)",
        backgroundSize: "38px 38px",
        maskImage: "radial-gradient(ellipse 70% 65% at 50% 38%, black 20%, transparent 80%)",
      }} />

      {/* Centre glow */}
      <div className="absolute pointer-events-none" style={{
        top: "38%", left: "50%",
        width: 560, height: 560,
        background: "radial-gradient(circle, rgba(92,200,138,0.09) 0%, rgba(74,184,176,0.04) 40%, transparent 65%)",
        borderRadius: "50%",
        animation: "breathe 5.5s ease-in-out infinite",
        transform: "translate(-50%,-50%)",
      }} />

      {/* Orbit rings */}
      {([160, 268, 388, 480] as const).map((size, i) => (
        <div key={size} className="absolute pointer-events-none" style={{
          width: size, height: size,
          top: "38%", left: "50%",
          transform: "translate(-50%,-50%)",
          border: `1px solid rgba(92,200,138,${([0.1, 0.07, 0.05, 0.03] as const)[i]})`,
          borderRadius: "50%",
        }} />
      ))}

      {/* Spinning arcs */}
      {([
        { size: 268, dur: "12s", dir: "orbit-cw",  color: "rgba(92,200,138,0.18)" },
        { size: 388, dur: "20s", dir: "orbit-ccw", color: "rgba(74,184,176,0.14)" },
        { size: 160, dur: "8s",  dir: "orbit-cw",  color: "rgba(155,127,232,0.12)" },
      ] as const).map((arc, i) => (
        <div key={i} className="absolute pointer-events-none" style={{
          width: arc.size, height: arc.size,
          top: "38%", left: "50%",
          transform: "translate(-50%,-50%)",
          borderRadius: "50%",
          border: "1.5px solid transparent",
          borderTopColor: arc.color,
          animation: `${arc.dir} ${arc.dur} linear infinite`,
        }} />
      ))}

      {/* Orbiting dots */}
      {orbitDots.map((dot, i) => (
        <div key={i} className="absolute pointer-events-none" style={{
          width: dot.orbit * 2, height: dot.orbit * 2,
          top: "38%", left: "50%",
          transform: "translate(-50%,-50%)",
          animation: `${dot.dir} ${dot.dur} linear ${dot.delay} infinite`,
        }}>
          <div style={{
            position: "absolute", top: 0, left: "50%",
            transform: "translate(-50%,-50%)",
            width: 5, height: 5,
            borderRadius: "50%",
            background: dot.color,
            boxShadow: `0 0 6px ${dot.color}`,
            opacity: 0.8,
          }} />
        </div>
      ))}

      {/* Brain canvas — centred at 38% */}
      <div className="absolute pointer-events-none" style={{
        top: "38%", left: "50%",
        transform: "translate(-50%,-50%)",
        width: 130, height: 130,
        animation: "brain-glow 4s ease-in-out infinite",
      }}>
        <BrainCanvas />
      </div>

      {/* Scan line */}
      <div className="absolute left-0 right-0 pointer-events-none" style={{
        height: 1,
        background: "linear-gradient(90deg,transparent,rgba(92,200,138,0.35),transparent)",
        animation: "scan 6s ease-in-out infinite",
      }} />

      {/* Brand — top-left */}
      <div className="absolute top-6 left-6 flex items-center gap-2 z-20">
        <BrandMark size={30} href="/" />
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--bm-text, #E8E8EA)" }}>
          BuildMind
        </span>
      </div>

      {/* Bottom signature block */}
      <div className="relative z-10 flex flex-col items-center gap-4 pb-6">
        <p style={{
          fontFamily: "'DM Serif Display', serif",
          fontStyle: "italic",
          color: "var(--bm-text3, #44445A)",
          fontSize: "clamp(.95rem,1.3vw,1.2rem)",
        }}>
          the next move, already decided
        </p>

        {/* LIVE pill */}
        <div style={{
          display: "flex", alignItems: "center", gap: 7,
          background: "rgba(92,200,138,.05)",
          border: "1px solid rgba(92,200,138,.15)",
          borderRadius: 999,
          padding: "5px 14px",
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: "50%",
            background: "#5CC88A", display: "inline-block",
            animation: "pulse 1.8s ease-in-out infinite",
          }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(92,200,138,.82)",
            letterSpacing: ".09em", textTransform: "uppercase" }}>Live</span>
        </div>

        {/* Status pills */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {(["Reflexion Loop", "Momentum Engine", "YC Critic"] as const).map((label, i) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 999, padding: "4px 10px",
              fontSize: 10, fontWeight: 600,
              color: "var(--bm-text3, #44445A)", letterSpacing: ".05em",
            }}>
              <span style={{
                width: 4, height: 4, borderRadius: "50%", display: "inline-block",
                background: (["#5CC88A", "#4AB8B0", "#9B7FE8"] as const)[i],
              }} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ── Main login content ────────────────────────────────────────────────────────

function LoginContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const supabase     = createClient();

  const [tab,          setTab         ] = useState<"signin" | "signup">("signin");
  const [email,        setEmail       ] = useState("");
  const [password,     setPassword    ] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe,   setRememberMe  ] = useState(false);
  const [loading,      setLoading     ] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error,        setError       ] = useState<string | null>(null);
  const [successMsg,   setSuccessMsg  ] = useState<string | null>(null);

  useEffect(() => { setError(null); setSuccessMsg(null); setPassword(""); }, [tab]);

  useEffect(() => {
    if (searchParams.get("error") === "auth_callback_failed") {
      setError("That sign-in link expired or was already used. Please sign in again.");
    }
  }, [searchParams]);

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSuccessMsg(null); setLoading(true);
    try {
      if (tab === "signin") {
        const devAuth = await fetch("/api/dev-auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        }).catch(() => null);
        if (devAuth?.ok) {
          localStorage.setItem("bm_dev_auth", "1");
          localStorage.setItem("bm_dev_email", email.trim().toLowerCase());
          router.replace("/onboarding");
          return;
        }
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        router.replace("/today");
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding` },
        });
        if (err) throw err;
        if (data.session || data.user) { router.replace("/onboarding"); return; }
        setSuccessMsg("Check your email to confirm your account.");
        setTab("signin");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleOAuth() {
    setOauthLoading(true); setError(null);
    try {
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback?next=/today` },
      });
      if (err) throw err;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
      setOauthLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email) { setError("Enter your email above to reset your password."); return; }
    setLoading(true); setError(null);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset`,
      });
      if (err) throw err;
      setSuccessMsg("Password reset email sent. Check your inbox.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send reset email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex overflow-hidden" style={{ background: "#06070A" }}>
      <LeftPanel />

      {/* Vertical divider */}
      <div
        className="hidden lg:block w-px self-stretch flex-shrink-0"
        style={{ background: "linear-gradient(to bottom, transparent, rgba(92,200,138,0.12) 30%, rgba(92,200,138,0.12) 70%, transparent)" }}
      />

      {/* Right panel */}
      <div
        className="flex-1 flex items-center justify-center p-8 relative overflow-hidden min-h-screen"
        style={{ background: "var(--bm-bg, #06070A)" }}
      >
        {/* Floating stat cards — overflow:hidden on parent prevents bleed */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
          <StatCard style={{ top: "8%", right: "6%" }}   label="Momentum"   dot="#5CC88A" value="81"  sub="↑ +7 today"      animDuration="7s"   animDelay=".2s" />
          <StatCard style={{ bottom: "12%", left: "4%" }} label="Streak"     dot="#E8A020" value="14d" sub="Personal best"    animDuration="8.5s" animDelay=".6s" />
          <StatCard style={{ bottom: "10%", right: "5%" }} label="Confidence" dot="#4AB8B0" value="4/5" sub="Reflexion done"  animDuration="6.5s" animDelay="1s"  />
        </div>

        {/* Auth card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="w-full flex flex-col relative"
          style={{ maxWidth: 360, zIndex: 10 }}
        >
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2 mb-6">
            <BrandMark size={30} href="/" />
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--bm-text, #E8E8EA)" }}>
              BuildMind
            </span>
          </div>

          {/* Animated wordmark — overflow:hidden clips letter-drop animation */}
          <div style={{ overflow: "hidden", marginBottom: 18, lineHeight: 1.1 }}>
            <AnimatedWordmark />
          </div>

          {/* Card header */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3.5">
              <div style={{
                width: 24, height: 24,
                background: "rgba(255,255,255,.03)",
                border: "1px solid rgba(92,200,138,.16)",
                borderRadius: 7, display: "flex", alignItems: "center",
                justifyContent: "center", boxShadow: "0 0 8px rgba(92,200,138,.1)",
              }}>
                <svg viewBox="0 0 64 64" width="12" height="12" fill="none">
                  <circle cx="14" cy="32" r="3.5" fill="#A8D5BA"/>
                  <circle cx="32" cy="27" r="4"   fill="#A8D5BA"/>
                  <circle cx="50" cy="32" r="3.5" fill="#A8D5BA"/>
                  <line x1="17.5" y1="32" x2="28.5" y2="27" stroke="#A8D5BA" strokeWidth="1.4" opacity=".9"/>
                  <line x1="35.5" y1="27" x2="46.5" y2="32" stroke="#A8D5BA" strokeWidth="1.4" opacity=".9"/>
                </svg>
              </div>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".1em",
                textTransform: "uppercase", color: "var(--bm-text3, #44445A)" }}>
                Secure access
              </span>
            </div>

            <h1 style={{
              fontFamily: "'DM Serif Display', serif", fontStyle: "italic",
              fontSize: 28, color: "var(--bm-text, #E8E8EA)",
              letterSpacing: "-.02em", lineHeight: 1.1, marginBottom: 6,
            }}>
              {tab === "signin" ? "Welcome back" : "Create your account"}
            </h1>
            <p style={{ fontSize: 12.5, color: "var(--bm-text3, #44445A)", fontWeight: 500, lineHeight: 1.6 }}>
              {tab === "signin" ? "Sign in to your BuildMind workspace." : "Start building in under 60 seconds."}
            </p>
          </div>

          {/* Tabs */}
          <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "signup")} variant="pill">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="signin" className="flex-1">Sign In</TabsTrigger>
              <TabsTrigger value="signup" className="flex-1">Sign Up</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Messages */}
          <AnimatePresence>
            {successMsg && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="text-sm p-3 rounded-lg mb-4"
                style={{ background: "rgba(92,200,138,0.08)", border: "1px solid var(--bm-accent-bd)", color: "var(--bm-green)" }}>
                {successMsg}
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="text-sm p-3 rounded-lg mb-4"
                style={{ background: "rgba(224,85,85,0.08)", border: "1px solid rgba(224,85,85,0.22)", color: "var(--bm-red)" }}>
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* OAuth buttons */}
          <div className="flex gap-2 mb-2">
            {[
              { label: "Google",  icon: <GoogleSVG /> },
              { label: "Apple",   icon: <AppleSVG /> },
              { label: "Discord", icon: <DiscordSVG /> },
            ].map(({ label, icon }) => (
              <button
                key={label}
                type="button"
                onClick={label === "Google" ? handleGoogleOAuth : undefined}
                disabled={oauthLoading && label === "Google"}
                style={{
                  flex: 1, height: 42, borderRadius: 11,
                  border: "1px solid var(--bm-border2, #20212A)",
                  background: "var(--bm-bg3, #131418)",
                  color: "var(--bm-text2, #828292)",
                  fontFamily: "'Syne', sans-serif", fontSize: 12, fontWeight: 600,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  cursor: label === "Google" ? "pointer" : "default",
                  transition: "all .18s",
                  boxShadow: "0 1px 4px rgba(0,0,0,.3)",
                  opacity: oauthLoading && label === "Google" ? 0.5 : 1,
                }}
              >
                {icon}{label}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-2.5 my-4">
            <div className="flex-1 h-px" style={{ background: "var(--bm-border2)" }} />
            <span style={{ fontSize: 9.5, color: "var(--bm-text4, #28283A)", fontWeight: 700,
              letterSpacing: ".09em", textTransform: "uppercase" }}>
              or continue with email
            </span>
            <div className="flex-1 h-px" style={{ background: "var(--bm-border2)" }} />
          </div>

          {/* Form */}
          <form onSubmit={handleEmailAuth} className="flex flex-col gap-4">
            <Input label="Email" type="email" placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)}
              required autoComplete="email" />

            <Input
              label="Password"
              type={showPassword ? "text" : "password"}
              placeholder={tab === "signup" ? "Min. 8 characters" : "Your password"}
              value={password} onChange={(e) => setPassword(e.target.value)}
              required autoComplete={tab === "signin" ? "current-password" : "new-password"}
              rightIcon={
                <button type="button" onClick={() => setShowPassword((p) => !p)}
                  className="transition-colors" style={{ color: "var(--bm-text3)" }}>
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              }
            />

            {tab === "signin" && (
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-3.5 h-3.5 rounded"
                    style={{ accentColor: "var(--bm-accent)" }} />
                  <span className="text-xs" style={{ color: "var(--bm-text3)" }}>Remember me</span>
                </label>
                <button type="button" onClick={handleForgotPassword}
                  className="text-xs hover:underline transition-colors"
                  style={{ color: "var(--bm-accent)" }}>
                  Forgot password?
                </button>
              </div>
            )}

            <Button
              type="submit" fullWidth loading={loading} className="mt-1"
              style={{ background: "var(--grad-primary, linear-gradient(135deg,#5CC88A,#4AB8B0))", color: "#04060A" }}
            >
              {tab === "signin" ? "Sign In" : "Create Account"}
              {!loading && <ArrowRight size={14} />}
            </Button>
          </form>

          {/* Security badges */}
          <div className="flex items-center justify-center gap-3.5 pt-3.5 mt-4"
            style={{ borderTop: "1px solid var(--bm-border)" }}>
            {[
              { icon: <ShieldSVG />,      label: "256-bit SSL" },
              { icon: <LockSVG />,        label: "End-to-end encrypted" },
              { icon: <EyeOffBadgeSVG />, label: "No data sold" },
            ].map(({ icon, label }) => (
              <span key={label} className="flex items-center gap-1"
                style={{ fontSize: 9, color: "var(--bm-text4, #28283A)", fontWeight: 600, letterSpacing: ".04em" }}>
                {icon}{label}
              </span>
            ))}
          </div>

          {/* Legal footer */}
          <p className="text-center mt-2.5"
            style={{ fontSize: 9.5, color: "var(--bm-text4, #28283A)", lineHeight: 1.7 }}>
            By continuing, you agree to our{" "}
            <a href="/legal/terms" style={{ color: "var(--bm-text3)", textDecoration: "underline", textUnderlineOffset: 2 }}>Terms</a>
            {" "}and{" "}
            <a href="/legal/privacy" style={{ color: "var(--bm-text3)", textDecoration: "underline", textUnderlineOffset: 2 }}>Privacy Policy</a>.
          </p>
        </motion.div>
      </div>
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
