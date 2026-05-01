"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  Target, Zap, Flame, LayoutDashboard, Globe,
  ArrowRight, Play, AlertTriangle, Shield,
  AlertCircle, X, Brain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

// ── Mini Dashboard Mockup (real TSX, no image) ───────────────────────────────
function DashboardMockup() {
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-[var(--bm-border2)] shadow-[0_18px_48px_rgba(0,0,0,0.45)] sm:rounded-2xl sm:shadow-[0_32px_80px_rgba(0,0,0,0.6)]"
      style={{ background: "var(--bm-bg2)" }}
    >
      {/* Topbar */}
      <div
        className="flex items-center gap-2 border-b border-[var(--bm-border)] px-3 py-3 sm:px-4"
        style={{ background: "var(--bm-bg)" }}
      >
        <div className="hidden gap-1.5 min-[380px]:flex">
          <span className="h-3 w-3 rounded-full bg-[#FF5F57] opacity-80" />
          <span className="h-3 w-3 rounded-full bg-[#FFBD2E] opacity-80" />
          <span className="h-3 w-3 rounded-full bg-[#28C840] opacity-80" />
        </div>
        <div
          className="flex h-7 min-w-0 flex-1 items-center rounded-md px-3 text-[11px] sm:mx-4 sm:h-5 sm:text-[9px]"
          style={{ background: "var(--bm-bg3)", color: "var(--bm-text3)" }}
        >
          buildmind.live/overview
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        {/* Header */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[var(--bm-text3)]">Good morning</p>
          <h4 className="text-base font-semibold text-[var(--bm-text)] sm:text-sm">BuildMind Dashboard</h4>
        </div>

        {/* Metric row */}
        <div className="grid grid-cols-1 gap-2 min-[430px]:grid-cols-3">
          {[
            { label: "Score", val: "82" },
            { label: "Projects", val: "3" },
            { label: "Streak", val: "12d" },
          ].map((m) => (
            <div
              key={m.label}
              className="flex flex-row items-center justify-between gap-3 rounded-lg p-3 min-[430px]:flex-col min-[430px]:items-start min-[430px]:justify-start min-[430px]:gap-1 min-[430px]:p-2.5"
              style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border)" }}
            >
              <span className="text-[10px] uppercase tracking-widest text-[var(--bm-text3)] min-[430px]:text-[9px]">{m.label}</span>
              <span className="text-lg font-bold text-[var(--bm-text)] min-[430px]:text-base">{m.val}</span>
            </div>
          ))}
        </div>

        {/* Project card */}
        <div
          className="flex items-center gap-3 rounded-xl p-3.5 sm:p-3"
          style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border)" }}
        >
          {/* Score ring */}
          <div className="relative w-10 h-10 shrink-0">
            <svg width={40} height={40} viewBox="0 0 40 40" style={{ transform: "rotate(-90deg)" }}>
              <circle cx={20} cy={20} r={16} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={4} />
              <motion.circle
                cx={20} cy={20} r={16}
                fill="none" stroke="var(--bm-accent)" strokeWidth={4}
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 16}
                initial={{ strokeDashoffset: 2 * Math.PI * 16 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 16 * 0.35 }}
                transition={{ duration: 1.2, ease: "easeOut", delay: 0.5 }}
                style={{ filter: "drop-shadow(0 0 3px var(--bm-accent))" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[9px] font-bold text-[var(--bm-accent)]">82</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-[var(--bm-text)] sm:text-xs">AI onboarding assistant</p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--bm-bg4)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "var(--grad-primary)" }}
                  initial={{ width: 0 }}
                  animate={{ width: "82%" }}
                  transition={{ duration: 0.9, delay: 0.7, ease: "easeOut" }}
                />
              </div>
              <span className="text-[10px] text-[var(--bm-text3)] sm:text-[9px]">82%</span>
            </div>
          </div>
        </div>

        {/* AI nudge */}
        <div
          className="rounded-lg p-3 text-xs leading-relaxed sm:text-[10px]"
          style={{
            background: "rgba(92,200,138,0.05)",
            border: "1px solid var(--bm-accent-bd)",
            color: "var(--bm-text2)",
          }}
        >
          <span style={{ color: "var(--bm-accent)", fontWeight: 600 }}>AI Coach: </span>
          "Strong validation signal. Ship the demo to 5 more founders before adding features."
        </div>
      </div>
    </div>
  );
}

// ── Feature cards ─────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: Brain,
    title: "Reflexion Loop",
    desc: "Three AI agents — Executor, Critic, Synthesiser — debate your last move and generate today's action. Not a chatbot. A causality engine.",
  },
  {
    icon: Target,
    title: "Confidence Gate",
    desc: "Rates your confidence 1–5 every day. If you spiral below 2 for three days straight, it shifts you into Recovery Mode automatically.",
  },
  {
    icon: Zap,
    title: "Startup Score",
    desc: "A composite of validation, execution, and momentum — recalculated after every task. Shows you whether you're building or just staying busy.",
  },
  {
    icon: Flame,
    title: "Rotating Critic Personas",
    desc: "Each week, a different lens: the VC, the cynical user, the ex-founder. Same product, six entirely different threat models.",
  },
  {
    icon: LayoutDashboard,
    title: "Daily Command Center",
    desc: "Wakes you up with one action — built from yesterday's reflection, your project stage, and what's actually blocking you. No dashboard bloat.",
  },
  {
    icon: Globe,
    title: "Public Founder Pages",
    desc: "A live record of your build — milestones, scores, momentum. Accountability that's readable by anyone you want to impress.",
  },
];

function DemoModal({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);

  async function handlePlay() {
    try {
      await videoRef.current?.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-3 py-5 sm:px-6" style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)" }}>
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-6xl max-h-[92vh] overflow-y-auto rounded-2xl" style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border2)" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--bm-border)" }}>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-[var(--bm-accent)]">2-minute demo</div>
            <div className="text-sm text-[var(--bm-text3)]">BuildMind product walkthrough</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-[var(--bm-text3)] hover:text-[var(--bm-text)] hover:bg-[var(--bm-bg3)]" aria-label="Close demo">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 sm:p-6">
          <div className="relative rounded-xl overflow-hidden" style={{ background: "var(--bm-bg)", border: "1px solid var(--bm-border)" }}>
            <button
              type="button"
              onClick={handlePlay}
              className={`absolute inset-0 z-10 flex items-center justify-center transition-opacity ${playing ? "pointer-events-none opacity-0" : "opacity-100"}`}
              style={{ background: "rgba(0,0,0,0.28)" }}
              aria-label="Play demo video"
            >
              <span
                className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full text-white shadow-2xl transition-transform active:scale-95"
                style={{ background: "var(--grad-primary)" }}
              >
                <Play size={30} fill="currentColor" />
              </span>
            </button>
              <video
                ref={videoRef}
                className="block w-full aspect-video min-h-[260px] sm:min-h-[420px] bg-black"
                src="/demo/buildmind_demo.mp4"
                controls
                playsInline
                preload="metadata"
                poster="/logo/buildmind-og-image.svg"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
              />
          </div>
          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[11px] font-bold text-[var(--bm-text3)] uppercase tracking-widest mb-2">Product walkthrough</div>
              <h3 className="text-2xl font-bold tracking-tight text-[var(--bm-text)] mb-2">See BuildMind in motion</h3>
              <p className="max-w-2xl text-sm leading-relaxed text-[var(--bm-text2)]">
                Watch how a founder moves from idea to execution with projects, daily actions,
                milestones, scoring, and AI coaching in one workspace.
              </p>
            </div>
            <Link href="/auth/login" className="shrink-0">
              <Button size="sm">
                Start Building Free
                <ArrowRight size={12} />
              </Button>
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Risk severity badge color ─────────────────────────────────────────────────
type RiskSeverity = "Critical" | "High" | "Medium" | "Low";

function severityVariant(s: RiskSeverity) {
  if (s === "Critical") return "danger";
  if (s === "High") return "warning";
  if (s === "Medium") return "info";
  return "neutral";
}

interface RiskItem {
  category: string;
  severity: RiskSeverity;
  description: string;
  mitigation: string;
}

interface BreakResult {
  overallRisk: RiskSeverity;
  risks: RiskItem[];
  summary: string;
}

interface BreakPublicResponse {
  success?: boolean;
  error?: string;
  data?: {
    verdict?: string;
    kill_reasons?: string[];
    brutal_advice?: string;
    survival_probability?: number;
    differentiation_plan?: string[];
  };
}

interface PublicStats {
  founders?: number;
  projects?: number;
  milestones?: number;
}

// ── Break My Startup section ──────────────────────────────────────────────────
function BreakMyStartupSection() {
  const [idea, setIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BreakResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleBreak() {
    if (!idea.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      // [endpoint pending] — wire to POST /api/ai/break-public when ready
      const res = await fetch("/api/ai/break-public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea }),
      });
      if (!res.ok) throw new Error("Request failed");
      const payload = (await res.json()) as BreakPublicResponse;
      if (!payload.success) throw new Error(payload.error ?? "Request failed");
      const data = payload.data;
      const probability = data?.survival_probability ?? 40;
      const overallRisk: RiskSeverity =
        probability < 25 ? "Critical" : probability < 45 ? "High" : probability < 70 ? "Medium" : "Low";
      const risks: RiskItem[] = (data?.kill_reasons?.length ? data.kill_reasons : ["Execution risk not enough data yet"]).map((reason, index) => ({
        category: index === 0 ? "Primary risk" : `Risk ${index + 1}`,
        severity: index === 0 ? overallRisk : overallRisk === "Critical" ? "High" : overallRisk,
        description: reason,
        mitigation: data?.differentiation_plan?.[index] ?? data?.brutal_advice ?? "Talk to 5 target users and validate the riskiest assumption before building more.",
      }));
      setResult({
        overallRisk,
        summary: data?.verdict ?? "Stress test complete. Review the risks before deciding what to build next.",
        risks,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="px-5 py-16 sm:px-6 sm:py-24"
      style={{ background: "var(--bm-bg2)", borderTop: "1px solid var(--bm-border)" }}
    >
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex flex-col gap-6"
        >
          <div>
            <Badge variant="danger" dot className="mb-4">Stress-Test Your Idea</Badge>
            <h2 className="mb-3 text-3xl font-bold tracking-tight text-[var(--bm-text)] sm:text-4xl">
              What's the biggest risk threatening your startup right now?
            </h2>
            <p className="text-base leading-relaxed text-[var(--bm-text2)] sm:text-lg">
              Paste your idea, product, or business model. Our AI will identify your top
              vulnerabilities — brutally, honestly, constructively.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="Describe your startup idea or current model — what you're building, who it's for, how you make money..."
              className="h-44 w-full resize-none rounded-xl p-4 text-base outline-none transition-all duration-150 focus:ring-1 sm:h-36 sm:text-sm"
              style={{
                background: "var(--bm-bg3)",
                border: "1px solid var(--bm-border2)",
                color: "var(--bm-text)",
                fontFamily: "inherit",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--bm-accent)";
                e.currentTarget.style.boxShadow = "0 0 0 1px var(--bm-accent-bd)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--bm-border2)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
            <Button
              onClick={handleBreak}
              loading={loading}
              disabled={!idea.trim()}
              size="lg"
              className="w-full self-start sm:w-auto"
            >
              {!loading && <AlertTriangle size={16} />}
              Break My Startup →
            </Button>
          </div>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex items-center gap-2 text-sm p-4 rounded-xl"
              style={{ background: "rgba(224,85,85,0.08)", border: "1px solid rgba(224,85,85,0.2)", color: "var(--bm-red)" }}
            >
              <AlertCircle size={16} />
              {error}
            </motion.div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col gap-3"
            >
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl p-4 border border-[var(--bm-border)] bg-[var(--bm-bg3)] animate-pulse flex flex-col gap-2">
                  <div className="h-4 w-32 rounded-full bg-[var(--bm-bg4)]" />
                  <div className="h-3 w-full rounded-full bg-[var(--bm-bg4)] opacity-70" />
                  <div className="h-3 w-5/6 rounded-full bg-[var(--bm-bg4)] opacity-50" />
                </div>
              ))}
            </motion.div>
          )}

          {/* Result */}
          {result && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col gap-4"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-[var(--bm-text2)]">Overall Risk Level:</span>
                <Badge variant={severityVariant(result.overallRisk)} size="md" dot>
                  {result.overallRisk}
                </Badge>
              </div>

              {result.summary && (
                <p className="text-sm text-[var(--bm-text2)] leading-relaxed">{result.summary}</p>
              )}

              {(result.risks ?? []).map((risk, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                >
                  <Card className="p-4 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--bm-text)]">{risk.category}</span>
                      <Badge variant={severityVariant(risk.severity)} dot>
                        {risk.severity}
                      </Badge>
                    </div>
                    <p className="text-sm text-[var(--bm-text2)] leading-relaxed">{risk.description}</p>
                    <div
                      className="flex items-start gap-2 text-xs p-2.5 rounded-lg mt-1"
                      style={{ background: "var(--bm-bg3)", color: "var(--bm-text3)" }}
                    >
                      <Shield size={12} className="shrink-0 mt-0.5" style={{ color: "var(--bm-accent)" }} />
                      <span>{risk.mitigation}</span>
                    </div>
                  </Card>
                </motion.div>
              ))}

              <Link href="/auth/login">
                <Button variant="secondary" size="sm">
                  Save this analysis to your project <ArrowRight size={12} />
                </Button>
              </Link>
            </motion.div>
          )}
        </motion.div>
      </div>
    </section>
  );
}

// ── Main landing page ─────────────────────────────────────────────────────────
export default function LandingPage() {
  const [stats, setStats] = useState({
    founders: 0,
    projects: 0,
    milestones: 0,
  });
  const [demoOpen, setDemoOpen] = useState(false);

  useEffect(() => {
    fetch("/api/public/stats")
      .then((r) => r.json())
      .then((data: PublicStats) => {
        setStats({
          founders: data.founders ?? 0,
          projects: data.projects ?? 0,
          milestones: data.milestones ?? 0,
        });
      })
      .catch(() => {});
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--bm-bg)", color: "var(--bm-text)" }}
    >
      {/* Navbar */}
      <nav
        className="sticky top-0 z-50 flex h-16 items-center justify-between gap-3 px-4 sm:px-6"
        style={{
          background: "rgba(15,15,16,0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--bm-border)",
        }}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center"
               style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border)" }}>
            <Image src="/logo/buildmind-mark.svg" alt="BuildMind" width={24} height={24} priority />
          </div>
          <span className="font-semibold text-sm text-[var(--bm-text)]">BuildMind</span>
        </div>

        <div className="hidden md:flex items-center gap-6 text-sm text-[var(--bm-text2)]">
          <a href="#features" className="hover:text-[var(--bm-text)] transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-[var(--bm-text)] transition-colors">How It Works</a>
          <a href="#break" className="hover:text-[var(--bm-text)] transition-colors">Stress-Test</a>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link href="/auth/login" className="hidden sm:block">
            <Button variant="ghost" size="sm">Log in</Button>
          </Link>
          <Link href="/auth/login">
            <Button size="sm">
              <span className="sm:hidden">Start</span>
              <span className="hidden sm:inline">Get Started →</span>
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 px-5 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20 lg:pb-32">
        <div className="mx-auto grid max-w-7xl items-center gap-10 md:grid-cols-2 lg:gap-16">
          {/* Left */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex flex-col gap-5 sm:gap-6"
          >
            <span style={{
              background: "var(--bm-accent-dim)",
              border: "1px solid var(--bm-accent-bd)",
              color: "var(--bm-accent)",
              borderRadius: 20,
              padding: "4px 14px",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase" as const,
              letterSpacing: "0.07em",
              display: "inline-block",
            }}>AI Founder Operating System</span>

            <h1 className="text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Stop planning.
              <br />
              <span className="gradient-text">Start building.</span>
            </h1>

            <p className="max-w-xl text-base leading-relaxed text-[var(--bm-text2)] sm:text-lg">
              BuildMind turns your ideas into executable systems — with milestones, scores,
              AI coaching, and accountability built in.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href="/auth/login" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto">
                  Start Building Free
                  <ArrowRight size={16} />
                </Button>
              </Link>
              <Button size="lg" variant="secondary" onClick={() => setDemoOpen(true)} className="w-full sm:w-auto">
                <Play size={14} />
                Watch 2-min Demo
              </Button>
            </div>

            {/* Social proof pills */}
            <div className="flex flex-wrap gap-2 pt-1 sm:pt-2">
              {[
                { label: "Founders building", val: stats.founders },
                { label: "Projects launched", val: stats.projects },
                { label: "Milestones completed", val: stats.milestones },
              ].map((s) => (
                <div
                  key={s.label}
                  className="inline-flex w-fit items-center justify-start gap-1.5 rounded-full px-3 py-1.5 text-xs"
                  style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border2)" }}
                >
                  <span className="font-semibold text-[var(--bm-text)]">{s.val.toLocaleString()}</span>
                  <span className="text-[var(--bm-text3)]">{s.label}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right — product mockup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="relative mt-2 md:mt-0"
          >
            {/* Ambient glow */}
            <div
              className="absolute inset-0 -z-10"
              style={{
                background:
                  "radial-gradient(ellipse at center, rgba(92,200,138,0.12) 0%, transparent 70%)",
                filter: "blur(20px)",
                transform: "scale(1.2)",
              }}
            />
            <DashboardMockup />
          </motion.div>
        </div>
      </section>

      {/* Break My Startup — interactive hook, no login required */}
      <div id="break">
        <BreakMyStartupSection />
      </div>

      {/* Feature Grid */}
      <section id="features" className="px-5 py-16 sm:px-6 sm:py-24" style={{ borderTop: "1px solid var(--bm-border)" }}>
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-10 text-left sm:mb-14 sm:text-center"
          >
            <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-3xl">
              Everything a founder needs. Nothing they don't.
            </h2>
            <p className="text-base leading-relaxed text-[var(--bm-text2)]">
              Built for first-time and repeat founders who execute, not just plan.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.07 }}
                >
                  <Card hover className="p-6 flex flex-col gap-3 h-full">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: "var(--bm-bg3)", color: "var(--bm-accent)" }}
                    >
                      <Icon size={20} />
                    </div>
                    <h3 className="font-semibold text-[var(--bm-text)]">{f.title}</h3>
                    <p className="text-sm text-[var(--bm-text3)] leading-relaxed">{f.desc}</p>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section
        id="how-it-works"
        className="px-5 py-16 sm:px-6 sm:py-24"
        style={{ background: "var(--bm-bg2)", borderTop: "1px solid var(--bm-border)" }}
      >
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-10 text-left sm:mb-14 sm:text-center"
          >
            <h2 className="mb-3 text-3xl font-bold tracking-tight">From idea to execution in minutes</h2>
          </motion.div>

          <div className="relative flex flex-col items-stretch gap-4 md:flex-row md:items-start md:gap-0">
            {/* Connecting line */}
            <div
              className="hidden md:block absolute top-10 left-0 right-0 h-px"
              style={{ background: "linear-gradient(90deg, transparent, var(--bm-border3), transparent)" }}
            />

            {[
              {
                step: 1,
                title: "Define your startup idea",
                desc: "Describe what you're building in plain language. AI does the rest.",
              },
              {
                step: 2,
                title: "Get a structured execution plan",
                desc: "BuildMind breaks your idea into milestones, tasks, and timelines automatically.",
              },
              {
                step: 3,
                title: "Execute daily — score, track, grow",
                desc: "Check in every day. Your score rises as you ship. No fluff.",
              },
            ].map((s, i) => (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12 }}
                className="flex-1 rounded-xl px-0 py-2 text-left sm:px-6 sm:py-4 sm:text-center"
              >
                <div
                  className="relative z-10 mb-3 flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white sm:mx-auto"
                  style={{ background: "var(--grad-primary)" }}
                >
                  {s.step}
                </div>
                <h3 className="font-semibold text-[var(--bm-text)]">{s.title}</h3>
                <p className="mt-1 max-w-none text-sm leading-relaxed text-[var(--bm-text3)] sm:mx-auto sm:max-w-xs">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="px-5 py-14 sm:px-6" style={{ borderTop: "1px solid var(--bm-border)" }}>
        <div className="max-w-5xl mx-auto">
          <p className="text-[11px] font-bold uppercase tracking-widest mb-8" style={{ color: "var(--bm-text3)" }}>
            What founders say
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              {
                quote: "BuildMind helped me move from scattered ideas to a focused daily execution rhythm.",
                name: "Julius Abbey",
              },
              {
                quote: "The milestones made the next step obvious, so I spent less time guessing and more time shipping.",
                name: "Israel Akortia",
              },
              {
                quote: "It feels like having a calm operator beside me, keeping the work practical and measurable.",
                name: "Samuel Bempong",
              },
            ].map((t) => (
              <blockquote
                key={t.name}
                className="m-0 rounded-xl p-5"
                style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border2)" }}
              >
                <p className="text-sm font-medium leading-relaxed text-[var(--bm-text)]">"{t.quote}"</p>
                <footer className="mt-5 text-xs font-semibold text-[var(--bm-text3)]">{t.name}</footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section
        className="px-5 py-16 text-center sm:px-6 sm:py-24"
        style={{ background: "var(--grad-primary)" }}
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-xl mx-auto flex flex-col gap-5"
        >
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Your competitors are already moving. Are you?
          </h2>
          <p className="text-white/70 text-lg">Start free. No credit card required.</p>
          <div className="flex justify-center">
            <Link href="/auth/login">
              <button className="h-12 px-8 rounded-xl bg-white text-sm font-semibold text-[#111] hover:bg-white/90 transition-all active:scale-95 flex items-center gap-2">
                Start Building Free
                <ArrowRight size={16} />
              </button>
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer
        className="py-8 px-6 text-center text-xs"
        style={{ borderTop: "1px solid var(--bm-border)", color: "var(--bm-text3)" }}
      >
        © {new Date().getFullYear()} BuildMind. Built for founders who ship.
      </footer>
      {demoOpen && <DemoModal onClose={() => setDemoOpen(false)} />}
    </div>
  );
}
