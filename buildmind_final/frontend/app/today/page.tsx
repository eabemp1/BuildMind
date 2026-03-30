"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { useProjectSummariesQuery, useDashboardOverviewQuery } from "@/lib/queries";
import { computeStartupScore } from "@/lib/buildmind";
import { recordTaskCompletion, checkUpgradeTrigger, getTasksDone } from "@/lib/upgrade";

// ─── Brand mark ───────────────────────────────────────────────────────────────
const BrandMark = ({ size = 24 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width={size} height={size} style={{ flexShrink: 0 }}>
    <defs>
      <linearGradient id="tm-node" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#C4B5FD" /><stop offset="100%" stopColor="#7C3AED" />
      </linearGradient>
      <filter id="tm-glow">
        <feGaussianBlur stdDeviation="0.8" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
    <rect width="32" height="32" rx="7" fill="#09090B" />
    <rect width="32" height="32" rx="7" fill="none" stroke="rgba(139,92,246,0.4)" strokeWidth="0.8" />
    <circle cx="6"  cy="9"  r="1.6" fill="#4F46E5" opacity="0.75" />
    <circle cx="6"  cy="16" r="1.6" fill="#4F46E5" opacity="0.75" />
    <circle cx="6"  cy="23" r="1.6" fill="#4F46E5" opacity="0.75" />
    <circle cx="16" cy="7"  r="1.6" fill="#7C3AED" opacity="0.8" />
    <circle cx="16" cy="14" r="1.6" fill="#7C3AED" opacity="0.8" />
    <circle cx="16" cy="21" r="1.6" fill="#7C3AED" opacity="0.8" />
    <circle cx="16" cy="26" r="1.6" fill="#7C3AED" opacity="0.6" />
    <circle cx="26" cy="9"  r="1.6" fill="#A78BFA" opacity="0.75" />
    <circle cx="26" cy="16" r="1.6" fill="#A78BFA" opacity="0.75" />
    <circle cx="26" cy="23" r="1.6" fill="#A78BFA" opacity="0.75" />
    <line x1="7.6"  y1="16" x2="14.4" y2="14" stroke="#6D28D9" strokeWidth="1" opacity="0.95" />
    <line x1="17.6" y1="14" x2="24.4" y2="16" stroke="#8B5CF6" strokeWidth="1" opacity="0.95" />
    <circle cx="6"  cy="16" r="2.2" fill="url(#tm-node)" filter="url(#tm-glow)" />
    <circle cx="16" cy="14" r="2.4" fill="#A78BFA" filter="url(#tm-glow)" />
    <circle cx="26" cy="16" r="2.2" fill="#C4B5FD" filter="url(#tm-glow)" />
  </svg>
);

// ─── Stage-aware destinations ──────────────────────────────────────────────────
const DESTINATIONS: Record<string, { icon: string; label: string; url?: string }[]> = {
  idea:       [{ icon: "𝕏", label: "Twitter / X", url: "https://twitter.com/intent/tweet" }, { icon: "🧵", label: "Indie Hackers", url: "https://www.indiehackers.com" }, { icon: "💬", label: "r/startups", url: "https://reddit.com/r/startups/submit" }, { icon: "📱", label: "Text 3 people" }],
  validation: [{ icon: "𝕏", label: "Twitter / X", url: "https://twitter.com/intent/tweet" }, { icon: "🧵", label: "Indie Hackers", url: "https://www.indiehackers.com" }, { icon: "💼", label: "LinkedIn DM" }, { icon: "📱", label: "WhatsApp" }],
  prototype:  [{ icon: "🚀", label: "Product Hunt", url: "https://www.producthunt.com" }, { icon: "𝕏", label: "Twitter / X", url: "https://twitter.com/intent/tweet" }, { icon: "🧵", label: "Indie Hackers", url: "https://www.indiehackers.com" }, { icon: "🎥", label: "Loom → share" }],
  mvp:        [{ icon: "🚀", label: "Product Hunt", url: "https://www.producthunt.com" }, { icon: "𝕏", label: "Twitter / X", url: "https://twitter.com/intent/tweet" }, { icon: "🧵", label: "Indie Hackers", url: "https://www.indiehackers.com" }, { icon: "💬", label: "WhatsApp" }],
  launch:     [{ icon: "🚀", label: "Product Hunt", url: "https://www.producthunt.com/posts/new" }, { icon: "𝕏", label: "Twitter / X", url: "https://twitter.com/intent/tweet" }, { icon: "🧵", label: "Indie Hackers", url: "https://www.indiehackers.com/post" }, { icon: "📰", label: "Hacker News", url: "https://news.ycombinator.com/submit" }],
  revenue:    [{ icon: "📞", label: "Call directly" }, { icon: "📧", label: "Email personally" }, { icon: "💼", label: "LinkedIn" }, { icon: "𝕏", label: "Twitter DM" }],
};

const ACTIONS: Record<string, { action: string; message: string; why: string; time: string; destKey: string }> = {
  idea:       { action: "Talk to 5 people who have this problem before writing any code.", message: "Hey, quick question — what's your biggest challenge with [your problem area]? I'm researching it and would love 10 minutes.", why: "Every assumption you have about your user is probably wrong. Conversations cost nothing to invalidate them.", time: "2 hours", destKey: "idea" },
  validation: { action: "Send this outreach message to 10 potential users today.", message: "Hey — I'm building something for people who struggle with [problem]. What do you currently do when [problem] happens? Not pitching, just learning.", why: "The Mom Test: ask about their life, not your idea. You'll get honest answers that way.", time: "1–2 hours", destKey: "validation" },
  prototype:  { action: "Record a 3-minute Loom walkthrough and send it to 5 people today.", message: "Hey — I've built a rough prototype for [problem]. Would you watch a 3-minute demo and tell me what confuses you most? Brutal honesty only.", why: "Dropbox got 75K signups from a demo video before writing any backend code. Ship something real.", time: "Under 2 hours", destKey: "prototype" },
  mvp:        { action: "Send your working link to one warm contact before end of day.", message: "Hey — I've been building [product] to solve [problem]. It's rough but working. Would you try it for 10 minutes and tell me what breaks?", why: "The version they see today teaches you more than 3 more days of polishing. Ship it.", time: "30 minutes", destKey: "mvp" },
  launch:     { action: "Post on Product Hunt this week — imperfect listing beats no listing.", message: "We just launched [product] on Product Hunt — it [solves problem] for [target users]. Would love your support and brutal feedback: [link]", why: "You don't need to be ready. You need to be visible. Notion launched imperfect and got 10K users in 24 hours.", time: "3 hours to prepare", destKey: "launch" },
  revenue:    { action: "Call one churned user today — not to win them back, to understand why they left.", message: "Hey [name] — I noticed you stopped using [product]. No sales pitch. I just want to understand what didn't work so I can fix it. 10 minutes?", why: "Churn analysis conversations are the highest-leverage activity at revenue stage. Every answer beats 10 feature ideas.", time: "1 hour", destKey: "revenue" },
};

function getAction(stage: string) {
  const s = stage.toLowerCase();
  if (s.includes("idea")) return ACTIONS.idea;
  if (s.includes("valid") || s.includes("discover")) return ACTIONS.validation;
  if (s.includes("proto")) return ACTIONS.prototype;
  if (s.includes("mvp")) return ACTIONS.mvp;
  if (s.includes("launch")) return ACTIONS.launch;
  if (s.includes("revenue") || s.includes("growth")) return ACTIONS.revenue;
  return ACTIONS.mvp;
}

// ─── Animated count-up ────────────────────────────────────────────────────────
function AnimatedNumber({ value, color }: { value: number; color: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let cur = 0;
    if (value === 0) return;
    const step = Math.ceil(value / 30);
    const t = setInterval(() => {
      cur += step;
      if (cur >= value) { setDisplay(value); clearInterval(t); }
      else setDisplay(cur);
    }, 30);
    return () => clearInterval(t);
  }, [value]);
  return <span style={{ color }}>{display}</span>;
}

// ─── Destination chips ────────────────────────────────────────────────────────
function DestinationChips({ destKey, show }: { destKey: string; show: boolean }) {
  const dests = DESTINATIONS[destKey] ?? DESTINATIONS.mvp;
  return (
    <div className="mt-3 mb-1">
      <div className="text-[10px] text-[#555] uppercase tracking-widest mb-2">Send it to →</div>
      <div className="flex flex-wrap gap-2">
        {dests.map((d, i) => (
          <motion.div key={d.label}
            initial={{ opacity: 0, y: 6, scale: 0.88 }}
            animate={show ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 6, scale: 0.88 }}
            transition={{ delay: show ? 0.06 * i : 0, type: "spring", stiffness: 320, damping: 22 }}>
            {d.url ? (
              <a href={d.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/25 rounded-md px-2.5 py-1 no-underline hover:bg-indigo-500/20 transition-colors">
                <span>{d.icon}</span><span>{d.label}</span><span className="text-[9px] opacity-50">↗</span>
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-[#555] bg-white/[0.04] border border-[#1c1c1c] rounded-md px-2.5 py-1">
                <span>{d.icon}</span><span>{d.label}</span>
              </span>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Wiggle unlock button ─────────────────────────────────────────────────────
function WiggleButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const controls = useAnimation();
  useEffect(() => {
    const t = setTimeout(async () => {
      await controls.start({ x: [0, -6, 6, -4, 4, -2, 2, 0], transition: { duration: 0.5 } });
    }, 2000);
    return () => clearTimeout(t);
  }, [controls]);
  return (
    <motion.button animate={controls} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={onClick}
      className="w-full py-3.5 rounded-xl font-semibold text-sm text-white border-none cursor-pointer mb-2.5"
      style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", fontFamily: "inherit" }}>
      {children}
    </motion.button>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function TodayPage() {
  const router = useRouter();
  const { data: summaries = [], isLoading } = useProjectSummariesQuery();
  const { data: overview } = useDashboardOverviewQuery();

  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  const [chipsVisible, setChipsVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const activeProject = useMemo(() => {
    if (!summaries.length) return null;
    return summaries.reduce((l, c) =>
      new Date(c.lastActivity).getTime() > new Date(l.lastActivity).getTime() ? c : l);
  }, [summaries]);

  const stage = useMemo(() => {
    if (!activeProject) return "MVP";
    const s = (activeProject.startup_stage ?? "").trim();
    if (s) return s;
    const sc = activeProject.validation_strengths?.length ?? 0;
    return sc >= 3 ? "Validation" : sc > 0 ? "Discovery" : "Idea";
  }, [activeProject]);

  const action = useMemo(() => getAction(stage), [stage]);
  const streak = overview?.founderStreakDays ?? 0;
  const score  = activeProject ? computeStartupScore(activeProject) : 0;

  useEffect(() => {
    if (overview?.founderStreakDays) localStorage.setItem("bm_streak", String(overview.founderStreakDays));
  }, [overview?.founderStreakDays]);

  const handleDone = () => {
    if (done) return;
    setDone(true);
    recordTaskCompletion();
    const cur = Number(localStorage.getItem("bm_streak") ?? "1");
    const { shouldUpgrade } = checkUpgradeTrigger(cur);
    if (shouldUpgrade) setTimeout(() => router.push(`/upgrade?tasks=${getTasksDone()}&streak=${cur}`), 2000);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(action.message).catch(() => {});
    setCopied(true);
    setChipsVisible(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}
        className="text-xs text-[#444]">Loading your action...</motion.div>
    </div>
  );

  if (!summaries.length) return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 py-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm text-center">
        <div className="text-4xl mb-4">🚀</div>
        <div className="text-lg font-medium text-white mb-2">No project yet</div>
        <div className="text-sm text-[#888] mb-7 leading-relaxed">Create your first project so BuildMind can generate your daily action.</div>
        <button onClick={() => router.push("/projects")}
          className="w-full py-3 bg-white text-black font-medium text-sm rounded-lg border-none cursor-pointer">
          Create project
        </button>
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-screen bg-black flex flex-col overflow-x-hidden" style={{ fontFamily: "system-ui,sans-serif" }}>

      {/* Top bar */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex justify-between items-center px-4 py-3 border-b border-[#111] sticky top-0 bg-black z-10">
        <div className="flex items-center gap-2">
          <BrandMark size={22} />
          <span className="text-[13px] font-medium text-[#fafafa]">BuildMind</span>
        </div>
        <div className="flex items-center gap-3">
          {streak > 0 && (
            <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.4 }}
              className="flex items-center gap-1 text-xs text-[#fbbf24]">
              <motion.span animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 0.6, delay: 0.8 }}>🔥</motion.span>
              {streak}d
            </motion.div>
          )}
          <button onClick={() => router.push("/dashboard")}
            className="text-[11px] text-[#555] border border-[#1c1c1c] bg-transparent rounded px-2.5 py-1.5 cursor-pointer">
            Dashboard
          </button>
        </div>
      </motion.div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6">
        <div className="w-full max-w-md">

          {/* Stage pill */}
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="text-center mb-5">
            <motion.span
              animate={mounted ? { boxShadow: ["0 0 0px rgba(99,102,241,0)", "0 0 14px rgba(99,102,241,0.4)", "0 0 0px rgba(99,102,241,0)"] } : {}}
              transition={{ delay: 0.6, duration: 1.2 }}
              className="inline-block text-[11px] text-[#888] bg-[#0d0d0d] border border-[#1c1c1c] rounded-full px-3.5 py-1">
              You are in: <strong className="text-white">{stage} Stage</strong>
            </motion.span>
          </motion.div>

          <AnimatePresence mode="wait">
            {!done ? (
              /* ─── ACTION CARD ─── */
              <motion.div key="action"
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.97 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>

                <div className="bg-[#0d0d0d] border border-[#1c1c1c] rounded-2xl p-5 text-white">
                  <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}
                    className="text-[10px] text-[#444] uppercase tracking-widest mb-2.5">
                    Do this now
                  </motion.div>

                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                    className="text-base font-bold text-[#f1f5f9] mb-4 leading-snug break-words">
                    {action.action}
                  </motion.div>

                  {/* Message box */}
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}
                    className="bg-indigo-500/[0.08] border border-indigo-500/[0.18] rounded-xl p-3.5 mb-2.5 relative">
                    <div className="font-mono text-[11px] text-[#94a3b8] leading-relaxed italic pr-16 break-words">
                      &ldquo;{action.message}&rdquo;
                    </div>
                    <motion.button onClick={handleCopy}
                      whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }}
                      animate={copied ? { scale: [1, 1.15, 1] } : {}}
                      transition={copied ? { duration: 0.25, type: "spring", stiffness: 400 } : {}}
                      className="absolute top-2.5 right-2.5 text-[10px] px-2.5 py-1 rounded-md border cursor-pointer"
                      style={{
                        background: copied ? "#16a34a" : "#1a1a1a",
                        borderColor: copied ? "#16a34a" : "#2a2a2a",
                        color: copied ? "white" : "#888",
                        fontFamily: "inherit",
                        transition: "background 0.2s, border-color 0.2s, color 0.2s",
                      }}>
                      {copied ? "✓ Copied" : "Copy"}
                    </motion.button>
                  </motion.div>

                  {/* Destination chips */}
                  <DestinationChips destKey={action.destKey} show={chipsVisible} />

                  {!chipsVisible && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}
                      className="text-[10px] text-[#333] mt-1 mb-3">
                      Copy the message to see where to send it →
                    </motion.div>
                  )}

                  {/* Time */}
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.38 }}
                    className="flex items-center gap-1.5 text-[11px] text-[#444] mt-3.5 mb-4">
                    <span>⏱</span><span>Takes about {action.time}</span>
                  </motion.div>

                  {/* CTA buttons */}
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42 }}
                    className="flex gap-2">
                    <motion.button onClick={handleDone}
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}
                      className="flex-1 py-3.5 bg-white text-black font-bold text-sm rounded-xl border-none cursor-pointer"
                      style={{ fontFamily: "inherit" }}>
                      ✓ Done
                    </motion.button>
                    <motion.button onClick={() => setShowWhy(!showWhy)} whileTap={{ scale: 0.95 }}
                      className="px-4 py-3.5 text-[13px] text-[#555] rounded-xl cursor-pointer border border-[#222]"
                      style={{ background: showWhy ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)", fontFamily: "inherit", transition: "all 0.15s" }}>
                      {showWhy ? "Hide" : "Why?"}
                    </motion.button>
                  </motion.div>

                  <AnimatePresence>
                    {showWhy && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }} style={{ overflow: "hidden" }}>
                        <div className="text-[12px] text-[#555] leading-relaxed border-t border-[#1a1a1a] pt-3 mt-3">
                          {action.why}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>

            ) : (
              /* ─── DONE CARD (Duolingo-style celebration) ─── */
              <motion.div key="done"
                initial={{ opacity: 0, scale: 0.94, y: 14 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>

                <div className="bg-[#0d0d0d] border border-[#1c1c1c] rounded-2xl p-6 text-white text-center">

                  {/* Duolingo fire — springs in, pulses */}
                  <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 320, damping: 18, delay: 0.1 }}
                    className="block mb-3.5">
                    <motion.span
                      animate={{ scale: [1, 1.18, 1], rotate: [0, 5, -5, 0] }}
                      transition={{ duration: 1.2, repeat: 2, ease: "easeInOut", delay: 0.5 }}
                      className="text-5xl inline-block">🔥</motion.span>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
                    <div className="text-lg font-bold text-[#f1f5f9] mb-2 tracking-tight">Good. You&apos;re making progress.</div>
                    <div className="text-[13px] text-[#555] leading-relaxed mb-5">Consistency compounds. Come back tomorrow for your next action.</div>
                  </motion.div>

                  {/* Streak counter — Duolingo tick-up */}
                  {streak > 0 && (
                    <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: "spring", stiffness: 280, damping: 18, delay: 0.45 }}
                      className="flex items-center justify-center gap-2 text-[13px] text-[#fbbf24] bg-yellow-400/[0.08] border border-yellow-400/[0.18] rounded-xl px-4 py-2.5 mb-5">
                      <motion.span animate={{ scale: [1, 1.35, 1] }} transition={{ duration: 0.5, delay: 0.7 }}>🔥</motion.span>
                      <AnimatedNumber value={streak + 1} color="#fbbf24" /> day streak — keep going
                    </motion.div>
                  )}

                  {/* Wiggling unlock CTA */}
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
                    <WiggleButton onClick={() => setShowUnlock(v => !v)}>
                      Unlock Next Step →
                    </WiggleButton>
                  </motion.div>

                  <AnimatePresence>
                    {showUnlock && (
                      <motion.div
                        initial={{ opacity: 0, height: 0, scaleY: 0.8 }}
                        animate={{ opacity: 1, height: "auto", scaleY: 1 }}
                        exit={{ opacity: 0, height: 0, scaleY: 0.8 }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        style={{ overflow: "hidden", transformOrigin: "top", marginBottom: 12 }}>
                        <div className="bg-indigo-500/[0.07] border border-indigo-500/[0.18] rounded-xl p-4 text-left">
                          <div className="text-[13px] font-semibold text-[#f1f5f9] mb-1.5">You&apos;re making real progress.</div>
                          <div className="text-[12px] text-[#555] mb-3 leading-relaxed">Unlock your next steps and keep building.</div>
                          <button onClick={() => router.push("/upgrade")}
                            className="w-full py-2.5 bg-white text-black font-bold text-[13px] rounded-lg border-none cursor-pointer"
                            style={{ fontFamily: "inherit" }}>
                            Continue
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.75 }}
                    className="flex flex-col gap-2">
                    <button onClick={() => router.push("/projects")}
                      className="w-full py-3 text-[13px] font-medium text-white bg-[#141414] border border-[#222] rounded-xl cursor-pointer"
                      style={{ fontFamily: "inherit" }}>
                      View your projects →
                    </button>
                    <button onClick={() => router.push("/ai-coach")}
                      className="w-full py-3 text-[13px] text-[#444] bg-transparent border border-[#1c1c1c] rounded-xl cursor-pointer"
                      style={{ fontFamily: "inherit" }}>
                      Ask BuildMini what&apos;s next
                    </button>
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Score / Streak / Stage row */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
            className="flex items-center justify-center gap-6 mt-5 py-3">
            <div className="text-center">
              <div className="text-base font-semibold">
                <AnimatedNumber value={score} color={score >= 60 ? "#4ade80" : score >= 30 ? "#fbbf24" : "#333"} />
              </div>
              <div className="text-[9px] text-[#2a2a2a] uppercase tracking-widest mt-0.5">Score</div>
            </div>
            <div className="w-px bg-[#111] self-stretch" />
            <div className="text-center">
              <div className="text-base font-semibold">
                <AnimatedNumber value={streak} color={streak >= 3 ? "#fbbf24" : "#333"} />
                <span style={{ color: streak >= 3 ? "#fbbf24" : "#333" }}>d</span>
              </div>
              <div className="text-[9px] text-[#2a2a2a] uppercase tracking-widest mt-0.5">Streak</div>
            </div>
            <div className="w-px bg-[#111] self-stretch" />
            <div className="text-center">
              <div className="text-base font-semibold text-[#444]">{stage}</div>
              <div className="text-[9px] text-[#2a2a2a] uppercase tracking-widest mt-0.5">Stage</div>
            </div>
          </motion.div>

        </div>
      </div>
    </div>
  );
}
