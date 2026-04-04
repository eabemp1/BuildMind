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
    <circle cx="16" cy="14" r="2.4" fill="#A78BFA"      filter="url(#tm-glow)" />
    <circle cx="26" cy="16" r="2.2" fill="#C4B5FD"      filter="url(#tm-glow)" />
  </svg>
);

// ─── Stage destinations ───────────────────────────────────────────────────────
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

// ─── Score ring — animated SVG circle, the centrepiece visual ────────────────
function ScoreRing({ score, size = 110 }: { score: number; size?: number }) {
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const color = score >= 60 ? "#4ade80" : score >= 30 ? "#fbbf24" : "#f87171";
  const label = score >= 60 ? "Strong" : score >= 30 ? "Building" : "Early";
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (score / 100) * circ }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.9, type: "spring", stiffness: 300, damping: 20 }}
          style={{ fontSize: Math.round(size * 0.27), fontWeight: 700, color, lineHeight: 1, letterSpacing: "-0.03em" }}
        >{score}</motion.div>
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}
          style={{ fontSize: 9, color: "#444", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 2 }}
        >{label}</motion.div>
      </div>
    </div>
  );
}

// ─── Streak arc — shows streak as arc filling up to 30 days ──────────────────
function StreakArc({ streak }: { streak: number }) {
  const pct = Math.min(streak / 30, 1);
  const size = 72;
  const r = 27;
  const circ = 2 * Math.PI * r;
  const color = streak >= 7 ? "#f97316" : streak >= 3 ? "#fbbf24" : "#666";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
          <motion.circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={color} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ - pct * circ }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.5 }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.6, delay: 1 }} style={{ fontSize: 22 }}>🔥</motion.span>
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color, letterSpacing: "-0.01em" }}>{streak}d</div>
      <div style={{ fontSize: 9, color: "#333", textTransform: "uppercase", letterSpacing: "0.1em" }}>Streak</div>
    </div>
  );
}

// ─── Stage track — glowing active node, animated connectors ──────────────────
const STAGE_STEPS = ["Idea", "Valid.", "Proto.", "MVP", "Launch", "Revenue"];

function StageTrack({ stage }: { stage: string }) {
  const s = stage.toLowerCase();
  const idx = s.includes("idea") ? 0 : s.includes("valid") || s.includes("disc") ? 1 : s.includes("proto") ? 2 : s.includes("mvp") ? 3 : s.includes("launch") ? 4 : 5;
  return (
    <div style={{ display: "flex", alignItems: "center", width: "100%", paddingLeft: 2, paddingRight: 2 }}>
      {STAGE_STEPS.map((label, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", flex: i < STAGE_STEPS.length - 1 ? 1 : "none" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 + i * 0.07, type: "spring", stiffness: 400, damping: 20 }}
                style={{
                  width: active ? 22 : 18, height: active ? 22 : 18, borderRadius: "50%",
                  background: done ? "#fff" : "transparent",
                  border: active ? "2px solid #a78bfa" : done ? "none" : "1px solid #2a2a2a",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 8, fontWeight: 700,
                  color: done ? "#000" : active ? "#a78bfa" : "#333",
                  boxShadow: active ? "0 0 12px rgba(167,139,250,0.45)" : "none",
                  flexShrink: 0, position: "relative",
                }}
              >
                {done ? "✓" : i + 1}
                {active && (
                  <motion.div
                    animate={{ scale: [1, 1.7, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    style={{ position: "absolute", inset: -5, borderRadius: "50%", border: "1px solid rgba(167,139,250,0.3)" }}
                  />
                )}
              </motion.div>
              <div style={{ fontSize: 8, color: active ? "#d4d4d4" : done ? "#555" : "#2a2a2a", whiteSpace: "nowrap" }}>{label}</div>
            </div>
            {i < STAGE_STEPS.length - 1 && (
              <div style={{ flex: 1, height: 1, margin: "0 2px", marginBottom: 14, background: "#1c1c1c", position: "relative", overflow: "hidden" }}>
                {done && (
                  <motion.div initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ delay: 0.2 + i * 0.1, duration: 0.4 }}
                    style={{ position: "absolute", inset: 0, background: "#555" }} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Count-up number ──────────────────────────────────────────────────────────
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
    <div style={{ marginTop: 10, marginBottom: 4 }}>
      <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 7 }}>Send it to →</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {dests.map((d, i) => (
          <motion.div key={d.label}
            initial={{ opacity: 0, y: 6, scale: 0.88 }}
            animate={show ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 6, scale: 0.88 }}
            transition={{ delay: show ? 0.06 * i : 0, type: "spring", stiffness: 320, damping: 22 }}>
            {d.url ? (
              <a href={d.url} target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#818cf8", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 6, padding: "4px 10px", textDecoration: "none" }}>
                <span>{d.icon}</span><span>{d.label}</span><span style={{ fontSize: 9, opacity: 0.5 }}>↗</span>
              </a>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#555", background: "rgba(255,255,255,0.04)", border: "1px solid #1c1c1c", borderRadius: 6, padding: "4px 10px" }}>
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
      style={{ width: "100%", padding: "14px", borderRadius: 12, fontWeight: 700, fontSize: 14, color: "#fff", border: "none", cursor: "pointer", marginBottom: 10, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", fontFamily: "inherit" }}>
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
  useEffect(() => {}, []);

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
    <div style={{ minHeight: "100vh", background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}
        style={{ fontSize: 12, color: "#444" }}>Loading your action...</motion.div>
    </div>
  );

  if (!summaries.length) return (
    <div style={{ minHeight: "100vh", background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={{ width: "100%", maxWidth: 360, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 14 }}>🚀</div>
        <div style={{ fontSize: 17, fontWeight: 500, color: "#fff", marginBottom: 8 }}>No project yet</div>
        <div style={{ fontSize: 13, color: "#888", marginBottom: 24, lineHeight: 1.6 }}>Create your first project so BuildMind can generate your daily action.</div>
        <button onClick={() => router.push("/projects")}
          style={{ width: "100%", padding: "13px", background: "#fff", color: "#000", fontSize: 13, fontWeight: 600, borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
          Create project
        </button>
      </motion.div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#000", display: "flex", flexDirection: "column", overflowX: "hidden", fontFamily: "system-ui,sans-serif" }}>

      {/* ── Top bar ── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid #111", position: "sticky", top: 0, background: "#000", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BrandMark size={22} />
          <span style={{ fontSize: 13, fontWeight: 500, color: "#fafafa" }}>BuildMind</span>
        </div>
        <button onClick={() => router.push("/dashboard")}
          style={{ fontSize: 11, color: "#555", border: "1px solid #1c1c1c", background: "transparent", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit" }}>
          Dashboard
        </button>
      </motion.div>

      {/* ── Content ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 16px 32px" }}>
        <div style={{ width: "100%", maxWidth: 420 }}>

          {/* ── VISUAL HEADER — Score ring + Streak arc ── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 28, marginBottom: 18 }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <ScoreRing score={score} size={110} />
              <div style={{ fontSize: 9, color: "#333", textTransform: "uppercase", letterSpacing: "0.1em" }}>Execution score</div>
            </div>
            <div style={{ width: 1, height: 80, background: "#111" }} />
            {streak > 0 ? (
              <StreakArc streak={streak} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: 72, height: 72, borderRadius: "50%", border: "1px dashed #1c1c1c", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 24, opacity: 0.2 }}>🔥</span>
                </div>
                <div style={{ fontSize: 10, color: "#2a2a2a" }}>No streak yet</div>
                <div style={{ fontSize: 9, color: "#1c1c1c", textTransform: "uppercase", letterSpacing: "0.1em" }}>Streak</div>
              </div>
            )}
          </motion.div>

          {/* ── Stage track ── */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.18 }}
            style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}
          >
            <div style={{ fontSize: 9, color: "#444", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
              Your journey — <span style={{ color: "#a78bfa" }}>{stage} Stage</span>
            </div>
            <StageTrack stage={stage} />
          </motion.div>

          {/* ── Action / Done card ── */}
          <AnimatePresence mode="wait">
            {!done ? (
              <motion.div key="action"
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.97 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
                <div style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: 18, padding: 20, color: "#fff" }}>
                  <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}
                    style={{ fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>
                    Do this now
                  </motion.div>
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                    style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", marginBottom: 16, lineHeight: 1.35 }}>
                    {action.action}
                  </motion.div>
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}
                    style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.18)", borderRadius: 12, padding: "12px 14px", marginBottom: 10, position: "relative" }}>
                    <div style={{ fontFamily: "monospace", fontSize: 11, color: "#94a3b8", lineHeight: 1.6, fontStyle: "italic", paddingRight: 60 }}>
                      &ldquo;{action.message}&rdquo;
                    </div>
                    <motion.button onClick={handleCopy}
                      whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }}
                      animate={copied ? { scale: [1, 1.15, 1] } : {}}
                      style={{ position: "absolute", top: 10, right: 10, fontSize: 10, padding: "4px 10px", borderRadius: 6, border: "1px solid", cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s", background: copied ? "#16a34a" : "#1a1a1a", borderColor: copied ? "#16a34a" : "#2a2a2a", color: copied ? "#fff" : "#888" }}>
                      {copied ? "✓ Copied" : "Copy"}
                    </motion.button>
                  </motion.div>
                  <DestinationChips destKey={action.destKey} show={chipsVisible} />
                  {!chipsVisible && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}
                      style={{ fontSize: 10, color: "#333", marginTop: 6, marginBottom: 10 }}>
                      Copy the message to see where to send it →
                    </motion.div>
                  )}
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.38 }}
                    style={{ fontSize: 11, color: "#444", display: "flex", alignItems: "center", gap: 5, margin: "14px 0" }}>
                    <span>⏱</span><span>Takes about {action.time}</span>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42 }}
                    style={{ display: "flex", gap: 8 }}>
                    <motion.button onClick={handleDone}
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}
                      style={{ flex: 1, padding: "13px", background: "#fff", color: "#000", fontWeight: 700, fontSize: 14, borderRadius: 12, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                      ✓ Done
                    </motion.button>
                    <motion.button onClick={() => setShowWhy(!showWhy)} whileTap={{ scale: 0.95 }}
                      style={{ padding: "13px 16px", fontSize: 13, color: "#555", borderRadius: 12, cursor: "pointer", border: "1px solid #222", background: showWhy ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)", fontFamily: "inherit", transition: "all 0.15s" }}>
                      {showWhy ? "Hide" : "Why?"}
                    </motion.button>
                  </motion.div>
                  <AnimatePresence>
                    {showWhy && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }} style={{ overflow: "hidden" }}>
                        <div style={{ fontSize: 12, color: "#555", lineHeight: 1.65, borderTop: "1px solid #1a1a1a", paddingTop: 12, marginTop: 12 }}>
                          {action.why}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            ) : (
              <motion.div key="done"
                initial={{ opacity: 0, scale: 0.94, y: 14 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
                <div style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: 18, padding: 24, color: "#fff", textAlign: "center" }}>
                  <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 320, damping: 18, delay: 0.1 }} style={{ marginBottom: 14 }}>
                    <motion.span animate={{ scale: [1, 1.18, 1], rotate: [0, 5, -5, 0] }}
                      transition={{ duration: 1.2, repeat: 2, ease: "easeInOut", delay: 0.5 }}
                      style={{ fontSize: 48, display: "inline-block" }}>🔥</motion.span>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, color: "#f1f5f9", marginBottom: 7 }}>Good. You&apos;re making progress.</div>
                    <div style={{ fontSize: 13, color: "#555", lineHeight: 1.55, marginBottom: 20 }}>Consistency compounds. Come back tomorrow for your next action.</div>
                  </motion.div>
                  {streak > 0 && (
                    <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: "spring", stiffness: 280, damping: 18, delay: 0.45 }}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, color: "#fbbf24", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.18)", borderRadius: 12, padding: "10px 16px", marginBottom: 20 }}>
                      <motion.span animate={{ scale: [1, 1.35, 1] }} transition={{ duration: 0.5, delay: 0.7 }}>🔥</motion.span>
                      <AnimatedNumber value={streak + 1} color="#fbbf24" /> day streak — keep going
                    </motion.div>
                  )}
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
                    <WiggleButton onClick={() => setShowUnlock(v => !v)}>Unlock Next Step →</WiggleButton>
                  </motion.div>
                  <AnimatePresence>
                    {showUnlock && (
                      <motion.div
                        initial={{ opacity: 0, height: 0, scaleY: 0.8 }}
                        animate={{ opacity: 1, height: "auto", scaleY: 1 }}
                        exit={{ opacity: 0, height: 0, scaleY: 0.8 }}
                        transition={{ duration: 0.25 }}
                        style={{ overflow: "hidden", transformOrigin: "top", marginBottom: 12 }}>
                        <div style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.18)", borderRadius: 12, padding: 16, textAlign: "left" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9", marginBottom: 6 }}>You&apos;re making real progress.</div>
                          <div style={{ fontSize: 12, color: "#555", marginBottom: 12, lineHeight: 1.55 }}>Unlock your next steps and keep building.</div>
                          <button onClick={() => router.push("/upgrade")}
                            style={{ width: "100%", padding: "10px", background: "#fff", color: "#000", fontWeight: 700, fontSize: 13, borderRadius: 9, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                            Continue
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.75 }}
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <button onClick={() => router.push("/projects")}
                      style={{ width: "100%", padding: "12px", fontSize: 13, fontWeight: 500, color: "#fff", background: "#141414", border: "1px solid #222", borderRadius: 12, cursor: "pointer", fontFamily: "inherit" }}>
                      View your projects →
                    </button>
                    <button onClick={() => router.push("/ai-coach")}
                      style={{ width: "100%", padding: "12px", fontSize: 13, color: "#444", background: "transparent", border: "1px solid #1c1c1c", borderRadius: 12, cursor: "pointer", fontFamily: "inherit" }}>
                      Ask BuildMini what&apos;s next
                    </button>
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>
    </div>
  );
}
