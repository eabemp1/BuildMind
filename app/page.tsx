"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
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

// ── "A Day With BuildMind" timeline data ──────────────────────────────────────
const DAY_TIMELINE = [
  {
    time: "7:00 AM",
    event: "Morning Briefing arrives",
    detail: "Agent A read your last reflection and built today's action overnight.",
    color: "var(--bm-accent)",
    icon: Sparkles,
  },
  {
    time: "9:20 AM",
    event: "Task sent to 3 founders",
    detail: "You copied the outreach script. Streak extended to 14 days.",
    color: "var(--bm-teal)",
    icon: Activity,
  },
  {
    time: "2:00 PM",
    event: "Two replies received",
    detail: "Momentum score rises from 74 → 81. Pattern detector notes traction.",
    color: "var(--bm-accent)",
    icon: TrendingUp,
  },
  {
    time: "6:00 PM",
    event: "Evening check triggers",
    detail: "Confidence at 4 — system notes 3rd consecutive strong day. No Recovery Mode needed.",
    color: "var(--bm-blue)",
    icon: Clock,
  },
  {
    time: "11:59 PM",
    event: "Reflexion Loop queued",
    detail: "Agents A, B, C scheduled to debate your outcome and prepare tomorrow's action.",
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
                background: "linear-gradient(135deg, var(--bm-accent-bd) 0%, rgba(74,184,176,0.2) 100%)",
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

// ── "A Day With BuildMind" section ────────────────────────────────────────────
function DayTimeline() {
  const [active, setActive] = useState<number | null>(null);

  return (
    <div style={{ position: "relative" }}>
      {/* Vertical line */}
      <div
        style={{
          position: "absolute",
          left: 19,
          top: 24,
          bottom: 24,
          width: 1,
          background: "linear-gradient(180deg, var(--bm-accent-bd), var(--bm-border), transparent)",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {DAY_TIMELINE.map((item, i) => {
          const Icon = item.icon;
          const isActive = active === i;
          return (
            <motion.div
              key={item.time}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              onClick={() => setActive(isActive ? null : i)}
              style={{
                display: "flex", gap: 16, alignItems: "flex-start",
                padding: "16px 0", cursor: "pointer",
              }}
            >
              {/* Dot */}
              <div style={{
                width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                background: isActive ? item.color + "20" : "var(--bm-bg3)",
                border: `1px solid ${isActive ? item.color + "44" : "var(--bm-border)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.2s",
              }}>
                <Icon size={14} color={isActive ? item.color : "var(--bm-text4)"} />
              </div>

              <div style={{ flex: 1, paddingTop: 4 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: item.color, fontVariantNumeric: "tabular-nums" }}>
                    {item.time}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--bm-text)" }}>
                    {item.event}
                  </span>
                </div>
                <AnimatePresence>
                  {isActive && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{ fontSize: 13, color: "var(--bm-text3)", margin: 0, lineHeight: 1.6, overflow: "hidden" }}
                    >
                      {item.detail}
                    </motion.p>
                  )}
                </AnimatePresence>
                {!isActive && (
                  <p style={{ fontSize: 12, color: "var(--bm-text4)", margin: 0, lineHeight: 1.5 }}>{item.detail}</p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
      <p style={{ fontSize: 11, color: "var(--bm-text4)", marginTop: 8, paddingLeft: 54 }}>
        Tap any event to expand. The system runs whether you're watching or not.
      </p>
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
            <div style={{ padding: 1, borderRadius: 15, background: "linear-gradient(135deg, var(--bm-accent-bd), rgba(74,184,176,0.18))" }}>
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
    desc: "Three Groq agents in sequence: Generator writes your task, a rotating Critic (YC partner / growth hacker / cynical user) rejects or approves it, Refiner sharpens the final version. All in under 2 seconds.",
    badge: "Core engine",
    badgeColor: "var(--bm-accent)",
  },
  {
    icon: Target,
    title: "Confidence Gate",
    desc: "You rate 1–5 daily. Three consecutive days below 2 and BuildMind auto-shifts you into Recovery Mode — lighter tasks, a different prompt register, no streak pressure.",
    badge: "Founder wellbeing",
    badgeColor: "var(--bm-teal)",
  },
  {
    icon: Zap,
    title: "Startup Score",
    desc: "Composite of validation signal, execution output, and momentum — recalculated on every check-in. Tells you whether you're building or just staying busy.",
    badge: "Real-time",
    badgeColor: "var(--bm-amber)",
  },
  {
    icon: Flame,
    title: "Rotating Critic Personas",
    desc: "Week 1: sceptical YC partner. Week 2: aggressive growth hacker. Week 3: the cynical early adopter. Same product, four entirely different threat models — rotated so advice doesn't go stale.",
    badge: "Anti-echo-chamber",
    badgeColor: "#A78BFA",
  },
  {
    icon: LayoutDashboard,
    title: "Daily Command Center",
    desc: "One action per day, built from yesterday's reflection. Includes an editable outreach script and destination links (X, Indie Hackers, Product Hunt, WhatsApp). No deciding where to post.",
    badge: "One task rule",
    badgeColor: "var(--bm-accent)",
  },
  {
    icon: Globe,
    title: "Public Founder Pages",
    desc: "A live record of your build — milestones, scores, momentum. Shareable with investors, co-founders, or your future self.",
    badge: "Accountability",
    badgeColor: "var(--bm-blue)",
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
              <span className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full text-white shadow-2xl transition-transform active:scale-95" style={{ background: "var(--grad-primary)" }}>
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
interface PublicStats { founders?: number; projects?: number; milestones?: number; }

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
    <section className="px-5 py-16 sm:px-6 sm:py-24" style={{ background: "var(--bm-bg2)", borderTop: "1px solid var(--bm-border)" }}>
      <div className="max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="flex flex-col gap-6">
          <div>
            <Badge variant="danger" dot className="mb-4">Stress-Test Your Idea — Free, No Sign-Up</Badge>
            <h2 className="mb-3 text-3xl font-bold tracking-tight text-[var(--bm-text)] sm:text-4xl">
              What's the biggest risk threatening your startup right now?
            </h2>
            <p className="text-base leading-relaxed text-[var(--bm-text2)] sm:text-lg">
              Paste your idea. The same AI that runs inside BuildMind will find your top vulnerabilities — brutally, honestly, constructively.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="Describe your startup idea or current model — what you're building, who it's for, how you make money..."
              className="h-44 w-full resize-none rounded-xl p-4 text-base outline-none transition-all duration-150 focus:ring-1 sm:h-36 sm:text-sm"
              style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", color: "var(--bm-text)", fontFamily: "inherit" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--bm-accent)"; e.currentTarget.style.boxShadow = "0 0 0 1px var(--bm-accent-bd)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--bm-border2)"; e.currentTarget.style.boxShadow = "none"; }}
            />
            <Button onClick={handleBreak} loading={loading} disabled={!idea.trim()} size="lg" className="w-full self-start sm:w-auto">
              {!loading && <AlertTriangle size={16} />}
              Break My Startup →
            </Button>
          </div>

          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-sm p-4 rounded-xl" style={{ background: "rgba(224,85,85,0.08)", border: "1px solid rgba(224,85,85,0.2)", color: "var(--bm-red)" }}>
              <AlertCircle size={16} />{error}
            </motion.div>
          )}

          {loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl p-4 border border-[var(--bm-border)] bg-[var(--bm-bg3)] animate-pulse flex flex-col gap-2">
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
              {result.summary && <p className="text-sm text-[var(--bm-text2)] leading-relaxed">{result.summary}</p>}
              {(result.risks ?? []).map((risk, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                  <Card className="p-4 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--bm-text)]">{risk.category}</span>
                      <Badge variant={severityVariant(risk.severity)} dot>{risk.severity}</Badge>
                    </div>
                    <p className="text-sm text-[var(--bm-text2)] leading-relaxed">{risk.description}</p>
                    <div className="flex items-start gap-2 text-xs p-2.5 rounded-lg mt-1" style={{ background: "var(--bm-bg3)", color: "var(--bm-text3)" }}>
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

// ── Pricing section ───────────────────────────────────────────────────────────
function PricingSection() {
  return (
    <section className="px-5 py-16 sm:px-6 sm:py-24" style={{ borderTop: "1px solid var(--bm-border)" }}>
      <div className="max-w-4xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-10 text-center">
          <h2 className="mb-3 text-3xl font-bold tracking-tight text-[var(--bm-text)]">
            One decision. Already made.
          </h2>
          <p className="text-[var(--bm-text3)] text-base">Pick what level of intelligence you need.</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Free */}
          <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.05 }}>
            <Card className="p-6 flex flex-col gap-5 h-full">
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Free</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em" }}>$0</div>
                <p className="text-sm text-[var(--bm-text3)] mt-2 leading-relaxed">
                  Test your idea once. See what BuildMind would do — no commitment.
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
                <Button variant="secondary" size="md" className="w-full">
                  Start Free
                </Button>
              </Link>
            </Card>
          </motion.div>

          {/* Builder */}
          <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}>
            <div style={{ padding: 1, borderRadius: 15, background: "linear-gradient(135deg, var(--bm-accent-bd), rgba(74,184,176,0.2))" }}>
              <Card className="p-6 flex flex-col gap-5 h-full" style={{ borderRadius: 14 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text-inv)", textTransform: "uppercase", letterSpacing: "0.08em", background: "var(--bm-accent)", padding: "2px 8px", borderRadius: 10 }}>Builder</span>
                    <span style={{ fontSize: 10, color: "var(--bm-text3)" }}>Most popular</span>
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em" }}>$19 <span style={{ fontSize: 14, fontWeight: 400, color: "var(--bm-text3)" }}>/month</span></div>
                  <p className="text-sm text-[var(--bm-text2)] mt-2 leading-relaxed">
                    Wake up to a system that already decided your next move. Every day.
                  </p>
                </div>
                <ul className="flex flex-col gap-3 flex-1">
                  {[
                    "Daily Morning Briefing — every day",
                    "Full Reflexion Loop (3-agent chain)",
                    "Unlimited AI tasks + messages",
                    "Rotating Critic Personas (4 weekly)",
                    "Full Momentum Score with decay warnings",
                    "Recovery Mode — when confidence drops",
                    "Emotional language layer at trigger moments",
                    "Evening check nudges",
                    "Founder memory — AI remembers your history",
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
                    Start Builder — $19/mo <ArrowRight size={14} />
                  </Button>
                </Link>
                <p style={{ fontSize: 11, color: "var(--bm-text4)", textAlign: "center" }}>
                  BuildMind notices what you avoid — and calls it out.
                </p>
              </Card>
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
            <blockquote key={t.name} className="m-0 rounded-xl p-5" style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border2)" }}>
              <p className="text-sm font-medium leading-relaxed text-[var(--bm-text)]">"{t.quote}"</p>
              <footer className="mt-5 text-xs font-semibold text-[var(--bm-text3)]">{t.name}</footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Stats floor — shown instantly before API responds ─────────────────────────
const STATS_FLOOR = { founders: 1, projects: 1, milestones: 0 };

// ── Main landing page ─────────────────────────────────────────────────────────
export default function LandingPage() {
  const [stats, setStats] = useState(STATS_FLOOR);
  const [demoOpen, setDemoOpen] = useState(false);

  // Fix #9: Fetch stats immediately on mount (no stale module-level promise),
  // then subscribe to Supabase realtime for instant live updates.
  useEffect(() => {
    // 1. Fetch current counts immediately
    fetch("/api/public/stats", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: PublicStats) =>
        setStats({
          founders:   Math.max(d.founders   ?? 0, STATS_FLOOR.founders),
          projects:   Math.max(d.projects   ?? 0, STATS_FLOOR.projects),
          milestones: Math.max(d.milestones ?? 0, STATS_FLOOR.milestones),
        })
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
            setStats({
              founders:   Math.max(d.founders   ?? 0, STATS_FLOOR.founders),
              projects:   Math.max(d.projects   ?? 0, STATS_FLOOR.projects),
              milestones: Math.max(d.milestones ?? 0, STATS_FLOOR.milestones),
            })
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
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bm-bg)", color: "var(--bm-text)" }}>
      {/* Navbar */}
      <nav
        className="sticky top-0 z-50 flex h-16 items-center justify-between gap-3 px-4 sm:px-6"
        style={{ background: "rgba(15,15,16,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--bm-border)" }}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center" style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border)" }}>
            <Image src="/logo/buildmind-mark.svg" alt="BuildMind" width={24} height={24} priority />
          </div>
          <span className="font-semibold text-sm text-[var(--bm-text)]">BuildMind</span>
        </div>

        <div className="hidden md:flex items-center gap-6 text-sm text-[var(--bm-text2)]">
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
      <section className="flex-1 px-5 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20 lg:pb-32">
        <div className="mx-auto grid max-w-7xl items-center gap-10 md:grid-cols-2 lg:gap-16">
          {/* Left */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="flex flex-col gap-5 sm:gap-6">
            <span style={{ background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)", color: "var(--bm-accent)", borderRadius: 999, padding: "3px 10px", fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", display: "inline-flex", alignItems: "center", width: "fit-content" }}>
              AI Founder Operating System
            </span>

            <h1 className="text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Most founders guess
              <br />
              <span className="gradient-text">what to do next.</span>
            </h1>

            <p className="max-w-xl text-base leading-relaxed text-[var(--bm-text2)] sm:text-lg">
              BuildMind already decided. Three AI agents debated your last move, stress-tested the options, and queued your highest-leverage action before you woke up.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href="/auth/login" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto">
                  Start Building Free <ArrowRight size={16} />
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

          {/* Right — upgraded "before/after" mockup */}
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.15 }} className="relative mt-2 md:mt-0">
            <div className="absolute inset-0 -z-10" style={{ background: "radial-gradient(ellipse at center, rgba(92,200,138,0.12) 0%, transparent 70%)", filter: "blur(20px)", transform: "scale(1.2)" }} />
            <HeroMockup />
          </motion.div>
        </div>
      </section>

      {/* Interactive Reflexion Loop Demo */}
      <section className="px-5 py-16 sm:px-6 sm:py-20" style={{ background: "var(--bm-bg2)", borderTop: "1px solid var(--bm-border)" }}>
        <div className="max-w-3xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-8">
            <Badge variant="info" dot className="mb-4">Try it live — no account needed</Badge>
            <h2 className="text-3xl font-bold tracking-tight text-[var(--bm-text)] mb-3">
              Watch the system reason through your startup
            </h2>
            <p className="text-[var(--bm-text2)] text-base leading-relaxed">
              This is the same Reflexion Loop that runs inside BuildMind every morning. Enter an idea and watch three agents disagree, reject, and refine in real time.
            </p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}>
            <ReflexionPipelineDemo />
          </motion.div>
        </div>
      </section>

      {/* Feature Grid */}
      <section id="features" className="px-5 py-16 sm:px-6 sm:py-24" style={{ borderTop: "1px solid var(--bm-border)" }}>
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-10 text-left sm:mb-14 sm:text-center">
            <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-3xl">
              Built on genuine mechanics. Not vibes.
            </h2>
            <p className="text-base leading-relaxed text-[var(--bm-text2)]">
              Every feature maps to a specific failure mode solo founders hit. Here's what's running under the hood.
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
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--bm-bg3)", color: "var(--bm-accent)" }}>
                        <Icon size={20} />
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, color: f.badgeColor, background: f.badgeColor + "18", border: `1px solid ${f.badgeColor}33`, padding: "2px 8px", borderRadius: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        {f.badge}
                      </span>
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

      {/* Break My Startup — interactive hook, no login needed */}
      <div id="break"><BreakMyStartupSection /></div>

      {/* §4 Pricing + Testimonials */}
      <div id="pricing"><PricingSection /></div>

      {/* Final CTA */}
      <section className="px-5 py-16 text-center sm:px-6 sm:py-24" style={{ background: "var(--grad-primary)" }}>
        <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="max-w-xl mx-auto flex flex-col gap-5">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Don't just show what BuildMind looks like.
          </h2>
          <p className="text-white/80 text-lg">Experience what it does when you're not doing anything.</p>
          <div className="flex justify-center">
            <Link href="/auth/login">
              <button className="h-12 px-8 rounded-xl bg-white text-sm font-semibold text-[#111] hover:bg-white/90 transition-all active:scale-95 flex items-center gap-2">
                Start Building Free <ArrowRight size={16} />
              </button>
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 text-center text-xs" style={{ borderTop: "1px solid var(--bm-border)", color: "var(--bm-text3)" }}>
        © {new Date().getFullYear()} BuildMind. Built for founders who ship.
      </footer>

      {demoOpen && <DemoModal onClose={() => setDemoOpen(false)} />}
    </div>
  );
}
