"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  Bot, Target, Zap, Flame, LayoutDashboard, Globe,
  ChevronRight, ArrowRight, Play, AlertTriangle, Shield,
  TrendingUp, CheckCircle2, Loader2, AlertCircle, Info, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

// ── Mini Dashboard Mockup (real TSX, no image) ───────────────────────────────
function DashboardMockup() {
  return (
    <div
      className="relative rounded-2xl overflow-hidden border border-[var(--bm-border2)] shadow-[0_32px_80px_rgba(0,0,0,0.6)]"
      style={{ background: "var(--bm-bg2)" }}
    >
      {/* Topbar */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b border-[var(--bm-border)]"
        style={{ background: "var(--bm-bg)" }}
      >
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#FF5F57] opacity-80" />
          <span className="w-3 h-3 rounded-full bg-[#FFBD2E] opacity-80" />
          <span className="w-3 h-3 rounded-full bg-[#28C840] opacity-80" />
        </div>
        <div
          className="flex-1 mx-4 h-5 rounded-md text-[9px] flex items-center px-2"
          style={{ background: "var(--bm-bg3)", color: "var(--bm-text3)" }}
        >
          app.buildmind.co/overview
        </div>
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col gap-4">
        {/* Header */}
        <div>
          <p className="text-[10px] text-[var(--bm-text3)] uppercase tracking-widest">Good morning</p>
          <h4 className="text-sm font-semibold text-[var(--bm-text)]">BuildMind Dashboard</h4>
        </div>

        {/* Metric row */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Score", val: "--" },
            { label: "Projects", val: "--" },
            { label: "Streak", val: "--" },
          ].map((m) => (
            <div
              key={m.label}
              className="rounded-lg p-2.5 flex flex-col gap-1"
              style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border)" }}
            >
              <span className="text-[9px] text-[var(--bm-text3)] uppercase tracking-widest">{m.label}</span>
              <span className="text-base font-bold text-[var(--bm-text)]">{m.val}</span>
            </div>
          ))}
        </div>

        {/* Project card */}
        <div
          className="rounded-xl p-3 flex items-center gap-3"
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
              <span className="text-[9px] font-bold text-[var(--bm-accent)]">--</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[var(--bm-text)] truncate">Your first startup</p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--bm-bg4)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "var(--grad-primary)" }}
                  initial={{ width: 0 }}
                  animate={{ width: "40%" }}
                  transition={{ duration: 0.9, delay: 0.7, ease: "easeOut" }}
                />
              </div>
              <span className="text-[9px] text-[var(--bm-text3)]">40%</span>
            </div>
          </div>
        </div>

        {/* AI nudge */}
        <div
          className="rounded-lg p-3 text-[10px] leading-relaxed"
          style={{
            background: "rgba(92,200,138,0.05)",
            border: "1px solid var(--bm-accent-bd)",
            color: "var(--bm-text2)",
          }}
        >
          <span style={{ color: "var(--bm-accent)", fontWeight: 600 }}>AI Coach: </span>
          "You're making progress. Define your next milestone to keep momentum."
        </div>
      </div>
    </div>
  );
}

// ── Feature cards ─────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: Bot, title: "AI Coach", desc: "Your startup advisor, always online." },
  { icon: Target, title: "Milestone Tracking", desc: "Break big goals into daily actions." },
  { icon: Zap, title: "Startup Score", desc: "A real-time health check on your execution." },
  { icon: Flame, title: "Founder Streaks", desc: "Build momentum with accountability." },
  { icon: LayoutDashboard, title: "Daily Command Center", desc: "One page. Every priority. Every morning." },
  { icon: Globe, title: "Public Progress Pages", desc: "Share your journey, attract your tribe." },
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
      const data = (await res.json()) as Partial<BreakResult>;
      setResult({
        overallRisk: (data?.overallRisk ?? "Medium") as RiskSeverity,
        summary: (data?.summary ?? "") as string,
        risks: Array.isArray(data?.risks) ? data.risks : [],
      });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="py-24 px-4"
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
            <h2 className="text-4xl font-bold text-[var(--bm-text)] tracking-tight mb-3">
              What's the biggest risk threatening your startup right now?
            </h2>
            <p className="text-[var(--bm-text2)] text-lg leading-relaxed">
              Paste your idea, product, or business model. Our AI will identify your top
              vulnerabilities — brutally, honestly, constructively.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="Describe your startup idea or current model — what you're building, who it's for, how you make money..."
              className="w-full h-36 rounded-xl p-4 text-sm resize-none outline-none transition-all duration-150 focus:ring-1"
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
              className="self-start"
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
        className="sticky top-0 z-50 flex items-center justify-between px-6 h-16"
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

        <div className="flex items-center gap-3">
          <Link href="/auth/login">
            <Button variant="ghost" size="sm">Log in</Button>
          </Link>
          <Link href="/auth/login">
            <Button size="sm">Get Started →</Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 px-4 pt-24 pb-32">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          {/* Left */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex flex-col gap-6"
          >
            <Badge variant="gradient" size="md">AI Founder Operating System</Badge>

            <h1 className="text-5xl font-bold tracking-tight leading-[1.1]">
              Stop planning.
              <br />
              <span className="gradient-text">Start building.</span>
            </h1>

            <p className="text-lg text-[var(--bm-text2)] leading-relaxed max-w-lg">
              BuildMind turns your ideas into executable systems — with milestones, scores,
              AI coaching, and accountability built in.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link href="/auth/login">
                <Button size="lg">
                  Start Building Free
                  <ArrowRight size={16} />
                </Button>
              </Link>
              <Button size="lg" variant="secondary" onClick={() => setDemoOpen(true)}>
                <Play size={14} />
                Watch 2-min Demo
              </Button>
            </div>

            {/* Social proof pills */}
            <div className="flex flex-wrap gap-2 pt-2">
              {[
                { label: "Founders building", val: stats.founders },
                { label: "Projects launched", val: stats.projects },
                { label: "Milestones completed", val: stats.milestones },
              ].map((s) => (
                <div
                  key={s.label}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
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
            className="relative"
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

      {/* Feature Grid */}
      <section id="features" className="py-24 px-4" style={{ borderTop: "1px solid var(--bm-border)" }}>
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className="text-3xl font-bold tracking-tight mb-3">
              Everything a founder needs. Nothing they don't.
            </h2>
            <p className="text-[var(--bm-text2)]">
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
        className="py-24 px-4"
        style={{ background: "var(--bm-bg2)", borderTop: "1px solid var(--bm-border)" }}
      >
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className="text-3xl font-bold tracking-tight mb-3">From idea to execution in minutes</h2>
          </motion.div>

          <div className="relative flex flex-col md:flex-row items-start gap-0 md:gap-0">
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
                className="flex-1 flex flex-col items-center text-center gap-3 px-6 py-4"
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white relative z-10"
                  style={{ background: "var(--grad-primary)" }}
                >
                  {s.step}
                </div>
                <h3 className="font-semibold text-[var(--bm-text)]">{s.title}</h3>
                <p className="text-sm text-[var(--bm-text3)] leading-relaxed max-w-xs">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Break My Startup */}
      <div id="break">
        <BreakMyStartupSection />
      </div>

      {/* Final CTA */}
      <section
        className="py-24 px-4 text-center"
        style={{ background: "var(--grad-primary)" }}
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-xl mx-auto flex flex-col gap-5"
        >
          <h2 className="text-4xl font-bold tracking-tight text-white">
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
