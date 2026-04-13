"use client";

/**
 * app/today/page.tsx — v12
 *
 * What changed vs v11:
 * 1. INLINE REFLECT — after "Done", 3-question micro-reflect appears in the same card.
 *    No router.push('/reflect'). Causality generates inline. No context switch.
 * 2. SCORE DELTA — after reflect submits, shows "Score: 64 → 58" with direction arrow.
 *    Makes the reinforcement loop visible and felt.
 * 3. All previous improvements preserved (streak, causality strip, wiggle, chips, etc.)
 */

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { useProjectSummariesQuery, useDashboardOverviewQuery } from "@/lib/queries";
import { computeStartupScore } from "@/lib/buildmind";
import { computeScoreDelta, applyScoreDelta } from "@/lib/scoring";
import { recordTaskCompletion, checkUpgradeTrigger, getTasksDone } from "@/lib/plan";
import { updateAchievementStats, checkAndUnlockAchievements, getAchievementStats } from "@/lib/achievements";
import { notifyReflectPending, notifyStreakMilestone } from "@/lib/notifications";
import { trackFunnelStep, trackPageView } from "@/lib/onboarding-analytics";
import BuildMindLoader from "@/components/BuildMindLoader";
import { AIVisualWidget } from "@/components/ui/AIVisualWidget";

// ─── Types ────────────────────────────────────────────────────────────────────
type Outcome = "completed" | "blocked" | "partial" | "learned";

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

const OUTCOME_CHIPS: { id: Outcome; emoji: string; label: string; color: string; bg: string }[] = [
  { id: "completed", emoji: "✓", label: "Completed it",      color: "#4ade80", bg: "rgba(74,222,128,0.08)"  },
  { id: "partial",   emoji: "◐", label: "Partly done",       color: "#fbbf24", bg: "rgba(251,191,36,0.08)"  },
  { id: "blocked",   emoji: "✕", label: "Got blocked",       color: "#f87171", bg: "rgba(248,113,113,0.08)" },
  { id: "learned",   emoji: "↯", label: "Learned something", color: "#a78bfa", bg: "rgba(167,139,250,0.08)" },
];

const CONFIDENCE_LABELS = ["", "Lost", "Uncertain", "Steady", "Confident", "Unstoppable"];
const CONFIDENCE_COLORS = ["", "#f87171", "#fbbf24", "#94a3b8", "#6ee7b7", "#4ade80"];

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

// ─── Score Delta display ──────────────────────────────────────────────────────
function ScoreDelta({ before, after }: { before: number; after: number }) {
  const diff = after - before;
  const up = diff > 0;
  const neutral = diff === 0;
  const color = neutral ? "#94a3b8" : up ? "#4ade80" : "#f87171";
  const arrow = neutral ? "→" : up ? "↑" : "↓";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.2 }}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        background: `${color}12`, border: `1px solid ${color}30`,
        borderRadius: 10, padding: "10px 16px", marginBottom: 14,
      }}
    >
      <span style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase" }}>Score</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: "#94a3b8" }}>{before}</span>
      <span style={{ fontSize: 13, color }}>{arrow}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color }}>{after}</span>
      {!neutral && (
        <span style={{ fontSize: 11, color, opacity: 0.8 }}>
          ({up ? "+" : ""}{diff} pts)
        </span>
      )}
    </motion.div>
  );
}

// ─── Inline Reflect Widget ────────────────────────────────────────────────────
function InlineReflect({
  todayAction,
  stage,
  streak,
  scoreBefore,
  onComplete,
}: {
  todayAction: string;
  stage: string;
  streak: number;
  scoreBefore: number;
  onComplete: (causality: string, nextAction: string, scoreAfter: number) => void;
}) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [note, setNote] = useState("");
  const [confidence, setConfidence] = useState(3);
  const [submitting, setSubmitting] = useState(false);

  const notePlaceholder =
    outcome === "blocked"   ? "What stopped you? Be specific — vague blockers don't get solved." :
    outcome === "learned"   ? "What did you learn? One concrete insight." :
    outcome === "partial"   ? "What got done, and what didn't?" :
    "What happened? What will you do differently?";

  function buildFallbackCausality(o: Outcome, n: string, c: number): string {
    if (o === "completed" && c >= 4) return "Because you completed it and feel confident → tomorrow goes deeper.";
    if (o === "completed") return "Because you completed it → tomorrow builds on that momentum.";
    if (o === "blocked") return `Because you got blocked${n ? ` (${n.slice(0, 40)})` : ""} → tomorrow removes that blocker first.`;
    if (o === "partial") return "Because you partially completed it → tomorrow finishes what you started.";
    if (o === "learned") return `Because you learned something → tomorrow applies that insight directly.`;
    return "Based on your reflection → tomorrow's action is calibrated.";
  }

  function buildFallbackNextAction(o: Outcome, s: string): string {
    if (o === "blocked") return "Identify and remove the specific blocker before starting anything else.";
    if (o === "learned") return "Apply what you learned — test the insight with one real user today.";
    if (o === "partial") return "Finish what you started yesterday before adding anything new.";
    return `Continue in ${s} stage — the next step is already waiting for you.`;
  }

  // Score computation uses lib/scoring — single source of truth
  function computeScoreAfter(o: Outcome, c: number, before: number): number {
    return applyScoreDelta(before, computeScoreDelta(o, c));
  }

  async function handleSubmit() {
    if (!outcome) return;
    setSubmitting(true);

    const scoreAfter = computeScoreAfter(outcome, confidence, scoreBefore);
    let causality = buildFallbackCausality(outcome, note, confidence);
    let nextAction = buildFallbackNextAction(outcome, stage);

    try {
      const response = await fetch("/api/ai/reflect-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, note, confidence, stage, todayAction, streak }),
      });
      if (response.ok) {
        const { data } = await response.json();
        if (data?.causality) causality = data.causality;
        if (data?.nextAction) nextAction = data.nextAction;
      }
    } catch {}

    // Persist reflect entry
    try {
      const entry = { outcome, note, confidence, timestamp: Date.now(), causality, nextAction };
      const history = JSON.parse(localStorage.getItem("bm_reflect_history") ?? "[]");
      history.unshift(entry);
      localStorage.setItem("bm_reflect_history", JSON.stringify(history.slice(0, 30)));
      localStorage.setItem("bm_last_reflect", JSON.stringify(entry));
      localStorage.setItem("bm_reflect_pending", "false");
      // Store score delta for future sessions
      localStorage.setItem("bm_last_score_before", String(scoreBefore));
      localStorage.setItem("bm_last_score_after", String(scoreAfter));
      // Achievement tracking
      const curStats = getAchievementStats();
      updateAchievementStats({ reflectionsLogged: curStats.reflectionsLogged + 1 });
      setTimeout(() => checkAndUnlockAchievements(), 800);
      trackFunnelStep("first_reflect");
    } catch {}

    setSubmitting(false);
    onComplete(causality, nextAction, scoreAfter);
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      style={{ overflow: "hidden" }}
    >
      <div style={{
        borderTop: "1px solid rgba(255,255,255,0.06)",
        marginTop: 16, paddingTop: 16,
      }}>
        <div className="text-[10px] bm-text4 uppercase tracking-widest mb-3">
          Quick reflect — what happened?
        </div>

        {/* Outcome chips */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {OUTCOME_CHIPS.map(chip => (
            <button
              key={chip.id}
              onClick={() => setOutcome(chip.id)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: 11, fontWeight: outcome === chip.id ? 600 : 400,
                color: outcome === chip.id ? chip.color : "var(--bm-text3)",
                background: outcome === chip.id ? chip.bg : "transparent",
                border: `1px solid ${outcome === chip.id ? chip.color + "50" : "var(--bm-border)"}`,
                borderRadius: 7, padding: "5px 10px", cursor: "pointer",
                fontFamily: "inherit", transition: "all 0.15s",
              }}
            >
              <span>{chip.emoji}</span><span>{chip.label}</span>
            </button>
          ))}
        </div>

        {/* Note field */}
        <AnimatePresence>
          {outcome && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
            >
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={notePlaceholder}
                rows={2}
                style={{
                  width: "100%", background: "rgba(255,255,255,0.03)",
                  border: "1px solid var(--bm-border)", borderRadius: 8,
                  color: "var(--bm-text)", fontSize: 12, lineHeight: 1.5,
                  padding: "9px 11px", resize: "none", fontFamily: "inherit",
                  marginBottom: 10, boxSizing: "border-box",
                }}
              />

              {/* Confidence slider */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <span style={{ fontSize: 10, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Confidence</span>
                  <span style={{ fontSize: 11, color: CONFIDENCE_COLORS[confidence], fontWeight: 600 }}>
                    {CONFIDENCE_LABELS[confidence]}
                  </span>
                </div>
                <input
                  type="range" min={1} max={5} step={1} value={confidence}
                  onChange={e => setConfidence(Number(e.target.value))}
                  style={{ width: "100%", accentColor: CONFIDENCE_COLORS[confidence] }}
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  width: "100%", padding: "10px 0",
                  background: submitting ? "rgba(99,102,241,0.3)" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                  color: "white", fontWeight: 600, fontSize: 12,
                  borderRadius: 9, border: "none", cursor: submitting ? "not-allowed" : "pointer",
                  fontFamily: "inherit", transition: "all 0.2s",
                }}
              >
                {submitting ? "Calibrating your next action…" : "Save reflection →"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
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
    `Day ${tasksDone} building in ${stage} stage with @buildmind_os\n\nStreak: ${streak} days 🔥\n\nThe system forces you to do one meaningful thing every day — no planning paralysis.\n\nhttps://buildmind.live #buildinpublic #solofounder`
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

  // Inline reflect state
  const [reflectDone, setReflectDone] = useState(false);
  const [generatedCausality, setGeneratedCausality] = useState("");
  const [generatedNextAction, setGeneratedNextAction] = useState("");
  const [scoreAfter, setScoreAfter] = useState<number | null>(null);

  // Causality loop — reads last reflection OR break-my-startup override
  const [lastReflectCausality, setLastReflectCausality] = useState("");
  const [breakOverrideAction, setBreakOverrideAction] = useState<string | null>(null);
  useEffect(() => {
    try {
      // Check for Break My Startup override (fresh within 24h)
      const overrideTs = Number(localStorage.getItem("bm_break_override_timestamp") ?? "0");
      const overrideAction = localStorage.getItem("bm_break_override_action");
      const overrideCausality = localStorage.getItem("bm_break_override_causality");
      const isRecent = Date.now() - overrideTs < 24 * 60 * 60 * 1000;

      if (isRecent && overrideCausality) {
        setLastReflectCausality(overrideCausality);
        if (overrideAction) setBreakOverrideAction(overrideAction);
      } else {
        const saved = localStorage.getItem("bm_last_reflect");
        if (saved) {
          const entry = JSON.parse(saved);
          if (entry?.causality) setLastReflectCausality(entry.causality);
        }
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
    const idx = new Date().getDate() % stageLines.length;
    return stageLines[idx];
  }, [stage]);

  const getTodayKey = () => {
    const now = new Date();
    if (now.getHours() < 4) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday.toLocaleDateString("en-CA");
    }
    return now.toLocaleDateString("en-CA");
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const todayKey = getTodayKey();
    const savedDoneDate = localStorage.getItem("bm_today_done_date");
    if (savedDoneDate === todayKey) setDone(true);

    const interval = setInterval(() => {
      const currentKey = getTodayKey();
      const storedKey = localStorage.getItem("bm_today_done_date");
      if (storedKey && storedKey !== currentKey && typeof window !== "undefined") {
        setDone(false);
      }
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const [showDwellWarning, setShowDwellWarning] = useState(false);
  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => { setShowDwellWarning(true); }, 7000);
    return () => clearTimeout(t);
  }, [done]);

  const action = useMemo(() => getAction(stage), [stage]);
  const streak = overview?.founderStreakDays ?? Number(typeof window !== "undefined" ? localStorage.getItem("bm_streak") ?? "0" : "0");
  const score  = activeProject ? computeStartupScore(activeProject) : 0;
  const tasksDone = getTasksDone();

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
    if (typeof window !== "undefined") {
      localStorage.setItem("bm_today_done_date", getTodayKey());
      localStorage.setItem("bm_reflect_pending", "true");
      localStorage.setItem("bm_today_action", JSON.stringify(action));
      localStorage.setItem("bm_stage", stage);
    }
    recordTaskCompletion();

    const curStats = getAchievementStats();
    const newTasksDone = curStats.tasksDone + 1;
    const curStreak = Number(typeof window !== "undefined" ? localStorage.getItem("bm_streak") ?? "1" : "1");
    const dayKey = new Date().toISOString().split("T")[0];
    const activeDaysRaw = typeof window !== "undefined" ? localStorage.getItem("bm_active_days") ?? "[]" : "[]";
    const activeDays: string[] = JSON.parse(activeDaysRaw);
    if (!activeDays.includes(dayKey)) activeDays.push(dayKey);
    if (typeof window !== "undefined") localStorage.setItem("bm_active_days", JSON.stringify(activeDays));
    updateAchievementStats({ tasksDone: newTasksDone, streak: curStreak, daysActive: activeDays.length });
    setTimeout(() => checkAndUnlockAchievements(), 600);

    try {
      notifyReflectPending();
      notifyStreakMilestone(curStreak);
      trackFunnelStep("first_action_done");
    } catch {}

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

  const handleReflectComplete = (causality: string, nextAction: string, newScore: number) => {
    setGeneratedCausality(causality);
    setGeneratedNextAction(nextAction);
    setScoreAfter(newScore);
    setReflectDone(true);
    // Update causality for next session
    try {
      const existing = JSON.parse(localStorage.getItem("bm_last_reflect") ?? "{}");
      existing.causality = causality;
      localStorage.setItem("bm_last_reflect", JSON.stringify(existing));
    } catch {}
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bm-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <BuildMindLoader />
      </div>
    );
  }

  if (!summaries.length) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bm-bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
        <div className="bm-bg2 border border-[var(--bm-border)] rounded-2xl p-8 text-center" style={{ maxWidth: 400 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🧭</div>
          <div className="text-base font-semibold bm-text mb-2">No project yet</div>
          <div className="text-[13px] bm-text3 mb-5 leading-relaxed">Create your first project to get your daily action.</div>
          <button onClick={() => router.push("/projects")}
            className="w-full py-3 rounded-xl font-semibold text-sm bm-text border-none cursor-pointer"
            style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", fontFamily: "inherit" }}>
            Create project →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bm-bg)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "0 0 60px" }}>
      <div style={{ width: "100%", maxWidth: 480, padding: "32px 20px 0" }}>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <BrandMark size={28} />
            <span className="text-[13px] font-semibold bm-text tracking-tight">BuildMind</span>
          </div>
          <button onClick={() => router.push("/dashboard")}
            className="text-[11px] bm-text4 bg-transparent border border-[var(--bm-border)] rounded-lg px-3 py-1.5 cursor-pointer"
            style={{ fontFamily: "inherit" }}>
            Dashboard
          </button>
        </div>

        {/* Dwell warning */}
        <AnimatePresence>
          {showDwellWarning && !done && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="mb-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-left">
              <div className="text-[11px] text-red-400 font-semibold mb-0.5">You're thinking instead of doing.</div>
              <div className="text-[11px] bm-text4 leading-relaxed">Every minute planning is a minute not executing. Start the action. Adjust after.</div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Greeting */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.0 }}
          style={{ textAlign: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: "var(--bm-text2)", fontWeight: 400, letterSpacing: "-0.01em" }}>
            {greeting}
          </span>
        </motion.div>

        {/* Identity strip */}
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          style={{ textAlign: "center", marginBottom: 12 }}>
          <span style={{
            fontSize: 11, color: "var(--bm-text4)",
            letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500,
          }}>
            {streak >= 14 ? "You've outlasted 90% of founders who start." :
             streak >= 7  ? "Most founders quit here. You didn't." :
             streak >= 3  ? "You're someone who executes." :
             streak >= 1  ? "Day " + (streak + 1) + ". Keep going." :
             "One decision. Already made."}
          </span>
        </motion.div>

        {/* Break My Startup override banner */}
        {breakOverrideAction && !done && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
            style={{
              background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)",
              borderRadius: 10, padding: "10px 14px", marginBottom: 12,
            }}>
            <div style={{ fontSize: 9, color: "#6366f1", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>
              ⚡ Break My Startup directive
            </div>
            <div style={{ fontSize: 12, color: "var(--bm-text2)", lineHeight: 1.55, fontWeight: 500 }}>
              {breakOverrideAction}
            </div>
            <button
              onClick={() => {
                localStorage.removeItem("bm_break_override_action");
                localStorage.removeItem("bm_break_override_causality");
                localStorage.removeItem("bm_break_override_timestamp");
                setBreakOverrideAction(null);
              }}
              style={{ fontSize: 9, color: "#64748b", background: "none", border: "none", cursor: "pointer", marginTop: 6, fontFamily: "inherit" }}
            >
              Dismiss
            </button>
          </motion.div>
        )}

        {/* Causality strip */}
        {lastReflectCausality && !done && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
            style={{
              background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)",
              borderRadius: 8, padding: "8px 12px", marginBottom: 14,
              display: "flex", alignItems: "center", gap: 8,
            }}>
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
                      fontFamily: "inherit", transition: "all 0.2s",
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

                {blockerType && blockerHint[blockerType] && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
                    className="mt-3 text-[11px] bm-text4 leading-relaxed border-t border-[#111] pt-3 italic">
                    {blockerHint[blockerType]}
                  </motion.div>
                )}
              </div>

              <div className="mt-4">
                <a href="/invite" className="block rounded-xl border border-[var(--bm-border)] bg-white/[0.02] px-4 py-3 text-left hover:bg-white/[0.04] transition-colors no-underline">
                  <div className="text-[11px] font-semibold bm-text mb-0.5">Know another solo founder?</div>
                  <div className="text-[10px] bm-text4 leading-relaxed">Invite them — you both get 1 month of Builder free when they complete their first week.</div>
                </a>
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
                  <div className="text-lg font-bold bm-text mb-1 tracking-tight">Good. You're making progress.</div>
                  {!reflectDone && (
                    <div className="text-[12px] bm-text3 leading-relaxed mb-3">
                      Tell the system what happened — it updates your next action.
                    </div>
                  )}
                </motion.div>

                {streak > 0 && (
                  <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 280, damping: 18, delay: 0.45 }}
                    className="flex items-center justify-center gap-2 text-[13px] text-[#fbbf24] bg-yellow-400/[0.08] border border-yellow-400/[0.18] rounded-xl px-4 py-2.5 mb-4">
                    <motion.span animate={{ scale: [1, 1.35, 1] }} transition={{ duration: 0.5, delay: 0.7 }}>🔥</motion.span>
                    <AnimatedNumber value={streak + 1} color="#fbbf24" /> day streak — keep going
                  </motion.div>
                )}

                {/* ── INLINE REFLECT ─────────────────────────────────────────── */}
                <AnimatePresence mode="wait">
                  {!reflectDone ? (
                    <InlineReflect
                      key="reflect-widget"
                      todayAction={action.action}
                      stage={stage}
                      streak={streak}
                      scoreBefore={score}
                      onComplete={handleReflectComplete}
                    />
                  ) : (
                    /* ── POST-REFLECT STATE ─────────────────────────────────── */
                    <motion.div
                      key="reflect-complete"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    >
                      {/* Score delta */}
                      {scoreAfter !== null && (
                        <ScoreDelta before={score} after={scoreAfter} />
                      )}

                      {/* Causality strip */}
                      {generatedCausality && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.15 }}
                          style={{
                            background: "rgba(99,102,241,0.07)",
                            border: "1px solid rgba(99,102,241,0.2)",
                            borderRadius: 10, padding: "10px 14px", marginBottom: 12, textAlign: "left",
                          }}
                        >
                          <div style={{ fontSize: 9, color: "#6366f1", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>
                            Why tomorrow looks different
                          </div>
                          <div style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.55, fontStyle: "italic" }}>
                            {generatedCausality}
                          </div>
                        </motion.div>
                      )}

                      {/* Next action preview */}
                      {generatedNextAction && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.25 }}
                          style={{
                            background: "rgba(74,222,128,0.06)",
                            border: "1px solid rgba(74,222,128,0.2)",
                            borderRadius: 10, padding: "10px 14px", marginBottom: 16, textAlign: "left",
                          }}
                        >
                          <div style={{ fontSize: 9, color: "#4ade80", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>
                            Tomorrow's action (preview)
                          </div>
                          <div style={{ fontSize: 12, color: "var(--bm-text2)", lineHeight: 1.55, fontWeight: 500 }}>
                            {generatedNextAction}
                          </div>
                        </motion.div>
                      )}

                      <div className="text-[11px] bm-text4 mb-4">
                        Reflection saved. System recalibrated.
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <ShareButton stage={stage} streak={streak + 1} tasksDone={tasksDone} />

                <div className="h-px bm-bg4 my-4" />

                {/* Streak insurance */}
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                  className="rounded-xl border border-[var(--bm-border)] bg-white/[0.02] px-4 py-3 text-left mb-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm">🛡️</span>
                    <div className="text-[12px] font-semibold bm-text">Streak insurance</div>
                  </div>
                  <div className="text-[11px] bm-text3 leading-relaxed">Miss a day and your streak is gone. Builder protects one miss per month — your streak survives.</div>
                  <button onClick={() => router.push("/upgrade")}
                    className="mt-2 text-[11px] text-[#a78bfa] bg-transparent border-none cursor-pointer p-0 font-medium"
                    style={{fontFamily:"inherit"}}>
                    Protect your streak →
                  </button>
                </motion.div>

                <div className="h-px bm-bg4 my-4" />

                {/* AI momentum insight — auto-generates after reflect */}
                {reflectDone && (
                  <div className="mb-4 text-left">
                    <AIVisualWidget
                      page="today-done"
                      intent="Show a compact momentum card: score after today's action, streak fire visualization with daily dots for last 7 days, and one sentence about what tomorrow should focus on"
                      context={{ stage, streak: streak + 1, reflectDone }}
                      data={{ score: scoreAfter ?? score, tasksDone, causality: generatedCausality, nextAction: generatedNextAction }}
                      label="Visualize my momentum"
                      autoGenerate={false}
                    />
                  </div>
                )}

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
              <AnimatedNumber value={scoreAfter ?? score} color={(scoreAfter ?? score) >= 60 ? "#4ade80" : (scoreAfter ?? score) >= 30 ? "#fbbf24" : "#333"} />
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
  );
}
