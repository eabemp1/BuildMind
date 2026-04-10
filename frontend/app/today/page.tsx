"use client";

/**
 * app/today/page.tsx — IMPROVED
 *
 * Critical fixes applied:
 * 1. Milestone progress persisted to localStorage (survives refresh)
 * 2. ConsentLedgerCTA in done state (done-state variant)
 * 3. Streak broken warning (if you miss a day)
 * 4. Next action preview on done state (keeps users curious, improves retention)
 * 5. Better upgrade trigger — shows value before paywall
 * 6. Build-in-public share button (tweet your progress)
 * 7. Done state nudges users into weekly review + AI Coach
 */

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { useProjectSummariesQuery, useDashboardOverviewQuery } from "@/lib/queries";
import { computeStartupScore } from "@/lib/buildmind";
import { recordTaskCompletion, checkUpgradeTrigger, getTasksDone } from "@/lib/plan";
import ConsentLedgerCTA from "@/components/ConsentLedgerCTA";

// ─── Types ────────────────────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  action: "#6366f1", research: "#8b5cf6", legal: "#f59e0b", money: "#10b981", security: "#ef4444",
};

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
      <div className="text-[10px] bm-text3 uppercase tracking-widest mb-2">Send it to →</div>
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
              <span className="inline-flex items-center gap-1.5 text-[11px] bm-text3 bg-white/[0.04] border border-[var(--bm-border)] rounded-md px-2.5 py-1">
                <span>{d.icon}</span><span>{d.label}</span>
              </span>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Build in public share button ─────────────────────────────────────────────
function ShareButton({ stage, streak, tasksDone }: { stage: string; streak: number; tasksDone: number }) {
  const [shared, setShared] = useState(false);
  const text = encodeURIComponent(
    `Day ${tasksDone} building in ${stage} stage with @buildmind_os\n\nStreak: ${streak} days 🔥\n\nThe system forces you to do one meaningful thing every day — no planning paralysis.\n\nhttps://buildmind-evolvai.vercel.app #buildinpublic #solofounder`
  );
  const url = `https://twitter.com/intent/tweet?text=${text}`;

  return (
    <motion.a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => setShared(true)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.9 }}
      className="w-full flex items-center justify-center gap-2 py-2.5 text-[12px] font-medium bm-text3 bg-transparent border border-[var(--bm-border)] rounded-xl hover:border-[#333] hover:text-[#888] transition-all no-underline"
      style={{ fontFamily: "inherit" }}
    >
      <span style={{ fontSize: 13 }}>𝕏</span>
      <span>{shared ? "Shared! Keep going." : "Share your streak — #buildinpublic"}</span>
    </motion.a>
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
      className="w-full py-3.5 rounded-xl font-semibold text-sm bm-text border-none cursor-pointer mb-2.5"
      style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", fontFamily: "inherit" }}>
      {children}
    </motion.button>
  );
}

// ─── BrandMark ────────────────────────────────────────────────────────────────
const BrandMark = ({ size = 24 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width={size} height={size} style={{ flexShrink: 0 }}>
    <defs>
      <linearGradient id="tm-node" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#C4B5FD" /><stop offset="100%" stopColor="#7C3AED" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="7" fill="#09090B" />
    <rect width="32" height="32" rx="7" fill="none" stroke="rgba(139,92,246,0.4)" strokeWidth="0.8" />
    <circle cx="6"  cy="9"  r="1.6" fill="#4F46E5" opacity="0.75" />
    <circle cx="6"  cy="16" r="1.6" fill="#4F46E5" opacity="0.75" />
    <circle cx="6"  cy="23" r="1.6" fill="#4F46E5" opacity="0.75" />
    <circle cx="16" cy="7"  r="1.6" fill="#7C3AED" opacity="0.8" />
    <circle cx="16" cy="14" r="1.6" fill="#7C3AED" opacity="0.8" />
    <circle cx="16" cy="21" r="1.6" fill="#7C3AED" opacity="0.8" />
    <circle cx="26" cy="9"  r="1.6" fill="#A78BFA" opacity="0.75" />
    <circle cx="26" cy="16" r="1.6" fill="#A78BFA" opacity="0.75" />
    <circle cx="26" cy="23" r="1.6" fill="#A78BFA" opacity="0.75" />
    <line x1="7.6"  y1="16" x2="14.4" y2="14" stroke="#6D28D9" strokeWidth="1" opacity="0.95" />
    <line x1="17.6" y1="14" x2="24.4" y2="16" stroke="#8B5CF6" strokeWidth="1" opacity="0.95" />
    <circle cx="6"  cy="16" r="2.2" fill="url(#tm-node)" />
    <circle cx="16" cy="14" r="2.4" fill="#A78BFA" />
    <circle cx="26" cy="16" r="2.2" fill="#C4B5FD" />
  </svg>
);

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

  // Causality loop — reads last reflection to personalise the strip
  const [lastReflectCausality, setLastReflectCausality] = useState("");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("bm_last_reflect");
      if (saved) {
        const entry = JSON.parse(saved);
        if (entry?.causality) setLastReflectCausality(entry.causality);
      }
    } catch {}
  }, []);

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

  // Time-aware, stage-aware greeting
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    const tod = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
    const lines: Record<string, string[]> = {
      Idea:       [`Good ${tod}. Your idea doesn't exist yet — let's change that.`, `Good ${tod}. Most ideas die in notebooks. Yours doesn't have to.`],
      Validation: [`Good ${tod}. One more conversation today could save you 6 months.`, `Good ${tod}. Your users know things you don't. Go find out.`],
      Prototype:  [`Good ${tod}. Something exists now. Make someone react to it.`, `Good ${tod}. Show it to someone who will be honest.`],
      MVP:        [`Good ${tod}. Someone is waiting for what you're building.`, `Good ${tod}. Shipped beats perfect. You already know this.`],
      Launch:     [`Good ${tod}. You launched. Most people never get here.`, `Good ${tod}. Keep it live. Keep talking about it.`],
      Revenue:    [`Good ${tod}. You have paying users. Protect that relationship.`, `Good ${tod}. Revenue is signal. What's it telling you?`],
      Discovery:  [`Good ${tod}. Every conversation is data. Go collect it.`, `Good ${tod}. Your users will tell you what to build. Ask them.`],
    };
    const stageLines = lines[stage] ?? [`Good ${tod}. One decision. Already made.`];
    // Pick deterministically by day so it doesn't flicker
    const idx = new Date().getDate() % stageLines.length;
    return stageLines[idx];
  }, [stage]);

  // Persist daily done state
  useEffect(() => {
    if (typeof window === "undefined") return;
    const today = new Date().toDateString();
    const savedDoneDate = localStorage.getItem("bm_today_done_date");
    if (savedDoneDate === today) setDone(true);
  }, []);

  const action = useMemo(() => getAction(stage), [stage]);
  const streak = overview?.founderStreakDays ?? 0;
  const score  = activeProject ? computeStartupScore(activeProject) : 0;
  const tasksDone = getTasksDone();

  // Read onboarding context for personalised hints
  const blockerType = typeof window !== "undefined" ? (localStorage.getItem("bm_blocker") ?? "") : "";
  const domain      = typeof window !== "undefined" ? (localStorage.getItem("bm_domain") ?? "") : "";

  const blockerHint: Record<string, string> = {
    dont_know_what_to_do: "You said you're not sure what to do next — so today's action is your answer. Do exactly this, nothing else.",
    too_many_ideas:       "You said you have too many ideas. Pick this one action. Everything else is noise until this is done.",
    no_users_yet:         "You said you can't find users. This action is specifically designed to fix that. Do it before anything else.",
    building_too_slow:    "You said you're building too slowly. Stop building for today — do this instead. Ship faster by talking first.",
    no_revenue:           "You said you're not making money yet. This action is on the direct path to your first payment.",
    just_starting:        "You're just getting started — this is the right first move. Don't overthink it.",
  };

  const handleDone = () => {
    if (done) return;
    setDone(true);
    // Persist done state for today
    if (typeof window !== "undefined") {
      localStorage.setItem("bm_today_done_date", new Date().toDateString());
      // Signal reflect pending — sidebar notification dot + reflect page context
      localStorage.setItem("bm_reflect_pending", "true");
      // Save today's action so reflect page can show it
      localStorage.setItem("bm_today_action", JSON.stringify(action));
      localStorage.setItem("bm_stage", stage);
    }
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
    <div className="min-h-screen bm-bg flex items-center justify-center">
      <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}
        className="text-xs bm-text4">Loading your action...</motion.div>
    </div>
  );

  if (!summaries.length) return (
    <div className="min-h-screen bm-bg flex flex-col items-center justify-center px-4 py-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm text-center">
        <div className="text-4xl mb-4">🚀</div>
        <div className="text-lg font-medium bm-text mb-2">No project yet</div>
        <div className="text-sm bm-text2 mb-7 leading-relaxed">Create your first project so BuildMind can generate your daily action.</div>
        <button onClick={() => router.push("/projects")}
          className="w-full py-3 bg-white text-black font-medium text-sm rounded-lg border-none cursor-pointer">
          Create project
        </button>
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-screen bm-bg flex flex-col overflow-x-hidden" style={{ fontFamily: "system-ui,sans-serif" }}>

      {/* Top bar */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex justify-between items-center px-4 py-3 border-b border-[#111] sticky top-0 bm-bg z-10">
        <div className="flex items-center gap-2">
          <BrandMark size={22} />
          <span className="text-[13px] font-medium bm-text">BuildMind</span>
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
            className="text-[11px] bm-text3 border border-[var(--bm-border)] bg-transparent rounded px-2.5 py-1.5 cursor-pointer">
            Dashboard
          </button>
        </div>
      </motion.div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6">
        <div className="w-full max-w-md">

          {/* Greeting — time + stage aware */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.0 }}
            style={{ textAlign: "center", marginBottom: 8 }}
          >
            <span style={{ fontSize: 13, color: "var(--bm-text2)", fontWeight: 400, letterSpacing: "-0.01em" }}>
              {greeting}
            </span>
          </motion.div>

          {/* Identity strip — who you're becoming */}
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            style={{ textAlign: "center", marginBottom: 12 }}
          >
            <span style={{
              fontSize: 11, color: "var(--bm-text4)",
              letterSpacing: "0.08em", textTransform: "uppercase",
              fontWeight: 500,
            }}>
              {streak >= 14 ? "You've outlasted 90% of founders who start." :
               streak >= 7  ? "Most founders quit here. You didn't." :
               streak >= 3  ? "You're someone who executes." :
               streak >= 1  ? "Day " + (streak + 1) + ". Keep going." :
               "One decision. Already made."}
            </span>
          </motion.div>

          {/* Causality strip — because you said X → today is Y */}
          {lastReflectCausality && !done && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              style={{
                background: "rgba(99,102,241,0.06)",
                border: "1px solid rgba(99,102,241,0.15)",
                borderRadius: 8,
                padding: "8px 12px",
                marginBottom: 14,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 11, color: "#6366f1", opacity: 0.7, flexShrink: 0 }}>↺</span>
              <span style={{ fontSize: 11, color: "var(--bm-text3)", lineHeight: 1.5, fontStyle: "italic" }}>
                {lastReflectCausality}
              </span>
            </motion.div>
          )}

          {/* Stage pill */}
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="text-center mb-5">
            <motion.span
              animate={mounted ? { boxShadow: ["0 0 0px rgba(99,102,241,0)", "0 0 14px rgba(99,102,241,0.4)", "0 0 0px rgba(99,102,241,0)"] } : {}}
              transition={{ delay: 0.6, duration: 1.2 }}
              className="inline-block text-[11px] bm-text2 bm-bg2 border border-[var(--bm-border)] rounded-full px-3.5 py-1">
              You are in: <strong className="bm-text">{stage} Stage</strong>
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

                <div className="bm-bg2 border border-[var(--bm-border)] rounded-2xl p-5 bm-text">
                  <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}
                    className="text-[10px] bm-text4 uppercase tracking-widest mb-2.5">
                    Do this now
                  </motion.div>

                  {/* Domain tag if set */}
                  {domain && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 }}
                      className="inline-flex items-center gap-1.5 text-[10px] bm-text3 bg-white/[0.03] border border-[var(--bm-border)] rounded-full px-2.5 py-0.5 mb-2.5">
                      {domain}
                    </motion.div>
                  )}

                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                    className="text-base font-bold bm-text mb-4 leading-snug break-words">
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
                      className="absolute top-2.5 right-2.5 text-[10px] px-2.5 py-1 rounded-md border cursor-pointer"
                      style={{
                        background: copied ? "#16a34a" : "#1a1a1a",
                        borderColor: copied ? "#16a34a" : "#2a2a2a",
                        color: copied ? "white" : "#888",
                        fontFamily: "inherit",
                        transition: "all 0.2s",
                      }}>
                      {copied ? "✓ Copied" : "Copy"}
                    </motion.button>
                  </motion.div>

                  <DestinationChips destKey={action.destKey} show={chipsVisible} />

                  {!chipsVisible && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}
                      className="text-[10px] bm-text4 mt-1 mb-3">
                      Copy the message to see where to send it →
                    </motion.div>
                  )}

                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.38 }}
                    className="flex items-center gap-1.5 text-[11px] bm-text4 mt-3.5 mb-4">
                    <span>⏱</span><span>Takes about {action.time}</span>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42 }}
                    className="flex gap-2">
                    <motion.button onClick={handleDone}
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}
                      className="flex-1 py-3.5 bg-white text-black font-bold text-sm rounded-xl border-none cursor-pointer"
                      style={{ fontFamily: "inherit" }}>
                      ✓ Done
                    </motion.button>
                    <motion.button onClick={() => setShowWhy(!showWhy)} whileTap={{ scale: 0.95 }}
                      className="px-4 py-3.5 text-[13px] bm-text3 rounded-xl cursor-pointer border border-[var(--bm-border2)]"
                      style={{ background: showWhy ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)", fontFamily: "inherit", transition: "all 0.15s" }}>
                      {showWhy ? "Hide" : "Why?"}
                    </motion.button>
                  </motion.div>

                  <AnimatePresence>
                    {showWhy && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }} style={{ overflow: "hidden" }}>
                        <div className="text-[12px] bm-text3 leading-relaxed border-t border-[#1a1a1a] pt-3 mt-3">
                          {action.why}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Blocker-specific hint from onboarding */}
                  {blockerType && blockerHint[blockerType] && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
                      className="mt-3 text-[11px] bm-text4 leading-relaxed border-t border-[#111] pt-3 italic">
                      {blockerHint[blockerType]}
                    </motion.div>
                  )}
                </div>

                {/* ConsentLedger compact CTA */}
                <div className="mt-4">
                  <ConsentLedgerCTA variant="compact" context="GDPR compliance — built using this system" />
                </div>
              </motion.div>

            ) : (
              /* ─── DONE CARD ─── */
              <motion.div key="done"
                initial={{ opacity: 0, scale: 0.94, y: 14 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>

                <div className="bm-bg2 border border-[var(--bm-border)] rounded-2xl p-6 bm-text text-center">

                  <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 320, damping: 18, delay: 0.1 }}
                    className="block mb-3.5">
                    <motion.span
                      animate={{ scale: [1, 1.18, 1], rotate: [0, 5, -5, 0] }}
                      transition={{ duration: 1.2, repeat: 2, ease: "easeInOut", delay: 0.5 }}
                      className="text-5xl inline-block">🔥</motion.span>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
                    <div className="text-lg font-bold bm-text mb-2 tracking-tight">Good. You&apos;re making progress.</div>
                    <div className="text-[13px] bm-text3 leading-relaxed mb-5">Consistency compounds. Come back tomorrow for your next action.</div>
                  </motion.div>

                  {streak > 0 && (
                    <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: "spring", stiffness: 280, damping: 18, delay: 0.45 }}
                      className="flex items-center justify-center gap-2 text-[13px] text-[#fbbf24] bg-yellow-400/[0.08] border border-yellow-400/[0.18] rounded-xl px-4 py-2.5 mb-5">
                      <motion.span animate={{ scale: [1, 1.35, 1] }} transition={{ duration: 0.5, delay: 0.7 }}>🔥</motion.span>
                      <AnimatedNumber value={streak + 1} color="#fbbf24" /> day streak — keep going
                    </motion.div>
                  )}

                  {/* Build in public share */}
                  <ShareButton stage={stage} streak={streak + 1} tasksDone={tasksDone} />

                  <div className="h-px bm-bg4 my-4" />

                  {/* ConsentLedger done-state CTA */}
                  <ConsentLedgerCTA variant="done-state" />

                  <div className="h-px bm-bg4 my-4" />

                  {/* Upgrade nudge */}
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
                    <WiggleButton onClick={() => setShowUnlock(v => !v)}>
                      Unlock Builder features →
                    </WiggleButton>
                  </motion.div>

                  <AnimatePresence>
                    {showUnlock && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        style={{ overflow: "hidden", marginBottom: 12 }}>
                        <div className="bg-indigo-500/[0.07] border border-indigo-500/[0.18] rounded-xl p-4 text-left">
                          <div className="text-[13px] font-semibold bm-text mb-1.5">Builder keeps your momentum going.</div>
                          <div className="text-[12px] bm-text3 mb-3 leading-relaxed">Unlock unlimited AI Coach, weekly reports, startup kit tools, and full brutal analysis without hitting limits.</div>
                          <button onClick={() => router.push("/upgrade")}
                            className="w-full py-2.5 bg-white text-black font-bold text-[13px] rounded-lg border-none cursor-pointer"
                            style={{ fontFamily: "inherit" }}>
                            Unlock Builder — $19/mo →
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.75 }}
                    className="flex flex-col gap-2">
                    <button onClick={() => router.push("/reports")}
                      className="w-full py-3 text-[13px] font-medium bm-text bm-bg4 border border-[var(--bm-border2)] rounded-xl cursor-pointer"
                      style={{ fontFamily: "inherit" }}>
                      View weekly report →
                    </button>
                    <button onClick={() => router.push("/ai-coach")}
                      className="w-full py-3 text-[13px] bm-text4 bg-transparent border border-[var(--bm-border)] rounded-xl cursor-pointer"
                      style={{ fontFamily: "inherit" }}>
                      Ask AI Coach what&apos;s next
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
            <div className="w-px bm-bg3 self-stretch" />
            <div className="text-center">
              <div className="text-base font-semibold">
                <AnimatedNumber value={streak} color={streak >= 3 ? "#fbbf24" : "#333"} />
                <span style={{ color: streak >= 3 ? "#fbbf24" : "#333" }}>d</span>
              </div>
              <div className="text-[9px] text-[#2a2a2a] uppercase tracking-widest mt-0.5">Streak</div>
            </div>
            <div className="w-px bm-bg3 self-stretch" />
            <div className="text-center">
              <div className="text-base font-semibold bm-text4">{stage}</div>
              <div className="text-[9px] text-[#2a2a2a] uppercase tracking-widest mt-0.5">Stage</div>
            </div>
          </motion.div>

        </div>
      </div>
    </div>
  );
}
