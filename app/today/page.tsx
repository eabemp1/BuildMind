"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useProjectSummariesQuery, useDashboardOverviewQuery } from "@/lib/queries";
import { computeStartupScore } from "@/lib/buildmind";
import { recordTaskCompletion } from "@/lib/plan";
import { updateAchievementStats, checkAndUnlockAchievements, getAchievementStats } from "@/lib/achievements";
import { notifyReflectPending, notifyStreakMilestone } from "@/lib/notifications";
import { trackFunnelStep } from "@/lib/onboarding-analytics";
import BuildMindLoader from "@/components/BuildMindLoader";
import { Clock, CheckCircle2, Copy, Check, Flame, Brain, ArrowRight, Star, Sparkles } from "lucide-react";

type Outcome = "completed" | "blocked" | "partial" | "learned";
type ActionData = {
  action: string;
  message: string;
  why: string;
  time: string;
  destKey?: string;
  isAI: boolean;
};

// ── Streak helpers ────────────────────────────────────────────────────────────
// bm_streak was only ever READ, never written. Fixed here.
const STREAK_KEY = "bm_streak";
const LAST_CHECKIN_KEY = "bm_last_checkin_date";

function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function incrementStreak(): number {
  if (typeof window === "undefined") return 0;
  const today = todayDateStr();
  const lastCheckin = localStorage.getItem(LAST_CHECKIN_KEY) ?? "";
  const current = Number(localStorage.getItem(STREAK_KEY) ?? "0");
  // If already checked in today, don't double-count
  if (lastCheckin === today) return current;
  // If last checkin was yesterday, continue streak; otherwise reset to 1
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,"0")}-${String(yesterday.getDate()).padStart(2,"0")}`;
  const newStreak = lastCheckin === yesterdayStr ? current + 1 : 1;
  localStorage.setItem(STREAK_KEY, String(newStreak));
  localStorage.setItem(LAST_CHECKIN_KEY, today);
  return newStreak;
}

// ── Fallback actions (used when API is unavailable) ───────────────────────────
const DESTINATIONS: Record<string, { icon: string; label: string; url?: string }[]> = {
  idea:       [{ icon: "𝕏", label: "Twitter / X", url: "https://twitter.com/intent/tweet" }, { icon: "🧵", label: "Indie Hackers", url: "https://www.indiehackers.com" }, { icon: "💬", label: "r/startups", url: "https://reddit.com/r/startups/submit" }, { icon: "📱", label: "Text 3 people" }],
  validation: [{ icon: "𝕏", label: "Twitter / X", url: "https://twitter.com/intent/tweet" }, { icon: "🧵", label: "Indie Hackers", url: "https://www.indiehackers.com" }, { icon: "💼", label: "LinkedIn DM" }, { icon: "📱", label: "WhatsApp" }],
  prototype:  [{ icon: "🚀", label: "Product Hunt", url: "https://www.producthunt.com" }, { icon: "𝕏", label: "Twitter / X", url: "https://twitter.com/intent/tweet" }, { icon: "🧵", label: "Indie Hackers", url: "https://www.indiehackers.com" }, { icon: "🎥", label: "Loom → share" }],
  mvp:        [{ icon: "🚀", label: "Product Hunt", url: "https://www.producthunt.com" }, { icon: "𝕏", label: "Twitter / X", url: "https://twitter.com/intent/tweet" }, { icon: "🧵", label: "Indie Hackers", url: "https://www.indiehackers.com" }, { icon: "💬", label: "WhatsApp" }],
  launch:     [{ icon: "🚀", label: "Product Hunt", url: "https://www.producthunt.com/posts/new" }, { icon: "𝕏", label: "Twitter / X", url: "https://twitter.com/intent/tweet" }, { icon: "🧵", label: "Indie Hackers", url: "https://www.indiehackers.com/post" }, { icon: "📰", label: "Hacker News", url: "https://news.ycombinator.com/submit" }],
  revenue:    [{ icon: "📞", label: "Call directly" }, { icon: "📧", label: "Email personally" }, { icon: "💼", label: "LinkedIn" }, { icon: "𝕏", label: "Twitter DM" }],
};

const STATIC_ACTIONS: Record<string, { action: string; message: string; why: string; time: string; destKey: string }> = {
  idea:       { action: "Talk to 5 people who have this problem before writing any code.", message: "Hey, quick question — what's your biggest challenge with [your problem area]? I'm researching it and would love 10 minutes.", why: "Every assumption you have about your user is probably wrong. Conversations cost nothing to invalidate them.", time: "2 hours", destKey: "idea" },
  validation: { action: "Send this outreach message to 10 potential users today.", message: "Hey — I'm building something for people who struggle with [problem]. What do you currently do when [problem] happens? Not pitching, just learning.", why: "The Mom Test: ask about their life, not your idea. You'll get honest answers that way.", time: "1–2 hours", destKey: "validation" },
  prototype:  { action: "Record a 3-minute Loom walkthrough and send it to 5 people today.", message: "Hey — I've built a rough prototype for [problem]. Would you watch a 3-minute demo and tell me what confuses you most? Brutal honesty only.", why: "Dropbox got 75K signups from a demo video before writing any backend code. Ship something real.", time: "Under 2 hours", destKey: "prototype" },
  mvp:        { action: "Send your working link to one warm contact before end of day.", message: "Hey — I've been building [product] to solve [problem]. It's rough but working. Would you try it for 10 minutes and tell me what breaks?", why: "The version they see today teaches you more than 3 more days of polishing. Ship it.", time: "30 minutes", destKey: "mvp" },
  launch:     { action: "Post on Product Hunt this week — imperfect listing beats no listing.", message: "We just launched [product] on Product Hunt — it [solves problem] for [target users]. Would love your support and brutal feedback: [link]", why: "You don't need to be ready. You need to be visible.", time: "3 hours to prepare", destKey: "launch" },
  revenue:    { action: "Call one churned user today — not to win them back, to understand why they left.", message: "Hey [name] — I noticed you stopped using [product]. No sales pitch. I just want to understand what didn't work so I can fix it. 10 minutes?", why: "Churn analysis conversations are the highest-leverage activity at revenue stage.", time: "1 hour", destKey: "revenue" },
};

const OUTCOME_CHIPS: { id: Outcome; label: string; color: string; bg: string; border: string }[] = [
  { id: "completed", label: "Nailed it ✓",         color: "var(--bm-green)", bg: "var(--bm-accent-dim)",           border: "var(--bm-accent-bd)"            },
  { id: "partial",   label: "Partly done ◐",       color: "var(--bm-amber)", bg: "rgba(232,160,32,0.08)",         border: "rgba(232,160,32,0.22)"          },
  { id: "blocked",   label: "Got blocked ✕",       color: "var(--bm-red)",   bg: "rgba(224,85,85,0.08)",          border: "rgba(224,85,85,0.22)"           },
  { id: "learned",   label: "Learned something ↯", color: "#A78BFA",         bg: "rgba(167,139,250,0.08)",        border: "rgba(167,139,250,0.22)"         },
];

const CONFIDENCE_LABELS = ["", "Lost", "Uncertain", "Steady", "Confident", "Unstoppable"];
const CONFIDENCE_COLORS = ["", "var(--bm-red)", "var(--bm-amber)", "var(--bm-text2)", "var(--bm-teal)", "var(--bm-accent)"];

function ScoreRing({ value, size = 80 }: { value: number; size?: number }) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const color = value >= 60 ? "var(--bm-accent)" : value >= 40 ? "var(--bm-amber)" : "var(--bm-red)";
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
        <motion.circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (Math.min(value,100)/100)*circ }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
          style={{ filter: `drop-shadow(0 0 4px ${color}60)` }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: size * 0.26, fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
        <span style={{ fontSize: size * 0.12, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>/100</span>
      </div>
    </div>
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isMobile;
}

function TodayContent() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isFirstSession = searchParams.get("first_session") === "true";
  const { data: summaries = [], isLoading } = useProjectSummariesQuery();
  const { data: overview } = useDashboardOverviewQuery();
  const [copied, setCopied] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [confidence, setConfidence] = useState(3);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [streak, setStreak] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  // AI-personalised action state
  const [aiAction, setAiAction] = useState<ActionData | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    try { setStreak(Number(localStorage.getItem(STREAK_KEY) ?? "0")); } catch {}
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // Fetch personalised action from AI once we have project data
  useEffect(() => {
    const project = summaries[0] ?? null;
    if (!project) return;
    const projectId = project.id;
    if (!userId || !projectId) return;
    setActionLoading(true);
    fetch("/api/ai/today-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, projectId, stage: project.startup_stage ?? "Idea" }),
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(json => {
        if (json?.success && json?.data) {
          setAiAction({ ...json.data, isAI: true });
        }
      })
      .catch(() => { /* silently fall back to static */ })
      .finally(() => setActionLoading(false));
  }, [summaries, userId]);

  const project = summaries[0] ?? null;
  const score = project ? computeStartupScore(project) : 0;
  const stageKey = project?.startup_stage?.toLowerCase() ?? "idea";
  // Use AI action if available, otherwise fall back to static
  const staticAction = STATIC_ACTIONS[stageKey] ?? STATIC_ACTIONS.idea;
  const actionData = aiAction ?? { ...staticAction, isAI: false };
  const destinations = DESTINATIONS[aiAction?.destKey ?? stageKey] ?? DESTINATIONS.idea;

  function handleCopy() {
    navigator.clipboard.writeText(actionData.message).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  async function handleCheckIn() {
    if (!outcome) return;
    setSubmitting(true);
    try {
      recordTaskCompletion();
      const stats = getAchievementStats();
      updateAchievementStats({ ...stats, tasksDone: (stats.tasksDone ?? 0) + 1 });
      checkAndUnlockAchievements();
      // FIX: actually increment and persist the streak (was only ever read before)
      const newStreak = outcome === "completed" ? incrementStreak() : streak;
      setStreak(newStreak);
      if (outcome === "completed") notifyStreakMilestone(newStreak);
      notifyReflectPending();
      localStorage.setItem("bm_today_action", JSON.stringify({ action: actionData.action, outcome, note, confidence }));
      setDone(true);
    } finally { setSubmitting(false); }
  }

  if (isLoading) return <BuildMindLoader />;

  if (done) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: isMobile ? "36px 0" : "60px 24px", textAlign: "center" }}>
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <CheckCircle2 size={28} color="var(--bm-accent)" />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", marginBottom: 10 }}>Check-in recorded</h2>
          <p style={{ fontSize: 14, color: "var(--bm-text3)", marginBottom: 28, lineHeight: 1.6 }}>Come back tomorrow. Consistency compounds.</p>
          <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10, justifyContent: "center" }}>
            <button onClick={() => router.push("/reflect")} style={{ padding: "12px 20px", borderRadius: 10, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text2)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Reflect on today →</button>
            <button onClick={() => router.push("/overview")} style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: "var(--grad-primary)", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Go to dashboard</button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: isMobile ? "4px 0 24px" : "28px 24px" }}>

      {/* First-session banner — shown only right after onboarding */}
      {isFirstSession && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)", borderRadius: 14, padding: isMobile ? "16px" : "14px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
          <Sparkles size={16} color="var(--bm-accent)" style={{ flexShrink: 0 }} />
          <div style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.5 }}>
            Your roadmap is ready. <strong style={{ color: "var(--bm-text)" }}>Here's your first action.</strong> Complete it before you do anything else — momentum starts now.
          </div>
        </motion.div>
      )}

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", flexDirection: isMobile ? "column" : "row", flexWrap: "wrap", gap: 14, marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Daily Command Center</div>
            <h1 style={{ fontSize: isMobile ? 28 : 22, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", margin: 0 }}>Today's Action</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {streak > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 20, background: "rgba(232,160,32,0.10)", border: "1px solid rgba(232,160,32,0.22)" }}>
                <Flame size={13} color="var(--bm-amber)" />
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--bm-amber)" }}>{streak} day streak</span>
              </div>
            )}
            <ScoreRing value={score} size={52} />
          </div>
        </div>
      </motion.div>

      {/* Action card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
        style={{ background: "var(--bm-bg2)", border: `1px solid ${actionData.isAI ? "var(--bm-accent-bd)" : "var(--bm-border)"}`, borderRadius: 18, padding: isMobile ? "18px" : "24px", marginBottom: 14, transition: "border-color 0.3s" }}>
        <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: "var(--bm-accent-dim)", color: "var(--bm-accent)", border: "1px solid var(--bm-accent-bd)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>
            {project?.startup_stage ?? "Idea"} Stage
          </span>
          {actionData.isAI ? (
            <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: "rgba(167,139,250,0.10)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.25)", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
              <Sparkles size={9} /> AI-personalised
            </span>
          ) : actionLoading ? (
            <span style={{ fontSize: 10, color: "var(--bm-text3)", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--bm-accent)", opacity: 0.5, animation: "pulse 1.2s infinite" }} /> Personalising…
            </span>
          ) : null}
          <span style={{ fontSize: 11, color: "var(--bm-text3)", display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
            <Clock size={11} /> {actionData.time}
          </span>
        </div>
        <p style={{ fontSize: isMobile ? 19 : 17, fontWeight: 700, color: "var(--bm-text)", lineHeight: 1.45, marginBottom: 18, letterSpacing: "-0.01em" }}>{actionData.action}</p>

        {/* Why */}
        <div style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderRadius: 12, padding: isMobile ? "16px" : "14px 16px", marginBottom: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
            <Brain size={10} color="var(--bm-accent)" /> Why this matters
          </div>
          <p style={{ fontSize: isMobile ? 14 : 13, color: "var(--bm-text2)", margin: 0, lineHeight: 1.6 }}>{actionData.why}</p>
        </div>

        {/* Message template */}
        <div style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 12, padding: isMobile ? "16px" : "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Message Template</span>
            <button onClick={handleCopy}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 7, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text3)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
              {copied ? <><Check size={11} color="var(--bm-accent)" /> Copied</> : <><Copy size={11} /> Copy</>}
            </button>
          </div>
          <p style={{ fontSize: isMobile ? 14 : 13, color: "var(--bm-text2)", margin: 0, lineHeight: 1.6, fontStyle: "italic" }}>&ldquo;{actionData.message}&rdquo;</p>
        </div>
      </motion.div>

      {/* Destinations */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
        style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 18, padding: isMobile ? "18px" : "20px 24px", marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 14 }}>Where to send this</div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 9 }}>
          {destinations.map(d => (
            <a key={d.label} href={d.url} target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, padding: isMobile ? "16px 8px" : "14px 8px", borderRadius: 12, border: "1px solid var(--bm-border)", background: "var(--bm-bg3)", textDecoration: "none", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--bm-border2)"; e.currentTarget.style.background = "var(--bm-bg4)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--bm-border)"; e.currentTarget.style.background = "var(--bm-bg3)"; }}>
              <span style={{ fontSize: 22 }}>{d.icon}</span>
              <span style={{ fontSize: 11, color: "var(--bm-text3)", textAlign: "center", lineHeight: 1.3 }}>{d.label}</span>
            </a>
          ))}
        </div>
      </motion.div>

      {/* Check-in */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
        style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 18, padding: isMobile ? "18px" : "20px 24px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 14 }}>How did it go?</div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 9, marginBottom: 18 }}>
          {OUTCOME_CHIPS.map(chip => (
            <button key={chip.id} onClick={() => setOutcome(chip.id)}
              style={{ padding: isMobile ? "14px" : "12px 14px", borderRadius: 12, border: `1px solid ${outcome === chip.id ? chip.border : "var(--bm-border)"}`, background: outcome === chip.id ? chip.bg : "var(--bm-bg3)", color: outcome === chip.id ? chip.color : "var(--bm-text3)", fontSize: isMobile ? 14 : 13, fontWeight: outcome === chip.id ? 600 : 400, cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 0.15s" }}>
              {chip.label}
            </button>
          ))}
        </div>

        {/* Confidence */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: "var(--bm-text3)", marginBottom: 10 }}>
            Confidence level: <span style={{ color: CONFIDENCE_COLORS[confidence], fontWeight: 600 }}>{CONFIDENCE_LABELS[confidence]}</span>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            {[1,2,3,4,5].map(v => (
              <button key={v} onClick={() => setConfidence(v)}
                style={{ flex: 1, height: 32, borderRadius: 9, border: `1px solid ${confidence === v ? CONFIDENCE_COLORS[v] : "var(--bm-border)"}`, background: confidence === v ? `${CONFIDENCE_COLORS[v]}15` : "var(--bm-bg3)", color: confidence === v ? CONFIDENCE_COLORS[v] : "var(--bm-text3)", fontSize: 12, fontWeight: confidence === v ? 700 : 400, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                {v}
              </button>
            ))}
          </div>
        </div>

        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="What happened? (optional)"
          style={{ width: "100%", background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 10, padding: isMobile ? "13px 14px" : "10px 14px", fontSize: isMobile ? 16 : 13, color: "var(--bm-text)", outline: "none", fontFamily: "inherit", resize: "none", boxSizing: "border-box", lineHeight: 1.55, transition: "border-color 0.15s", marginBottom: 14 }}
          onFocus={e => { e.target.style.borderColor = "var(--bm-accent-bd)"; }}
          onBlur={e => { e.target.style.borderColor = "var(--bm-border2)"; }} />

        <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} onClick={handleCheckIn} disabled={!outcome || submitting}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "13px 0", borderRadius: 12, border: "none", background: !outcome ? "var(--bm-bg4)" : "var(--grad-primary)", color: !outcome ? "var(--bm-text3)" : "white", fontWeight: 700, fontSize: 14, cursor: !outcome ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
          {submitting ? "Recording…" : <>Record check-in <ArrowRight size={16} /></>}
        </motion.button>
      </motion.div>
    </div>
  );
}

export default function TodayPage() {
  return (
    <Suspense fallback={<BuildMindLoader />}>
      <TodayContent />
    </Suspense>
  );
}
