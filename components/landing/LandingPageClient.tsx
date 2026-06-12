"use client";

import { useRef, useState, useEffect, type CSSProperties } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import {
  Target, Zap, Flame, LayoutDashboard, Globe,
  ArrowRight, Play, AlertTriangle, Shield,
  AlertCircle, X, Brain, ChevronRight, Sparkles,
  Clock, TrendingUp, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { BrandMark } from "@/components/layout/logo";
import { sanitizeOutput } from "@/lib/sanitizeOutput";

// ── "A Day With BuildMind" timeline data ──────────────────────────────────────
const DAY_TIMELINE = [
  {
    time: "7:00 AM",
    event: "Morning Briefing arrives",
    detail: "Agent A read your last reflection and built today's action overnight.",
    title: "Your morning briefing is waiting.",
    body: "While you slept, Agent A read your last reflection, your momentum trend, and what the YC Critic said last time. It built one action: the highest leverage thing you can do today. No list. No options. Just the move.",
    chips: ["Momentum 81", "Streak 14d", "3-agent loop ran"],
    color: "var(--bm-accent)",
    icon: Sparkles,
  },
  {
    time: "9:20 AM",
    event: "Action executed. Streak extended.",
    detail: "You copied the outreach script. Streak extended to 14 days.",
    title: "Task sent. Streak extended to 14 days.",
    body: "You copied the outreach script. Three founders messaged. Streak holds. Momentum edges up. The system logged the action and will factor it into tonight's reflection loop.",
    chips: ["Streak 14d", "Actions +1", "Outreach sent"],
    color: "var(--bm-teal)",
    icon: Activity,
  },
  {
    time: "2:00 PM",
    event: "Two replies received",
    detail: "Momentum score rises from 74 → 81. Pattern detector notes traction.",
    title: "Two replies received. Traction detected.",
    body: "Pattern detector notes the second positive reply in 3 days. Momentum rises from 74 to 81. The YC Critic will be more generous tonight because you're showing signal.",
    chips: ["Score 74 to 81", "Replies 2", "Pattern detected"],
    color: "var(--bm-accent)",
    icon: TrendingUp,
  },
  {
    time: "6:00 PM",
    event: "Evening check triggers",
    detail: "Confidence at 4 — system notes 3rd consecutive strong day. No Recovery Mode needed.",
    title: "Evening check: third strong day.",
    body: "Confidence 4/5. Three consecutive days above threshold. No Recovery Mode needed. The system notes your cadence and will extend the streak target in tomorrow's briefing.",
    chips: ["Confidence 4/5", "Day 3 of 3", "Recovery off"],
    color: "var(--bm-blue)",
    icon: Clock,
  },
  {
    time: "11:59 PM",
    event: "Reflexion Loop queued",
    detail: "Agents A, B, C scheduled to debate your outcome and prepare tomorrow's action.",
    title: "Reflexion Loop queued for tonight.",
    body: "Agents A, B, and C are scheduled. A will read today's outcome and yesterday's reflection. B will critique the next proposed action from three angles. C will refine. Tomorrow's move will be waiting at 7am.",
    chips: ["Agents 3", "Queued 00:01", "Tomorrow ready"],
    color: "#A78BFA",
    icon: Brain,
  },
];

// ── Reflexion Pipeline Animation ──────────────────────────────────────────────
function ReflexionPipelineDemo() {
  const [activeStep, setActiveStep] = useState(0);
  const [running, setRunning] = useState(false);
  const [idea, setIdea] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [liveResult, setLiveResult] = useState<{ action: string; why: string; time: string } | null>(null);
  const [apiError, setApiError] = useState(false);

  const STEPS = [
    {
      agent: "A — Generator",
      color: "var(--bm-accent)",
      action: "Reading your startup stage + yesterday's reflection…",
      output: null,
    },
    {
      agent: "B — Critic (YC Partner)",
      color: "var(--bm-amber)",
      action: "Reviewing Generator output for logical flaws…",
      output: "Rejected: \"Too vague — no specific channel or person named.\" Sending back.",
    },
    {
      agent: "A — Generator (v2)",
      color: "var(--bm-accent)",
      action: "Rebuilding task with Critic's rejection applied…",
      output: null,
    },
    {
      agent: "C — Refiner",
      color: "#A78BFA",
      action: "Calibrating emotional register for your current confidence level…",
      output: null,
    },
  ];

  const FALLBACK_OUTPUT = {
    action: `Message 3 founders who built in your space before you. Ask: "What was the first thing that convinced you it was real?" Not a pitch — pure intel.`,
    why: "You have signal from your last check-in that the idea resonates but you haven't stress-tested it against people who already tried. This closes that gap in under 2 hours.",
    time: "90 min",
  };

  async function runDemo() {
    if (idea.trim().length < 10) return;
    setSubmitted(true);
    setRunning(true);
    setActiveStep(0);
    setLiveResult(null);
    setApiError(false);

    // Run the step animation in parallel with the API call
    const animationPromise = (async () => {
      for (let i = 0; i <= STEPS.length; i++) {
        await new Promise((r) => setTimeout(r, i === 0 ? 400 : 1200));
        setActiveStep(i);
      }
    })();

    const apiPromise = fetch("/api/ai/break-public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea: idea.trim() }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        const data = json?.data;
        if (data) {
          const actionText = typeof data.brutal_advice === "string" && data.brutal_advice.trim()
            ? data.brutal_advice.trim()
            : typeof data.verdict === "string" && data.verdict.trim()
              ? data.verdict.trim()
              : FALLBACK_OUTPUT.action;
          const whyText = Array.isArray(data.kill_reasons) && data.kill_reasons.length > 0
            ? data.kill_reasons[0]
            : typeof data.verdict === "string" && data.verdict.trim()
              ? data.verdict.trim()
              : FALLBACK_OUTPUT.why;
          setLiveResult({
            action: actionText,
            why: whyText,
            time: "~90 min",
          });
        }
      })
      .catch(() => setApiError(true));

    await Promise.all([animationPromise, apiPromise]);
    setRunning(false);
  }

  const finalOutput = liveResult ?? FALLBACK_OUTPUT;
  const done = !running && activeStep === STEPS.length && submitted;

  return (
    <div
      className="html-soft-panel"
      style={{
        background: "var(--bm-bg2)",
        border: "1px solid var(--bm-border2)",
        borderRadius: 18,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid var(--bm-border)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Brain size={14} color="var(--bm-accent)" />
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--bm-text2)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          Live Reflexion Loop
        </span>
        {running && (
          <span style={{
            marginLeft: "auto", fontSize: 10, color: "var(--bm-accent)",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <span style={{
              display: "inline-block", width: 6, height: 6, borderRadius: "50%",
              background: "var(--bm-accent)", animation: "bm-pulse 1s ease-in-out infinite",
            }} />
            Agents running
          </span>
        )}
      </div>

      <div style={{ padding: "20px" }}>
        {/* Input */}
        {!submitted && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "var(--bm-text3)", marginBottom: 8 }}>
              Your startup idea (or leave blank to use a sample):
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="e.g. B2B SaaS for SME compliance..."
                style={{
                  flex: 1, background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)",
                  borderRadius: 9, padding: "9px 13px", fontSize: 13, color: "var(--bm-text)",
                  outline: "none", fontFamily: "inherit",
                }}
                onKeyDown={(e) => e.key === "Enter" && runDemo()}
              />
              <Button size="sm" onClick={runDemo}>
                Run Loop <ArrowRight size={12} />
              </Button>
            </div>
          </motion.div>
        )}

        {/* Pipeline steps */}
        {submitted && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: done ? 16 : 0 }}>
            {STEPS.map((step, i) => {
              const visible = activeStep > i;
              const active = activeStep === i && running;
              return (
                <AnimatePresence key={step.agent}>
                  {(visible || active) && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{
                        background: "var(--bm-bg3)", border: `1px solid ${active ? step.color + "44" : "var(--bm-border)"}`,
                        borderRadius: 12, padding: "12px 14px",
                        transition: "border-color 0.3s",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: step.output && visible ? 8 : 0 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: step.color,
                          padding: "2px 8px", borderRadius: 12,
                          background: step.color + "18", border: `1px solid ${step.color}33`,
                        }}>{step.agent}</span>
                        <span style={{ fontSize: 12, color: active ? "var(--bm-text2)" : "var(--bm-text3)" }}>
                          {step.action}
                        </span>
                        {active && (
                          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--bm-text4)" }}>
                            thinking…
                          </span>
                        )}
                        {visible && !active && (
                          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--bm-accent)" }}>✓</span>
                        )}
                      </div>
                      {step.output && visible && (
                        <div style={{
                          fontSize: 11, color: "var(--bm-amber)", background: "rgba(232,160,32,0.06)",
                          border: "1px solid rgba(232,160,32,0.15)", borderRadius: 8, padding: "8px 10px",
                          fontStyle: "italic",
                        }}>
                          {step.output}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              );
            })}
          </div>
        )}

        {/* Final output */}
        <AnimatePresence>
          {done && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                padding: 1, borderRadius: 15,
                background: "var(--bm-accent-dim)",
              }}
            >
              <div style={{ background: "var(--bm-bg2)", borderRadius: 14, padding: "18px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-accent)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                  ✓ Reflexion output — ready for today
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--bm-text)", lineHeight: 1.5, marginBottom: 10 }}>
                  {finalOutput.action}
                </p>
                <div style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderRadius: 9, padding: "10px 13px", marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: "var(--bm-text3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                    <Brain size={9} color="var(--bm-accent)" /> Why this, why today
                  </div>
                  <p style={{ fontSize: 12, color: "var(--bm-text2)", margin: 0, lineHeight: 1.6 }}>{finalOutput.why}</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: "var(--bm-text3)", display: "flex", alignItems: "center", gap: 4 }}>
                    <Clock size={10} /> Est. {finalOutput.time}
                  </span>
                  <Link href="/auth/login">
                    <Button size="sm">
                      Build yours free <ArrowRight size={11} />
                    </Button>
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function HeroReflexionPipeline() {
  return (
    <div className="relative">
      <style>{`
        @keyframes bm-agent-active {
          0%,100% { border-color: var(--bm-border2); box-shadow: none; }
          50% { border-color: var(--bm-accent-bd); box-shadow: 0 0 24px rgba(92,200,138,0.13); }
        }
        @keyframes bm-travel-h {
          0% { left: -8px; opacity: 0; }
          10%,90% { opacity: 1; }
          100% { left: calc(100% + 8px); opacity: 0; }
        }
        @keyframes bm-travel-v {
          0% { top: -8px; opacity: 0; }
          10%,90% { opacity: 1; }
          100% { top: calc(100% + 8px); opacity: 0; }
        }
        @keyframes bm-output-appear {
          from { opacity: 0; transform: translateY(10px) scale(.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div
        className="bm-glass-gold relative overflow-hidden"
        style={{ borderRadius: 20 }}
      >
        <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(92,200,138,0.45)] to-transparent" />
        <div className="mb-5 flex items-center gap-2 border-b border-[var(--bm-border)] pb-4">
          <span className="flex-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--bm-text4)]">Reflexion Loop: running now</span>
          <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold text-[var(--bm-accent)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--bm-accent)] shadow-[0_0_8px_rgba(92,200,138,0.8)] animate-pulse" />
            Live
          </span>
        </div>

        <div className="mb-5 flex items-stretch gap-0">
          {[
            { label: "Agent A", name: "Generator", status: "Reading context...", color: "var(--bm-accent)", bg: "rgba(232,197,71,0.10)", glow: "rgba(232,197,71,0.12)", delay: "0s" },
            { label: "Agent B", name: "YC Critic", status: "Reviewing...", color: "var(--bm-amber)", bg: "rgba(232,160,32,0.10)", glow: "rgba(232,160,32,0.10)", delay: ".8s" },
            { label: "Agent C", name: "Refiner", status: "Queued", color: "#9B7FE8", bg: "rgba(155,127,232,0.10)", glow: "rgba(155,127,232,0.08)", delay: "1.6s" },
          ].map((agent, i, arr) => (
            <div key={agent.label} className="contents">
              <div
                className="bm-float-card flex-1 rounded-[var(--r-xl)] border p-3.5"
                style={{
                  background: "rgba(255,255,255,0.025)",
                  borderColor: "rgba(255,255,255,0.07)",
                  backdropFilter: "blur(16px)",
                  WebkitBackdropFilter: "blur(16px)",
                  ["--node-color" as string]: agent.color + "55",
                  ["--node-glow" as string]: agent.glow,
                  ["--float-delay" as string]: `${0.1 + i * 0.12}s`,
                  animation: `bm-float-in 0.7s ${0.1 + i * 0.12}s cubic-bezier(0.16, 1, 0.3, 1) both, bm-agent-active 2.5s ${agent.delay} ease-in-out infinite ${0.1 + i * 0.12 + 0.7}s, bm-card-drift ${5.5 + i * 0.7}s ease-in-out infinite ${0.8 + i * 0.3}s`,
                }}
              >
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg text-sm" style={{ background: agent.bg }}>
                  {i === 0 ? "A" : i === 1 ? "B" : "C"}
                </div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--bm-text3)]">{agent.label}</div>
                <div className="text-xs font-semibold leading-snug text-[var(--bm-text2)]">{agent.name}</div>
                <div className="mt-1.5 text-[10px]" style={{ color: i === 2 ? "var(--bm-text4)" : agent.color }}>{agent.status}</div>
              </div>
              {i < arr.length - 1 && (
                <div className="relative mt-16 h-px w-7 shrink-0 overflow-hidden bg-[var(--bm-border2)]">
                  <span
                    className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full"
                    style={{ background: agent.color, boxShadow: `0 0 8px ${agent.color}`, animation: `bm-travel-h 2.2s ${agent.delay} linear infinite` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="relative mx-auto mb-0 flex h-6 w-px justify-center bg-gradient-to-b from-[var(--bm-accent-bd)] to-[var(--bm-border2)]">
          <span className="absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[var(--bm-accent)] shadow-[0_0_8px_rgba(92,200,138,0.7)]" style={{ animation: "bm-travel-v 1.6s 1s linear both" }} />
        </div>

        <div
          className="bm-float-card relative overflow-hidden rounded-[var(--r-xl)] border p-4"
          style={{
            background: "var(--bm-bg3)",
            borderColor: "var(--bm-accent-bd)",
            ["--float-delay" as string]: "0.55s",
            animation: "bm-float-in 0.7s 0.55s cubic-bezier(0.16, 1, 0.3, 1) both, bm-output-appear .5s 1.2s ease both, bm-card-drift 7s ease-in-out infinite 1.7s",
          }}
        >
          <div className="mb-2.5 flex items-center justify-between">
            <span className="rounded-md border border-[var(--bm-accent-bd)] bg-[var(--bm-accent-dim)] px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-[var(--bm-accent)]">Tomorrow's action</span>
            <span className="text-[10px] text-[var(--bm-text4)]">Ready at 07:00</span>
          </div>
          <p className="mb-3 text-sm font-semibold leading-6 text-[var(--bm-text)]">Send a Loom to 5 founders. Ask one question.</p>
          <div className="flex flex-wrap gap-2">
            {["Score up to 81", "Streak 14d", "Confidence 4/5"].map((metric) => (
              <span key={metric} className="rounded-lg border border-[var(--bm-border2)] bg-[var(--bm-bg4)] px-2.5 py-1 text-[10px] text-[var(--bm-text2)]">{metric}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 text-center text-[11px] tracking-wide text-[var(--bm-text4)]">Runs overnight · Briefing waits at 7am · You just execute</div>
    </div>
  );
}

// ── "A Day With BuildMind" section ────────────────────────────────────────────
function DayTimeline() {
  const [active, setActive] = useState(2);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % DAY_TIMELINE.length);
    }, 3800);
    return () => window.clearInterval(timer);
  }, []);

  const selected = DAY_TIMELINE[active];

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_0.9fr] lg:gap-20">
      <div>
        <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--bm-text4)]">
          <span className="h-px w-5 bg-[var(--bm-accent)]" />
          A day with BuildMind
        </div>
        <h2 className="mb-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          The system runs.
          <br />
          You execute.
        </h2>
        <p className="max-w-xl text-base leading-7 text-[var(--bm-text2)]">
          BuildMind isn't a task manager you maintain. It's an operating rhythm that maintains itself. Three agents run every night. One action arrives every morning. Your job is to do it.
        </p>

        <div className="relative mt-10">
          <div className="absolute bottom-0 left-[14px] top-0 w-px bg-gradient-to-b from-[var(--bm-accent)] via-[var(--bm-accent-bd)] to-transparent" />
          <div className="flex flex-col">
            {DAY_TIMELINE.map((item, i) => {
              const isActive = active === i;
              return (
                <button
                  key={item.time}
                  type="button"
                  onClick={() => setActive(i)}
                  className="relative flex gap-5 py-4 text-left transition-opacity hover:opacity-85"
                >
                  <span className="flex w-7 shrink-0 justify-center pt-1">
                    <span
                      className="h-2 w-2 rounded-full transition-all"
                      style={{
                        background: isActive ? "var(--bm-accent)" : "var(--bm-bg4)",
                        border: `1px solid ${isActive ? "var(--bm-accent)" : "var(--bm-border3)"}`,
                        boxShadow: isActive ? "0 0 12px rgba(232,197,71,0.55), 0 0 4px rgba(232,197,71,0.8)" : "none",
                      }}
                    />
                  </span>
                  <span>
                    <span
                      className="mb-1 block text-[10px] font-bold tracking-wide"
                      style={{ color: isActive ? "var(--bm-accent)" : "var(--bm-text4)" }}
                    >
                      {item.time}
                    </span>
                    <span className="block text-sm font-semibold" style={{ color: isActive ? "var(--bm-text)" : "var(--bm-text2)" }}>
                      {item.event}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-[var(--bm-text4)]">{item.detail}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={selected.time}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="bm-glass relative h-fit overflow-hidden lg:sticky lg:top-28"
          style={{
            borderRadius: 20,
            padding: 28,
            boxShadow: "0 24px 80px rgba(0,0,0,0.42), 0 1px 0 rgba(255,255,255,0.06) inset",
          }}
        >
          {/* Gold top accent line */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent 0%, ${selected.color} 40%, ${selected.color} 60%, transparent 100%)`, opacity: 0.7 }} />
          <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: selected.color }}>{selected.time}</div>
          <h3 style={{ marginBottom: 12, fontSize: 20, fontWeight: 700, lineHeight: 1.3, color: "var(--bm-text)" }}>{selected.title}</h3>
          <p style={{ marginBottom: 20, fontSize: 13, lineHeight: 1.75, color: "var(--bm-text3)" }}>{selected.body}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {selected.chips.map((chip) => (
              <span key={chip} className="bm-chip">
                {chip}
              </span>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ── Hero dashboard mockup — upgraded to show "before vs after" ───────────────
function HeroMockup() {
  const [view, setView] = useState<"before" | "after">("before");

  useEffect(() => {
    const timer = setTimeout(() => setView("after"), 1800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className="relative overflow-hidden rounded-[var(--r-xl)] border border-[var(--bm-border2)] shadow-[0_18px_48px_rgba(0,0,0,0.45)] sm:rounded-[var(--r-xl)] sm:shadow-[0_32px_80px_rgba(0,0,0,0.6)]"
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
        {/* View toggle */}
        <div
          className="flex h-6 overflow-hidden rounded-md mx-auto sm:mx-4"
          style={{ border: "1px solid var(--bm-border2)", background: "var(--bm-bg3)" }}
        >
          {(["before", "after"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "0 10px",
                fontSize: 9,
                fontWeight: 700,
                fontFamily: "inherit",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                border: "none",
                cursor: "pointer",
                transition: "all 0.2s",
                background: view === v ? "var(--bm-accent)" : "transparent",
                color: view === v ? "var(--bm-text-inv)" : "var(--bm-text3)",
              }}
            >
              {v === "before" ? "Without" : "With BuildMind"}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {view === "before" ? (
          <motion.div key="before" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }} className="flex flex-col gap-3 p-4 sm:p-5">
            <p className="text-[10px] uppercase tracking-widest text-[var(--bm-text3)]">Your task list</p>
            {[
              "Write landing page",
              "Fix pricing",
              "Talk to users",
              "Update roadmap",
              "Research competitors",
            ].map((task, i) => (
              <div key={task} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 10,
                background: "var(--bm-bg3)", border: "1px solid var(--bm-border)",
                opacity: 1 - i * 0.12,
              }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, border: "1.5px solid var(--bm-border3)", flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: "var(--bm-text3)" }}>{task}</span>
              </div>
            ))}
            <p style={{ fontSize: 11, color: "var(--bm-text4)", textAlign: "center", marginTop: 4 }}>
              5 tasks. No priority. Which one actually matters today?
            </p>
          </motion.div>
        ) : (
          <motion.div key="after" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }} className="flex flex-col gap-4 p-4 sm:p-5">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: "var(--bm-accent-dim)", color: "var(--bm-accent)", border: "1px solid var(--bm-accent-bd)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Prototype Stage
              </span>
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: "rgba(167,139,250,0.10)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.25)", fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}>
                <Brain size={8} /> 3-agent loop
              </span>
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: "rgba(74,184,176,0.08)", color: "var(--bm-teal)", border: "1px solid rgba(74,184,176,0.2)", fontWeight: 600 }}>
                ✓ YC Partner
              </span>
            </div>
            {/* Single action */}
            <div style={{ padding: 0, borderRadius: "var(--r-xl)", border: "1px solid var(--bm-accent-bd)" }}>
              <div style={{ background: "var(--bm-bg2)", borderRadius: 14, padding: "14px 16px" }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--bm-text)", lineHeight: 1.45, margin: "0 0 8px" }}>
                  Record a 3-min Loom. Send to 5 founders. Today.
                </p>
                <p style={{ fontSize: 10, color: "var(--bm-accent)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 8px" }}>
                  Step 1: Edit script below → Step 2: Copy → Step 3: Send to 3+ people
                </p>
                <div style={{ background: "var(--bm-bg3)", borderRadius: 9, padding: "10px 12px", fontSize: 11, color: "var(--bm-text3)", fontStyle: "italic" }}>
                  "Hey — I built a rough prototype for [problem]. Watch 3 mins and tell me what breaks?"
                </div>
              </div>
            </div>
            {/* Metrics */}
            <div className="grid grid-cols-3 gap-2">
              {[{ label: "Score", val: "81" }, { label: "Streak", val: "14d" }, { label: "Confidence", val: "4/5" }].map((m) => (
                <div key={m.label} style={{ padding: "8px 10px", borderRadius: 9, background: "var(--bm-bg3)", border: "1px solid var(--bm-border)" }}>
                  <span style={{ fontSize: 9, color: "var(--bm-text3)", display: "block", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{m.label}</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: "var(--bm-text)" }}>{m.val}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Feature cards ─────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: Brain,
    title: "Reflexion Loop",
    desc: "Generator writes your task. Critic rejects or approves. Refiner sharpens. The agent chain turns your context into one specific next move.",
    badge: "Core engine",
    badgeColor: "var(--bm-accent)",
  },
  {
    icon: Sparkles,
    title: "Morning Briefing",
    desc: "Every day at 7am, one action card is generated from your overnight context. Open. Read. Execute. That's the whole interaction.",
    badge: "Daily",
    badgeColor: "var(--bm-amber)",
  },
  {
    icon: TrendingUp,
    title: "Momentum Score",
    desc: "A single number that tracks execution health. It rises when you act, decays when you don't, and folds streaks, check-ins, and confidence into one signal.",
    badge: "Live",
    badgeColor: "var(--bm-teal)",
  },
  {
    icon: Flame,
    title: "Rotating Critic Personas",
    desc: "YC partner, growth hacker, cynical user, and domain expert modes cycle weekly. Each attacks the same product from a different angle.",
    badge: "Weekly rotate",
    badgeColor: "#A78BFA",
  },
  {
    icon: Shield,
    title: "Recovery Mode",
    desc: "When confidence drops for multiple days, the system shifts register: softer language, smaller actions, and re-grounding before the next push.",
    badge: "Auto-trigger",
    badgeColor: "var(--bm-red)",
  },
  {
    icon: Activity,
    title: "Founder Memory",
    desc: "Every reflection, outcome, and check-in builds context. The AI remembers your history, so actions get sharper as it learns what works for you.",
    badge: "Memory",
    badgeColor: "var(--bm-accent)",
  },
];

// ── Demo Modal ────────────────────────────────────────────────────────────────
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
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-6xl max-h-[92vh] overflow-y-auto rounded-[var(--r-xl)]" style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border2)" }}>
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
          <div className="relative rounded-[var(--r-xl)] overflow-hidden" style={{ background: "var(--bm-bg)", border: "1px solid var(--bm-border)" }}>
            <button
              type="button"
              onClick={handlePlay}
              className={`absolute inset-0 z-10 flex items-center justify-center transition-opacity ${playing ? "pointer-events-none opacity-0" : "opacity-100"}`}
              style={{ background: "rgba(0,0,0,0.28)" }}
              aria-label="Play demo video"
            >
              <span className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-[var(--r-xl)] active:scale-95" style={{ background: "var(--bm-accent)" }}>
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
              poster="/logo/buildmind-og-image.png"
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
                Watch how a founder moves from idea to execution with projects, daily actions, milestones, scoring, and AI coaching in one workspace.
              </p>
            </div>
            <Link href="/auth/login" className="shrink-0">
              <Button size="sm">
                Start Building Free <ArrowRight size={12} />
              </Button>
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Risk severity ─────────────────────────────────────────────────────────────
type RiskSeverity = "Critical" | "High" | "Medium" | "Low";

function severityVariant(s: RiskSeverity) {
  if (s === "Critical") return "danger";
  if (s === "High") return "warning";
  if (s === "Medium") return "info";
  return "neutral";
}

interface RiskItem { category: string; severity: RiskSeverity; description: string; mitigation: string; }
interface BreakResult { overallRisk: RiskSeverity; risks: RiskItem[]; summary: string; }
interface BreakPublicResponse {
  success?: boolean; error?: string;
  data?: { verdict?: string; kill_reasons?: string[]; brutal_advice?: string; survival_probability?: number; differentiation_plan?: string[]; };
}
interface PublicStats { founders?: number; projects?: number; milestones?: number; weekly_tasks?: number; }

// ── Break My Startup ──────────────────────────────────────────────────────────
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
      setResult({ overallRisk, summary: data?.verdict ?? "Stress test complete. Review the risks before deciding what to build next.", risks });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="html-section px-5 py-[60px] sm:px-8 sm:py-24" style={{ borderTop: subtleSectionBorder }}>
      <div className="max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="flex flex-col gap-6">
          <div>
            <Badge variant="danger" dot className="mb-4">Stress-Test Your Idea — Free, No Sign-Up</Badge>
            <h2 className="mb-3 text-3xl font-bold tracking-tight text-[var(--bm-text)] sm:text-4xl">
              Find the one thing most likely to kill your startup
            </h2>
            <p className="text-base leading-relaxed text-[var(--bm-text2)] sm:text-lg">
              Paste your idea. The same AI that runs inside BuildMind stress-tests it against the real failure modes — not generic advice, specific threats.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="Describe your startup idea or current model — what you're building, who it's for, how you make money..."
              className="h-44 w-full resize-none rounded-[var(--r-xl)] p-4 text-base outline-none transition-all duration-150 sm:h-36 sm:text-sm"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", color: "var(--bm-text)", fontFamily: "inherit", backdropFilter: "blur(8px)" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(232,197,71,0.45)"; e.currentTarget.style.boxShadow = "0 0 0 1px rgba(232,197,71,0.18), 0 0 20px rgba(232,197,71,0.07)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)"; e.currentTarget.style.boxShadow = "none"; }}
            />
            <Button onClick={handleBreak} loading={loading} disabled={!idea.trim()} size="lg" className="w-full self-start sm:w-auto">
              {!loading && <AlertTriangle size={16} />}
              Break My Startup →
            </Button>
          </div>

          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-sm p-4 rounded-[var(--r-xl)]" style={{ background: "rgba(224,85,85,0.08)", border: "1px solid rgba(224,85,85,0.2)", color: "var(--bm-red)" }}>
              <AlertCircle size={16} />{error}
            </motion.div>
          )}

          {loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-[var(--r-xl)] p-4 border border-[var(--bm-border)] bg-[var(--bm-bg3)] animate-pulse flex flex-col gap-2">
                  <div className="h-4 w-32 rounded-full bg-[var(--bm-bg4)]" />
                  <div className="h-3 w-full rounded-full bg-[var(--bm-bg4)] opacity-70" />
                  <div className="h-3 w-5/6 rounded-full bg-[var(--bm-bg4)] opacity-50" />
                </div>
              ))}
            </motion.div>
          )}

          {result && !loading && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-[var(--bm-text2)]">Overall Risk Level:</span>
                <Badge variant={severityVariant(result.overallRisk)} size="md" dot>{result.overallRisk}</Badge>
              </div>
              {result.summary && <p className="text-sm text-[var(--bm-text2)] leading-relaxed">{sanitizeOutput(result.summary)}</p>}
              {(result.risks ?? []).map((risk, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                  <Card className="p-4 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--bm-text)]">{risk.category}</span>
                      <Badge variant={severityVariant(risk.severity)} dot>{risk.severity}</Badge>
                    </div>
                    <p className="text-sm text-[var(--bm-text2)] leading-relaxed">{sanitizeOutput(risk.description)}</p>
                    <div className="flex items-start gap-2 text-xs p-2.5 rounded-lg mt-1" style={{ background: "var(--bm-bg3)", color: "var(--bm-text3)" }}>
                      <Shield size={12} className="shrink-0 mt-0.5" style={{ color: "var(--bm-accent)" }} />
                      <span>{sanitizeOutput(risk.mitigation)}</span>
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

// ── Pricing section ───────────────────────────────────────────────────────────
function PricingSection() {
  return (
    <section className="html-section px-5 py-[60px] sm:px-8 sm:py-24" style={{ borderTop: subtleSectionBorder }}>
      <div className="mx-auto max-w-[740px]">
        <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-10 text-center">
          <h2 className="mb-3 text-3xl font-bold tracking-tight text-[var(--bm-text)]">
            The system works while you're not.
          </h2>
          <p className="text-[var(--bm-text3)] text-base">Pick how much of your decision-making you want handed back to you.</p>
        </motion.div>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Free */}
          <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.05 }}>
            <div className="bm-glass bm-glass-hover" style={{ borderRadius: 20, padding: 28, display: "flex", flexDirection: "column", gap: 20, height: "100%" }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Free</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em" }}>$0</div>
                <p className="text-sm text-[var(--bm-text3)] mt-2 leading-relaxed">
                  See the next move BuildMind would give you — no commitment, no signup required for the stress-test.
                </p>
              </div>
              <ul className="flex flex-col gap-3 flex-1">
                {[
                  "Morning Briefing — 3 days/week",
                  "One stress-test per session (Break My Startup)",
                  "5 actions per week",
                  "3 AI messages per day",
                  "Momentum Score (Level 1)",
                  "1 project",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[var(--bm-text2)]">
                    <ChevronRight size={14} className="shrink-0 mt-0.5" style={{ color: "var(--bm-accent)" }} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/auth/login">
                <Button variant="secondary" size="md" className="w-full html-btn-secondary">
                  Start Free
                </Button>
              </Link>
            </div>
          </motion.div>

          {/* Builder */}
          <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}>
            <div className="bm-pricing-featured" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#09090A", textTransform: "uppercase", letterSpacing: "0.08em", background: "var(--bm-accent)", padding: "3px 10px", borderRadius: 10 }}>Builder</span>
                  <span style={{ fontSize: 10, color: "var(--bm-text3)" }}>Most popular</span>
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em" }}>$39 <span style={{ fontSize: 14, fontWeight: 400, color: "var(--bm-text3)" }}>/month</span></div>
                <p className="text-sm text-[var(--bm-text2)] mt-2 leading-relaxed">
                  The system reads your context overnight and tells you the one move that matters. You open it and execute.
                </p>
              </div>
              <ul className="flex flex-col gap-3 flex-1">
                {[
                  "Daily Morning Briefing - every day",
                  "Full Reflexion Loop (3-agent chain)",
                  "Unlimited AI tasks + messages",
                  "Rotating Critic Personas (4 weekly)",
                  "Full Momentum Score with decay warnings",
                  "Recovery Mode - when confidence drops",
                  "Emotional language layer at trigger moments",
                  "Evening check nudges",
                  "Founder memory - AI remembers your history",
                  "Unlimited projects",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[var(--bm-text)]">
                    <ChevronRight size={14} className="shrink-0 mt-0.5" style={{ color: "var(--bm-accent)" }} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/auth/login">
                <Button size="md" className="w-full">
                  Start Builder — $39/mo <ArrowRight size={14} />
                </Button>
              </Link>
              <p style={{ fontSize: 11, color: "var(--bm-text4)", textAlign: "center" }}>
                BuildMind notices what you avoid — and calls it out.
              </p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Founders already building — real week-one users */}
      <div className="mt-14 border-t pt-12" style={{ borderColor: "var(--bm-border)" }}>
        <p className="text-[11px] font-bold uppercase tracking-widest mb-8" style={{ color: "var(--bm-text3)" }}>What founders say</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            { quote: "BuildMind helped me move from scattered ideas to a focused daily execution rhythm.", name: "Julius Abbey" },
            { quote: "The milestones made the next step obvious, so I spent less time guessing and more time shipping.", name: "Israel Akortia" },
            { quote: "It feels like having a calm operator beside me, keeping the work practical and measurable.", name: "Samuel Bempong" },
          ].map((t) => (
            <blockquote key={t.name} className="m-0 rounded-[var(--r-xl)] p-5" style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border2)" }}>
              <p className="text-sm font-medium leading-relaxed text-[var(--bm-text)]">"{t.quote}"</p>
              <footer className="mt-5 text-xs font-semibold text-[var(--bm-text3)]">{t.name}</footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Stats floor — used only if the server/API cannot return live counts ───────
const STATS_FLOOR = { founders: 1, projects: 1, milestones: 0, weekly_tasks: 0 };

function normalizePublicStats(stats?: PublicStats) {
  return {
    founders:     Math.max(stats?.founders     ?? 0, STATS_FLOOR.founders),
    projects:     Math.max(stats?.projects     ?? 0, STATS_FLOOR.projects),
    milestones:   Math.max(stats?.milestones   ?? 0, STATS_FLOOR.milestones),
    weekly_tasks: stats?.weekly_tasks ?? STATS_FLOOR.weekly_tasks,
  };
}

// ── Main landing page ─────────────────────────────────────────────────────────
// ── World Canvas — ambient atmosphere layer ───────────────────────────────────
function WorldCanvas() {
  const starsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = starsRef.current;
    if (!el) return;
    // Generate 90 stars as small divs
    for (let i = 0; i < 90; i++) {
      const s = document.createElement("div");
      const sz  = Math.random() * 1.4 + 0.3;
      const dur = (Math.random() * 5 + 3).toFixed(1);
      const del = (Math.random() * 5).toFixed(1);
      const op  = (Math.random() * 0.4 + 0.1).toFixed(2);
      Object.assign(s.style, {
        position: "absolute",
        width: `${sz}px`, height: `${sz}px`,
        borderRadius: "50%",
        background: "#fff",
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        opacity: op,
        animation: `bm-star-twinkle ${dur}s ${del}s ease-in-out infinite`,
        pointerEvents: "none",
      });
      el.appendChild(s);
    }
  }, []);

  return (
    <>
      {/* Inject star keyframes once */}
      <style>{`
        @keyframes bm-star-twinkle {
          0%,100% { opacity: var(--op, .2); transform: scale(1); }
          50%      { opacity: calc(var(--op, .2) * 3); transform: scale(1.5); }
        }
        @keyframes bm-grid-drift {
          0%   { transform: translateY(0); }
          100% { transform: translateY(56px); }
        }
      `}</style>

      <div
        aria-hidden
        style={{
          position: "fixed", inset: 0,
          pointerEvents: "none", zIndex: 0, overflow: "hidden",
        }}
      >
        {/* Drifting grid */}
        <div style={{
          position: "absolute", inset: -56,
          backgroundImage: "none",
          backgroundSize: "52px 52px",
          animation: "bm-grid-drift 22s linear infinite",
          maskImage: "radial-gradient(ellipse 82% 68% at 50% 38%, rgba(0,0,0,0.8) 12%, transparent 82%)",
          WebkitMaskImage: "radial-gradient(ellipse 82% 68% at 50% 38%, rgba(0,0,0,0.8) 12%, transparent 82%)",
        }} />

        {/* Glow orbs */}
        <div style={{ position:"absolute", width:700, height:500, top:-80, left:"50%", transform:"translateX(-50%)", background:"radial-gradient(ellipse, rgba(92,200,138,0.07) 0%, rgba(74,184,176,0.03) 40%, transparent 70%)", pointerEvents:"none" }} />
        <div style={{ position:"absolute", width:500, height:400, top:"50%", left:"62%", transform:"translate(-50%,-50%)", background:"radial-gradient(ellipse, rgba(74,184,176,0.04) 0%, transparent 65%)", pointerEvents:"none" }} />
        <div style={{ position:"absolute", width:400, height:300, bottom:"12%", left:"12%", background:"radial-gradient(ellipse, rgba(155,127,232,0.03) 0%, transparent 65%)", pointerEvents:"none" }} />

        {/* Stars */}
        <div ref={starsRef} style={{ position:"absolute", inset:0 }} />

        {/* Trajectory SVG — the BuildMind visual signature */}
        <svg
          style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0.42 }}
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          <defs>
            <linearGradient id="bm-tg1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="transparent"/>
              <stop offset="20%"  stopColor="rgba(92,200,138,0.18)"/>
              <stop offset="80%"  stopColor="rgba(92,200,138,0.18)"/>
              <stop offset="100%" stopColor="transparent"/>
            </linearGradient>
            <linearGradient id="bm-tg2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="transparent"/>
              <stop offset="25%"  stopColor="rgba(74,184,176,0.12)"/>
              <stop offset="75%"  stopColor="rgba(74,184,176,0.12)"/>
              <stop offset="100%" stopColor="transparent"/>
            </linearGradient>
            <linearGradient id="bm-tg3" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="transparent"/>
              <stop offset="30%"  stopColor="rgba(155,127,232,0.07)"/>
              <stop offset="70%"  stopColor="rgba(155,127,232,0.07)"/>
              <stop offset="100%" stopColor="transparent"/>
            </linearGradient>
            <filter id="bm-gf">
              <feGaussianBlur stdDeviation="1.5" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          {/* Trajectory curves */}
          <path id="bm-tp1"
            d="M -40 720 C 160 660 320 440 520 380 C 720 320 900 460 1080 300 C 1220 180 1340 130 1480 90"
            stroke="url(#bm-tg1)" strokeWidth="0.75" strokeDasharray="5 8"/>
          <path id="bm-tp2"
            d="M 60 820 C 240 760 420 580 620 500 C 820 420 1020 520 1200 360 C 1320 260 1400 200 1480 160"
            stroke="url(#bm-tg2)" strokeWidth="0.6" strokeDasharray="3 10" opacity="0.62"/>
          <path id="bm-tp3"
            d="M 300 880 C 500 820 680 660 880 580 C 1080 500 1240 580 1440 420"
            stroke="url(#bm-tg3)" strokeWidth="0.45" strokeDasharray="2 12" opacity="0.35"/>

          {/* Animated dots on primary trajectory */}
          <circle r="3.5" fill="#5CC88A" opacity="0.85" filter="url(#bm-gf)">
            <animateMotion dur="9s" repeatCount="indefinite" begin="0s"><mpath href="#bm-tp1"/></animateMotion>
          </circle>
          <circle r="2.5" fill="#5CC88A" opacity="0.55">
            <animateMotion dur="9s" repeatCount="indefinite" begin="3s"><mpath href="#bm-tp1"/></animateMotion>
          </circle>
          <circle r="2" fill="#4AB8B0" opacity="0.5">
            <animateMotion dur="9s" repeatCount="indefinite" begin="6s"><mpath href="#bm-tp1"/></animateMotion>
          </circle>

          {/* Dots on secondary */}
          <circle r="2.5" fill="#4AB8B0" opacity="0.4">
            <animateMotion dur="12s" repeatCount="indefinite" begin="1.5s"><mpath href="#bm-tp2"/></animateMotion>
          </circle>
          <circle r="2" fill="#4AB8B0" opacity="0.3">
            <animateMotion dur="12s" repeatCount="indefinite" begin="7s"><mpath href="#bm-tp2"/></animateMotion>
          </circle>

          {/* Dot on tertiary */}
          <circle r="1.8" fill="#9B7FE8" opacity="0.35">
            <animateMotion dur="15s" repeatCount="indefinite" begin="3s"><mpath href="#bm-tp3"/></animateMotion>
          </circle>
        </svg>
      </div>
    </>
  );
}

const landingShellStyle = {
  background: "var(--bm-bg)",
  color: "var(--bm-text)",
  position: "relative",
} as CSSProperties;

const subtleSectionBorder = "1px solid rgba(255,255,255,0.06)";

function LandingAestheticLayer() {
  return (
    <style>{`
      /* ── Base ──────────────────────────────────────────────────────────────── */
      .bm-landing-skin {
        -webkit-font-smoothing: antialiased;
        --glass-bg:      rgba(255,255,255,0.030);
        --glass-border:  rgba(255,255,255,0.082);
        --glass-shine:   rgba(255,255,255,0.055);
        --glass-shadow:  0 8px 32px rgba(0,0,0,0.52), 0 1px 0 rgba(255,255,255,0.05) inset;
        --accent-glow:   rgba(232,197,71,0.18);
        --accent-glow-lg:rgba(232,197,71,0.10);
        --gold: #E8C547;
        --gold-dim: rgba(232,197,71,0.12);
        --gold-border: rgba(232,197,71,0.25);
      }

      /* ── Typography ────────────────────────────────────────────────────────── */
      .bm-landing-skin .gradient-text {
        background: linear-gradient(135deg, #E8C547 0%, #F5D97A 45%, #C9A82E 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .bm-landing-skin .gradient-text-subtle {
        background: linear-gradient(135deg, var(--bm-text) 0%, rgba(240,240,238,0.7) 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      /* ── Transition base ───────────────────────────────────────────────────── */
      .bm-landing-skin button,
      .bm-landing-skin a {
        transition: color .18s ease, background .18s ease, border-color .18s ease,
                    box-shadow .18s ease, transform .15s ease, opacity .18s ease;
      }

      /* ── Glass card — the signature surface ─────────────────────────────────
         Used for hero panel, feature cards, pricing, any "floating" element.
         Layered: dark base + glass overlay + top-edge shine + luminous border. */
      .bm-landing-skin .bm-glass {
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        box-shadow: var(--glass-shadow);
        backdrop-filter: blur(24px) saturate(140%);
        -webkit-backdrop-filter: blur(24px) saturate(140%);
        position: relative;
        overflow: hidden;
      }
      /* Top-edge shine — the one element that makes flat look premium */
      .bm-landing-skin .bm-glass::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent 0%, var(--glass-shine) 30%, rgba(255,255,255,0.10) 50%, var(--glass-shine) 70%, transparent 100%);
        pointer-events: none;
        z-index: 1;
      }

      /* Gold-accented glass — for hero panel and featured elements */
      .bm-landing-skin .bm-glass-gold {
        background: linear-gradient(135deg, rgba(232,197,71,0.055) 0%, rgba(255,255,255,0.018) 60%, rgba(232,197,71,0.025) 100%);
        border: 1px solid var(--gold-border);
        box-shadow: 0 0 0 1px rgba(232,197,71,0.08), 0 24px 64px rgba(0,0,0,0.56), 0 1px 0 rgba(232,197,71,0.18) inset;
        backdrop-filter: blur(32px) saturate(160%);
        -webkit-backdrop-filter: blur(32px) saturate(160%);
        position: relative;
        overflow: hidden;
      }
      .bm-landing-skin .bm-glass-gold::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent 0%, rgba(232,197,71,0.5) 30%, rgba(232,197,71,0.7) 50%, rgba(232,197,71,0.5) 70%, transparent 100%);
        pointer-events: none;
        z-index: 1;
      }

      /* Deep glass — for code/terminal blocks, secondary panels */
      .bm-landing-skin .bm-glass-deep {
        background: rgba(9,9,10,0.72);
        border: 1px solid rgba(255,255,255,0.07);
        box-shadow: 0 4px 24px rgba(0,0,0,0.48), 0 1px 0 rgba(255,255,255,0.04) inset;
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
      }

      /* ── Hover states on glass cards ────────────────────────────────────────── */
      .bm-landing-skin .bm-glass-hover {
        transition: border-color .22s ease, box-shadow .22s ease, transform .18s ease;
      }
      .bm-landing-skin .bm-glass-hover:hover {
        border-color: rgba(255,255,255,0.13);
        box-shadow: 0 12px 48px rgba(0,0,0,0.58), 0 1px 0 rgba(255,255,255,0.08) inset;
        transform: translateY(-2px);
      }

      /* ── Section layout ──────────────────────────────────────────────────────── */
      .bm-landing-skin .html-section {
        position: relative;
        z-index: 1;
      }
      .bm-landing-skin .html-panel {
        background: var(--bm-bg2);
        border: 1px solid var(--bm-border2);
        box-shadow: 0 0 0 1px rgba(232,197,71,0.06), 0 24px 64px rgba(0,0,0,0.5);
      }

      /* ── Secondary button override ───────────────────────────────────────────── */
      .bm-landing-skin .html-btn-secondary {
        background: rgba(255,255,255,0.045) !important;
        color: var(--bm-text2) !important;
        border-color: var(--glass-border) !important;
        backdrop-filter: blur(8px);
        box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset !important;
      }
      .bm-landing-skin .html-btn-secondary:hover {
        background: rgba(255,255,255,0.075) !important;
        color: var(--bm-text) !important;
        border-color: rgba(255,255,255,0.14) !important;
      }

      /* ── Feature chips / pill badges ─────────────────────────────────────────── */
      .bm-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 10px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.04em;
        border: 1px solid rgba(255,255,255,0.09);
        background: rgba(255,255,255,0.05);
        color: var(--bm-text3);
        backdrop-filter: blur(8px);
      }
      .bm-chip-gold {
        border-color: var(--gold-border);
        background: var(--gold-dim);
        color: var(--gold);
      }

      /* ── Glow dot (live indicator) ───────────────────────────────────────────── */
      .bm-live-dot {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: var(--bm-accent);
        box-shadow: 0 0 0 3px rgba(232,197,71,0.18), 0 0 12px rgba(232,197,71,0.4);
        animation: bm-pulse-gold 2s ease-in-out infinite;
        display: inline-block; flex-shrink: 0;
      }
      @keyframes bm-pulse-gold {
        0%,100% { box-shadow: 0 0 0 3px rgba(232,197,71,0.18), 0 0 12px rgba(232,197,71,0.4); }
        50%      { box-shadow: 0 0 0 5px rgba(232,197,71,0.08), 0 0 20px rgba(232,197,71,0.55); }
      }

      /* ── Stat counter cards ──────────────────────────────────────────────────── */
      .bm-stat-card {
        padding: 20px 22px;
        border-radius: 16px;
        background: rgba(255,255,255,0.028);
        border: 1px solid rgba(255,255,255,0.08);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        position: relative;
        overflow: hidden;
      }
      .bm-stat-card::after {
        content: '';
        position: absolute;
        bottom: 0; left: 0; right: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(232,197,71,0.25), transparent);
      }

      /* ── Section divider gradient ────────────────────────────────────────────── */
      .bm-divider {
        height: 1px;
        background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 30%, rgba(232,197,71,0.15) 50%, rgba(255,255,255,0.08) 70%, transparent 100%);
        margin: 0;
        border: none;
      }

      /* ── Agent pipeline node ─────────────────────────────────────────────────── */
      @keyframes bm-agent-active {
        0%,100% { border-color: rgba(255,255,255,0.08); box-shadow: none; }
        50% { border-color: var(--node-color, rgba(232,197,71,0.4)); box-shadow: 0 0 20px var(--node-glow, rgba(232,197,71,0.10)); }
      }
      @keyframes bm-travel-h {
        0% { left: -8px; opacity: 0; }
        10%,90% { opacity: 1; }
        100% { left: calc(100% + 8px); opacity: 0; }
      }
      @keyframes bm-travel-v {
        0% { top: -8px; opacity: 0; }
        10%,90% { opacity: 1; }
        100% { top: calc(100% + 8px); opacity: 0; }
      }
      @keyframes bm-output-appear {
        from { opacity: 0; transform: translateY(10px) scale(.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      /* ── Scroll-reveal base (handled by framer-motion) ───────────────────────── */
      .bm-landing-skin .html-soft-panel {
        background: rgba(255,255,255,0.025);
        border: 1px solid rgba(255,255,255,0.07);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
      }

      /* ── Timeline connector ─────────────────────────────────────────────────── */
      .bm-timeline-line {
        position: absolute;
        left: 19px; top: 44px; bottom: 0;
        width: 1px;
        background: linear-gradient(to bottom, rgba(232,197,71,0.25) 0%, rgba(255,255,255,0.05) 60%, transparent 100%);
      }

      /* ── Noise texture overlay (hero depth) ─────────────────────────────────── */
      .bm-noise {
        position: absolute; inset: 0;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E");
        pointer-events: none;
        z-index: 0;
        opacity: 0.6;
        mix-blend-mode: overlay;
      }

      /* ── Pricing card ring ──────────────────────────────────────────────────── */
      .bm-pricing-featured {
        background: linear-gradient(135deg, rgba(232,197,71,0.08) 0%, rgba(232,197,71,0.03) 50%, rgba(255,255,255,0.02) 100%);
        border: 1px solid rgba(232,197,71,0.28);
        box-shadow: 0 0 0 1px rgba(232,197,71,0.08), 0 24px 64px rgba(0,0,0,0.56), 0 0 80px rgba(232,197,71,0.07);
        backdrop-filter: blur(32px) saturate(150%);
        -webkit-backdrop-filter: blur(32px) saturate(150%);
        position: relative;
        overflow: hidden;
        border-radius: 20px;
      }
      .bm-pricing-featured::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent 0%, rgba(232,197,71,0.6) 40%, rgba(232,197,71,0.8) 50%, rgba(232,197,71,0.6) 60%, transparent 100%);
        z-index: 1;
      }

      /* ── Ambient glow behind hero panel ─────────────────────────────────────── */
      .bm-hero-glow {
        position: absolute;
        border-radius: 50%;
        pointer-events: none;
        filter: blur(60px);
      }

      /* ── Dribbble-style hero: rounded glass "window" + dramatic burst glow ──── */
      .bm-hero-window {
        position: relative;
        border-radius: 28px;
        overflow: hidden;
        background: radial-gradient(ellipse 140% 90% at 50% 0%, rgba(232,197,71,0.10) 0%, rgba(232,197,71,0.025) 35%, transparent 65%),
                    var(--bm-bg2);
        border: 1px solid var(--glass-border);
        box-shadow: 0 24px 80px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.04) inset;
      }
      .bm-hero-burst {
        position: absolute;
        top: -28%;
        left: 50%;
        transform: translateX(-50%);
        width: 700px;
        height: 380px;
        background: radial-gradient(ellipse 50% 50% at 50% 0%, rgba(232,197,71,0.22) 0%, rgba(232,197,71,0.06) 35%, transparent 70%);
        filter: blur(70px);
        pointer-events: none;
        z-index: 0;
        animation: bm-burst-breathe 8s ease-in-out infinite;
      }
      @keyframes bm-burst-breathe {
        0%,100% { opacity: 0.6; transform: translateX(-50%) scale(1); }
        50%     { opacity: 0.9; transform: translateX(-50%) scale(1.06); }
      }
      .bm-hero-window-glow-line {
        position: absolute;
        top: 0; left: 10%; right: 10%;
        height: 1px;
        background: linear-gradient(90deg, transparent 0%, rgba(232,197,71,0.5) 50%, transparent 100%);
        z-index: 0;
        pointer-events: none;
      }

      /* ── Staggered float-in for hero cards ───────────────────────────────────
         Each card fades in, slides up slightly, with a configurable delay via
         the --float-delay custom property. Applied on mount only (no loop). */
      @keyframes bm-float-in {
        from { opacity: 0; transform: translateY(24px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      .bm-float-card {
        animation: bm-float-in 0.7s var(--float-delay, 0s) cubic-bezier(0.16, 1, 0.3, 1) both;
      }

      /* ── Gentle ambient drift for floating glass cards (post entrance) ──────
         Subtle vertical bob, like the cards are weightless. Different periods
         per card (via --drift-duration) avoid them moving in sync. */
      @keyframes bm-card-drift {
        0%,100% { transform: translateY(0px); }
        50%     { transform: translateY(-6px); }
      }
      .bm-drift {
        animation: bm-card-drift var(--drift-duration, 6s) ease-in-out infinite;
        animation-delay: var(--float-delay, 0s);
      }

      /* ── Star keyframes (kept from original) ────────────────────────────────── */
      @keyframes bm-star-twinkle {
        0%,100% { opacity: var(--op, .2); transform: scale(1); }
        50% { opacity: calc(var(--op, .2) * 3); transform: scale(1.5); }
      }
      @keyframes bm-grid-drift {
        0%   { transform: translateY(0); }
        100% { transform: translateY(56px); }
      }
      @keyframes bm-pulse {
        0%,100% { opacity: 0.6; }
        50% { opacity: 1; }
      }
    `}</style>
  );
}

export default function LandingPageClient({ initialStats }: { initialStats?: PublicStats }) {
  const [stats, setStats] = useState(() => normalizePublicStats(initialStats));
  const [demoOpen, setDemoOpen] = useState(false);

  // Fix #9: Fetch stats immediately on mount (no stale module-level promise),
  // then subscribe to Supabase realtime for instant live updates.
  useEffect(() => {
    // 1. Fetch current counts immediately
    fetch("/api/public/stats", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: PublicStats) =>
        setStats(normalizePublicStats(d))
      )
      .catch(() => {});

    // 2. Subscribe to realtime changes — re-fetch on any project/milestone insert
    let channel: { unsubscribe: () => void } | null = null;
    import("@/lib/supabase/client").then(({ createClient }) => {
      const supabase = createClient();
      const refresh = () =>
        fetch("/api/public/stats", { cache: "no-store" })
          .then((r) => r.json())
          .then((d: PublicStats) =>
            setStats((prev) => ({
              ...normalizePublicStats(d),
              weekly_tasks: d.weekly_tasks ?? prev.weekly_tasks,
            }))
          )
          .catch(() => {});

      channel = supabase
        .channel("public-stats-live")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "projects" }, refresh)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "milestones" }, refresh)
        .subscribe();
    }).catch(() => {});

    return () => {
      import("@/lib/supabase/client").then(({ createClient }) => {
        if (channel) channel.unsubscribe();
      }).catch(() => {});
    };
  }, []);

  return (
    <div className="bm-landing-skin min-h-screen flex flex-col" style={landingShellStyle}>
      <LandingAestheticLayer />
      {/* ── World Canvas: ambient atmosphere ── */}
      <WorldCanvas />

      {/* Navbar */}
      <nav
        className="sticky top-0 z-50 flex h-16 items-center justify-between gap-3 px-4 sm:px-6"
        style={{
          background: "rgba(9,9,10,0.75)",
          backdropFilter: "blur(20px) saturate(150%)",
          WebkitBackdropFilter: "blur(20px) saturate(150%)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          boxShadow: "0 1px 0 rgba(232,197,71,0.06)",
          position: "relative",
          zIndex: 50,
        }}
      >
        <div className="flex items-center gap-2">
          <BrandMark size={32} href="/" />
          <span className="font-semibold text-sm text-[var(--bm-text)]">BuildMind</span>
        </div>

        <div className="hidden md:flex items-center gap-6 text-sm text-[var(--bm-text2)]">
          <a href="#how" className="hover:text-[var(--bm-text)] transition-colors">How it works</a>
          <a href="#features" className="hover:text-[var(--bm-text)] transition-colors">Features</a>
          <a href="#break" className="hover:text-[var(--bm-text)] transition-colors">Stress-Test</a>
          <a href="#pricing" className="hover:text-[var(--bm-text)] transition-colors">Pricing</a>
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
      <section className="html-section flex min-h-[calc(100vh-64px)] items-center px-5 pb-16 pt-14 sm:px-8 sm:pb-20 sm:pt-20 lg:pb-24">
        {/* Ambient glow behind the right panel */}
        <div className="bm-hero-glow" style={{ width: 600, height: 600, top: "5%", right: "-8%", background: "radial-gradient(ellipse, rgba(232,197,71,0.07) 0%, transparent 70%)" }} />
        <div className="bm-hero-glow" style={{ width: 400, height: 400, bottom: "10%", left: "30%", background: "radial-gradient(ellipse, rgba(74,144,217,0.05) 0%, transparent 70%)" }} />

        <div className="bm-hero-window mx-auto w-full max-w-[1180px] px-5 py-12 sm:px-10 sm:py-16 lg:px-14 lg:py-20">
          <div className="bm-hero-window-glow-line" />
          <div className="bm-hero-burst" />

          <div className="relative z-[1] grid w-full items-center gap-12 md:grid-cols-2 lg:gap-16">
          {/* Left */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="flex flex-col gap-5 sm:gap-6">
            {/* Live pill */}
            <span style={{ background: "rgba(232,197,71,0.08)", border: "1px solid rgba(232,197,71,0.22)", color: "rgba(232,197,71,0.85)", borderRadius: 999, padding: "5px 14px", fontSize: 11, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8, width: "fit-content", backdropFilter: "blur(8px)", letterSpacing: "0.03em" }}>
              <span className="bm-live-dot" />
              The next move, already decided
            </span>

            <h1 style={{ fontSize: "clamp(2.6rem,4.5vw,4rem)", fontWeight: 800, lineHeight: 1.06, letterSpacing: "-0.03em", color: "var(--bm-text)" }}>
              The next move is
              <br />
              <span className="font-display italic gradient-text">already decided.</span>
            </h1>

            <p style={{ maxWidth: 400, fontSize: 15, lineHeight: 1.75, color: "var(--bm-text2)" }}>
              BuildMind watches your startup context and tells you the one highest-leverage thing to do next. No lists. No frameworks. Just the next move — generated overnight, waiting when you wake up.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href="/auth/login" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto">
                  Start Building Free <ArrowRight size={16} />
                </Button>
              </Link>
              <Button size="lg" variant="secondary" onClick={() => setDemoOpen(true)} className="html-btn-secondary w-full sm:w-auto">
                <Play size={14} />
                Watch 2-min Demo
              </Button>
            </div>

            {/* Social proof pills — live momentum ticker */}
            <div className="flex flex-wrap gap-2 pt-1 sm:pt-2">
              {[
                { label: "Founders building", val: stats.founders },
                { label: "Projects active", val: stats.projects },
                { label: "Milestones completed", val: stats.milestones },
              ].map((s) => (
                <div
                  key={s.label}
                  className="inline-flex w-fit items-center justify-start gap-1.5 rounded-xl px-3 py-1.5 text-xs"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", backdropFilter: "blur(10px)" }}
                >
                  <span style={{ fontWeight: 600, color: "var(--bm-text)" }}>{s.val.toLocaleString()}</span>
                  <span style={{ color: "var(--bm-text3)" }}>{s.label}</span>
                </div>
              ))}
              {stats.weekly_tasks > 0 && (
                <div
                  className="inline-flex w-fit items-center justify-start gap-1.5 rounded-xl px-3 py-1.5 text-xs"
                  style={{ background: "rgba(232,197,71,0.07)", border: "1px solid rgba(232,197,71,0.22)", backdropFilter: "blur(10px)" }}
                >
                  <span className="bm-live-dot" style={{ width: 5, height: 5 }} />
                  <span style={{ fontWeight: 600, color: "var(--bm-accent)" }}>
                    {stats.weekly_tasks.toLocaleString()}
                  </span>
                  <span style={{ color: "var(--bm-text3)" }}>daily tasks this week</span>
                </div>
              )}
            </div>
          </motion.div>

          {/* Right — Reflexion Loop agent pipeline */}
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.15 }} className="relative mt-2 md:mt-0">
            <div className="absolute inset-0 -z-10" style={{ background: "transparent", filter: "blur(20px)", transform: "scale(1.2)" }} />
            <HeroReflexionPipeline />
          </motion.div>
          </div>
        </div>
      </section>

      <section id="how" className="html-section px-5 py-[60px] sm:px-8 sm:py-24" style={{ borderTop: subtleSectionBorder }}>
        <div className="mx-auto max-w-[1100px]">
          <DayTimeline />
        </div>
      </section>

      {/* Interactive Reflexion Loop Demo */}
      <section className="html-section px-5 py-[60px] sm:px-8 sm:py-24" style={{ borderTop: subtleSectionBorder }}>
        <div className="max-w-3xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-8">
            <Badge variant="info" dot className="mb-4">Try it live — no account needed</Badge>
            <h2 className="text-3xl font-bold tracking-tight text-[var(--bm-text)] mb-3">
              Watch the system decide your next move
            </h2>
            <p className="text-[var(--bm-text2)] text-base leading-relaxed">
              This is the same loop that runs every night while you sleep. Enter your startup idea and watch it generate the one action you should take tomorrow — then go verify it yourself.
            </p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}>
            <ReflexionPipelineDemo />
          </motion.div>
        </div>
      </section>

      {/* Feature Grid */}
      <section id="features" className="html-section px-5 py-[60px] sm:px-8 sm:py-24" style={{ borderTop: subtleSectionBorder }}>
        <div className="mx-auto max-w-[1100px]">
          <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-10 text-left sm:mb-14 sm:text-center">
            <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-3xl">
              Built to remove decisions. Not add more.
            </h2>
            <p className="text-base leading-relaxed text-[var(--bm-text2)]">
              Most tools give you more to manage. BuildMind takes things off your plate — one decision at a time.
            </p>
          </motion.div>

          <div
            className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            style={{ gap: 12 }}
          >
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.07 }}
                  className="bm-glass bm-glass-hover"
                  style={{ borderRadius: 16, padding: "24px", display: "flex", flexDirection: "column", gap: 12 }}
                >
                  <div className="flex items-center justify-between">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 10, background: "rgba(232,197,71,0.10)", border: "1px solid rgba(232,197,71,0.20)", color: "var(--bm-accent)" }}>
                      <Icon size={20} />
                    </div>
                      <span style={{ fontSize: 9, fontWeight: 700, color: f.badgeColor, background: f.badgeColor + "18", border: `1px solid ${f.badgeColor}40`, padding: "2px 8px", borderRadius: 10, textTransform: "uppercase", letterSpacing: "0.06em", backdropFilter: "blur(4px)" }}>
                        {f.badge}
                      </span>
                    </div>
                    <h3 style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--bm-text)", margin: 0 }}>{f.title}</h3>
                    <p style={{ fontSize: 12, lineHeight: 1.65, color: "var(--bm-text3)", margin: 0 }}>{f.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Break My Startup — interactive hook, no login needed */}
      <div id="break"><BreakMyStartupSection /></div>

      {/* §4 Pricing + Testimonials */}
      <div id="pricing"><PricingSection /></div>

      {/* Final CTA */}
      <section
        className="relative overflow-hidden px-5 py-[60px] text-center sm:px-8 sm:py-24"
        style={{ borderTop: "1px solid var(--bm-border)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "transparent" }}
        />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative z-[1] mx-auto max-w-[560px]"
        >
          <h2
            className="font-display italic text-[clamp(2rem,4vw,3.2rem)] font-bold leading-[1.1] tracking-tight text-[var(--bm-text)]"
            style={{ marginBottom: 16 }}
          >
            Stop deciding
            <br />
            what to do next.
          </h2>
          <p className="mx-auto mb-8 text-[15px] leading-[1.65] text-[var(--bm-text2)]">
            Let the system watch your context and tell you the move. Every morning, before you've had to think.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/auth/login">
              <button
                className="inline-flex h-[46px] items-center gap-1.5 rounded-[var(--r-xl)] px-7 text-[15px] font-semibold transition-all hover:brightness-105 active:scale-95"
                style={{ background: "var(--grad-primary)", color: "#0C0C0D" }}
              >
                Start Building Free <ArrowRight size={16} />
              </button>
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 text-center text-xs" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", color: "var(--bm-text3)", background: "rgba(9,9,10,0.6)", backdropFilter: "blur(8px)" }}>
        © {new Date().getFullYear()} BuildMind. Built for founders who ship.
      </footer>

      {demoOpen && <DemoModal onClose={() => setDemoOpen(false)} />}
    </div>
  );
}
