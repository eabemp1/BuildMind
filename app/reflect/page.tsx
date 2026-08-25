"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { updateAchievementStats, checkAndUnlockAchievements, getAchievementStats } from "@/lib/achievements";
import { incrementDailyStreak, getStoredStreak } from "@/lib/plan";
import { notifyStreakMilestone } from "@/lib/notifications";
import { trackFunnelStep } from "@/lib/onboarding-analytics";
import { CheckCircle2, ChevronRight, Flame, Brain, ArrowRight, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { storage } from "@/lib/storage";
import { fetchBehaviorState, persistBehaviorState } from "@/lib/userBehaviorState";
import { broadcastTabEvent } from "@/lib/tabSync";
import TestimonialModal, {
  shouldShowTestimonialModal,
  markTestimonialAsked,
  type TestimonialSource,
} from "@/components/TestimonialModal";
import { PageHeader } from "@/components/ui/PageHeader";
import { sanitizeOutput } from "@/lib/sanitizeOutput";
import ReflectionCelebration from "@/components/ReflectionCelebration";
import { ReflectionField } from "./components/ReflectionField";

type Outcome = "completed" | "blocked" | "partial" | "learned";
type ReflectionHistoryEntry = {
  date: number;
  outcome: string;
  note: string;
  confidence: number;
  causality: string;
};

const OUTCOME_CHIPS: { id: Outcome; label: string; sublabel: string; color: string; bg: string; border: string; icon: string }[] = [
  { id: "completed", label: "Nailed it",         sublabel: "Made real progress",  color: "var(--bm-green)", bg: "var(--bm-accent-dim)",   border: "var(--bm-accent-bd)",         icon: "✓" },
  { id: "partial",   label: "Partly done",       sublabel: "Made some progress",  color: "var(--bm-amber)", bg: "rgba(232,160,32,0.08)",  border: "rgba(232,160,32,0.22)",       icon: "◐" },
  { id: "blocked",   label: "Got blocked",       sublabel: "Hit a roadblock",     color: "var(--bm-red)",   bg: "rgba(224,85,85,0.08)",   border: "rgba(224,85,85,0.22)",        icon: "✕" },
  { id: "learned",   label: "Learned something", sublabel: "New insight",         color: "#A78BFA",         bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.22)",      icon: "↯" },
];

const CONFIDENCE_LABELS = ["", "Lost", "Uncertain", "Steady", "Confident", "Unstoppable"];
const CONFIDENCE_COLORS = ["", "var(--bm-red)", "var(--bm-amber)", "var(--bm-text2)", "var(--bm-teal)", "var(--bm-accent)"];

function buildFallbackCausality(o: Outcome, n: string, c: number): string {
  if (o === "completed" && c >= 4) return "You executed with high confidence → tomorrow builds on that momentum and goes one level deeper.";
  if (o === "completed") return "You got it done → that's the baseline. Tomorrow we sharpen the approach.";
  if (o === "partial") return "Partial progress is still progress → tomorrow the focus is removing the last blocker.";
  if (o === "blocked") return n ? `Blocked by: "${n}" → tomorrow the first task is removing this specific obstacle before anything else.` : "You hit a wall → tomorrow starts by naming and removing the obstacle specifically.";
  return "You gained an insight → tomorrow we apply it. Knowledge without action is just trivia.";
}

function buildFallbackWitness(o: Outcome, whatTried: string): string {
  const specific = whatTried?.trim();
  if (o === "completed") return specific ? `You said you'd try "${specific.slice(0, 60)}" — and you actually did it today.` : "You said you'd do it, and you did — on a day nobody was checking but you.";
  if (o === "partial") return "You showed up and moved it forward, even without finishing — that's still real progress logged.";
  if (o === "blocked") return "You hit a wall today and told the system instead of pretending it didn't happen. That matters.";
  return "Today wasn't a shipped feature, but you're leaving it with something you didn't have this morning.";
}

export default function ReflectPage() {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // FIX: outcome used to be freely re-pickable here even when it arrived
  // pre-filled from Today's check-in — but by the time a founder reaches
  // this page, task-complete has already run the full momentum/streak/XP/
  // pattern-detection pipeline for whatever outcome they tapped on Today.
  // Letting them silently pick a different one here only changed the task's
  // stored status, leaving those stats permanently mismatched with no
  // reconciliation. Lock the choice instead — matches how the reward was
  // actually calculated.
  const [outcomeLocked, setOutcomeLocked] = useState(false);
  const [whatTried, setWhatTried] = useState("");
  const [whatHappened, setWhatHappened] = useState("");
  const [whatLearned, setWhatLearned] = useState("");
  const [blocker, setBlocker] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [confidence, setConfidence] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [causality, setCausality] = useState("");
  const [witnessed, setWitnessed] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const NEXT_ACTION_FALLBACK: Record<string, string> = {
    Idea:       "Tomorrow: find one more person who has this problem and ask them about their current workaround.",
    Validation: "Tomorrow: convert one opinion into a commitment — time, money, or workflow change.",
    MVP:        "Tomorrow: put the working link in front of one person you haven't shown it to yet.",
    Launch:     "Tomorrow: post once, measure the response, iterate the message.",
    Growth:     "Tomorrow: talk to one churned user.",
    Revenue:    "Tomorrow: map the biggest drop-off between awareness and payment.",
  };
  const [todayAction, setTodayAction] = useState("");
  const [history, setHistory] = useState<ReflectionHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [streak, setStreak] = useState(0);
  const [startupStage, setStartupStage] = useState("Idea");
  const displayNextAction = nextAction || NEXT_ACTION_FALLBACK[startupStage] || "Tomorrow: do the one thing that would most reduce your biggest current risk.";
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [testimonialSource, setTestimonialSource] = useState<TestimonialSource | null>(null);
  const [historySynthesis, setHistorySynthesis] = useState<string | null>(null);
  const canSubmit = outcome !== null && whatTried.trim().length > 0;
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationMomentum, setCelebrationMomentum] = useState<{ before: number; after: number } | undefined>(undefined);
  const [celebrationStreak, setCelebrationStreak] = useState(0);
  const [streakExtended, setStreakExtended] = useState(false);

  useEffect(() => {
    // Pre-fill outcome from today page redirect
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const preOutcome = params.get("outcome") as Outcome | null;
      if (preOutcome && ["completed", "partial", "blocked", "learned"].includes(preOutcome)) {
        setOutcome(preOutcome);
        setOutcomeLocked(true);
      }
    }
    try {
      const saved = storage.getJSON("bm_reflect_history", []);
      setHistory(saved);
      const action = storage.getJSON<{ action?: string }>("bm_today_action", {});
      setTodayAction(action?.action ?? "");
      setStreak(0); // Server is source of truth — will be set correctly in the async fetch below
    } catch {}
    fetchBehaviorState<{ today_action: { action?: string }; reflect_done_date: string }>(["today_action", "reflect_done_date"]).then(values => {
      if (values.today_action?.action) {
        storage.setJSON("bm_today_action", values.today_action);
        setTodayAction(values.today_action.action);
      }
      const today = new Date().toISOString().slice(0, 10);
      if (values.reflect_done_date === today) {
        const rfKey = `bm_reflect_done_${today}`;
        storage.set(rfKey, "1");
        storage.set("bm_reflect_pending", "false");
        setDone(true);
      }
    }).catch(() => {});
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);
          const [summariesRes, reflectionsRes, founderCtxRes] = await Promise.allSettled([
            supabase
              .from("project_summaries")
              .select("id, startup_stage")
              .eq("user_id", user.id)
              .order("updated_at", { ascending: false })
              .limit(1),
            supabase
              .from("reflections")
              .select("outcome, note, confidence, today_action, created_at")
              .eq("user_id", user.id)
              .order("created_at", { ascending: false })
              .limit(30),
            supabase
              .from("founder_context")
              .select("streak")
              .eq("user_id", user.id)
              .maybeSingle(),
          ]);

          // Streak: server is always the authority. getStoredStreak() can be
          // stale or 0 cross-device — don't Math.max it against server, just use server.
          // If server has no streak yet (new user), fall back to 0 honestly.
          let resolvedStreak = 0;
          if (founderCtxRes.status === "fulfilled" && founderCtxRes.value.data !== null) {
            const serverStreak = founderCtxRes.value.data?.streak;
            resolvedStreak = typeof serverStreak === "number" ? serverStreak : 0;
          }
          setStreak(resolvedStreak);

          if (summariesRes.status === "fulfilled" && summariesRes.value.data?.[0]?.startup_stage) {
            setStartupStage(summariesRes.value.data[0].startup_stage);
          }
          if (summariesRes.status === "fulfilled" && summariesRes.value.data?.[0]?.id) {
            setActiveProjectId(summariesRes.value.data[0].id);
          }

          if (reflectionsRes.status === "fulfilled" && reflectionsRes.value.data?.length) {
            const serverHistory = reflectionsRes.value.data.map((r) => ({
              date: new Date(r.created_at).getTime(),
              outcome: r.outcome,
              note: r.note ?? "",
              confidence: r.confidence ?? 3,
              causality: "",
            })).reverse();
            setHistory(serverHistory);
            storage.setJSON("bm_reflect_history", serverHistory);

            const reflectionCount = reflectionsRes.status === "fulfilled"
              ? (reflectionsRes.value.data?.length ?? 0)
              : 0;
            if (reflectionCount >= 5) {
              try {
                const synthRes = await fetch("/api/ai/reflect-synthesis", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    history: serverHistory.slice(-10).map((h: { outcome: string; note: string; confidence: number; date: number }) => ({
                      outcome: h.outcome,
                      note: h.note,
                      confidence: h.confidence,
                      daysAgo: Math.round((Date.now() - h.date) / (1000 * 60 * 60 * 24)),
                    })),
                    stage: summariesRes.status === "fulfilled"
                      ? summariesRes.value.data?.[0]?.startup_stage ?? "Idea"
                      : "Idea",
                    streak: resolvedStreak,
                  }),
                });
                if (synthRes.ok) {
                  const synthData = await synthRes.json();
                  const synthesis = (synthData.data ?? synthData).synthesis ?? "";
                  if (synthesis) {
                    setHistorySynthesis(synthesis);
                    fetch("/api/founder-context", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ last_insight: synthesis }),
                    }).catch(() => {});
                  }
                }
              } catch {}
            }
          }
        }
      } catch {}
    })();
  }, []);

  async function handleFileExtract(file: File) {
    setExtracting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/reflect/extract", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        if (data.what_tried)    setWhatTried(prev    => prev || data.what_tried);
        if (data.what_happened) setWhatHappened(prev => prev || data.what_happened);
        if (data.what_learned)  setWhatLearned(prev  => prev || data.what_learned);
        if (data.blocker)       setBlocker(prev       => prev || data.blocker);
        if (data.outcome)       setOutcome(prev       => prev || data.outcome);
      }
    } catch {}
    setExtracting(false);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const richNote = [
        whatTried    ? `Tried: ${whatTried}` : "",
        whatHappened ? `Result: ${whatHappened}` : "",
        whatLearned  ? `Learned: ${whatLearned}` : "",
        blocker      ? `Blocker: ${blocker}` : "",
      ].filter(Boolean).join(" | ");

      let caus = buildFallbackCausality(outcome, richNote, confidence);
      let next = "";
      let witness = buildFallbackWitness(outcome, whatTried);
      try {
        const res = await fetch("/api/ai/reflect-action", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outcome,
            note: richNote,
            what_tried: whatTried,
            what_happened: whatHappened,
            what_learned: whatLearned,
            blocker: blocker || undefined,
            confidence,
            stage: startupStage,
            todayAction,
            streak,
            projectId: activeProjectId,
          }),
        });
        if (res.ok) {
          const d = await res.json();
          const payload = d.data ?? d;
          caus = payload.causality || caus;
          next = payload.nextAction || "";
          witness = payload.witnessed || witness;
          const newStreak = typeof payload.streak === "number" ? payload.streak : streak;
          setStreakExtended(newStreak > streak);
          setCelebrationStreak(newStreak);
          setStreak(newStreak);
          if (payload.momentum) setCelebrationMomentum(payload.momentum);
        }
      } catch {}
      setCausality(caus);
      setWitnessed(witness);
      setNextAction(next);
      const entry = { date: Date.now(), outcome, note: richNote, confidence, causality: caus };
      const newHistory = [...history, entry].slice(-30);
      setHistory(newHistory);
      storage.setJSON("bm_reflect_history", newHistory);
      persistBehaviorState({
        today_action: { action: todayAction, outcome, note: richNote, confidence, witnessed },
        reflect_done_date: new Date().toISOString().slice(0, 10),
      });
      const stats = getAchievementStats();
      updateAchievementStats({ ...stats, reflectionsLogged: (stats.reflectionsLogged ?? 0) + 1 });
      checkAndUnlockAchievements();

      const currentStreakForAchievements = getStoredStreak();
      updateAchievementStats({ ...getAchievementStats(), streak: currentStreakForAchievements });
      notifyStreakMilestone(currentStreakForAchievements);

      trackFunnelStep("first_reflect");
      const rfKey = `bm_reflect_done_${new Date().toISOString().slice(0, 10)}`;
      storage.set(rfKey, "1");
      const todayStr = new Date().toISOString().slice(0, 10);
      try {
        const prev = parseInt(storage.get(`bm_reflection_count_${todayStr}`) ?? "0", 10);
        storage.set(`bm_reflection_count_${todayStr}`, String(prev + 1));
      } catch {}
      if (userId) storage.set(`bm_last_reflection_ts_${userId}`, Date.now().toString());
      broadcastTabEvent({ type: "reflection_done", date: new Date().toISOString().slice(0, 10) });

      const currentStreak = getStoredStreak();
      const modalSource = shouldShowTestimonialModal(currentStreak, outcome, confidence);
      if (modalSource) setTestimonialSource(modalSource);

      setDone(true);
      setShowCelebration(true);
    } finally { setSubmitting(false); }
  }

  if (done) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "48px clamp(12px, 5vw, 24px)" }}>
        <ReflectionCelebration
          open={showCelebration}
          streak={celebrationStreak}
          streakExtended={streakExtended}
          momentum={celebrationMomentum}
          onDismiss={() => setShowCelebration(false)}
        />
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <CheckCircle2 size={26} color="var(--bm-accent)" />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", marginBottom: 8 }}>Reflection saved</h2>
            <p style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.6 }}>This compounds. Every reflection makes tomorrow sharper.</p>
          </div>
          {witnessed && (
            <div style={{ background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)", borderRadius: 16, padding: "18px 22px", marginBottom: 14 }}>
              <p style={{ fontSize: 14, color: "var(--bm-text)", lineHeight: 1.6, margin: 0, fontWeight: 500 }}>{sanitizeOutput(witnessed)}</p>
            </div>
          )}
          {causality && (
            <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-accent-bd)", borderRadius: 16, padding: "20px 22px", marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-accent)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
                <Brain size={10} /> AI Causality
              </div>
              <p style={{ fontSize: 14, color: "var(--bm-text)", lineHeight: 1.6, margin: 0, fontStyle: "italic" }}>&ldquo;{sanitizeOutput(causality)}&rdquo;</p>
            </div>
          )}
          {displayNextAction && (
            <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: "18px 20px", marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Tomorrow's Focus</div>
              <p style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.6, margin: 0 }}>{sanitizeOutput(displayNextAction)}</p>
            </div>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => router.push("/overview")} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text2)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Back to dashboard</button>
            <button onClick={() => router.push("/today")} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", background: "var(--grad-primary)", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Done - back to today →</button>
          </div>
        </motion.div>

        {testimonialSource && (
          <TestimonialModal
            source={testimonialSource}
            streak={streak}
            stage={startupStage}
            onClose={() => {
              markTestimonialAsked(testimonialSource);
              setTestimonialSource(null);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[620px] px-3 py-5 sm:px-6 sm:py-7">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="mb-6">
        <PageHeader
          title="How did today go?"
          subtitle={todayAction ? `Today's action: ${todayAction}` : "Daily reflection"}
          action={
            streak > 0 ? (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-[var(--r-xl)] border border-[var(--bm-border)] bg-[var(--bm-bg2)] px-3 text-[11px] font-bold text-[var(--bm-amber)]">
                <Flame size={13} />
                {streak}d
              </span>
            ) : null
          }
        />
      </motion.div>

      {historySynthesis && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}
          style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-accent)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
            <Brain size={10} /> Pattern across your reflections
          </div>
          <p style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.6, margin: 0 }}>{sanitizeOutput(historySynthesis)}</p>
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
        style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 14, padding: "18px clamp(14px, 4vw, 22px)", marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 4 }}>What happened?</div>
        {outcomeLocked && (
          <div style={{ fontSize: 11, color: "var(--bm-text3)", marginBottom: 10 }}>
            Set from today's check-in — your momentum and streak were already updated for this outcome.
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginTop: outcomeLocked ? 0 : 14 }}>
          {OUTCOME_CHIPS.map(chip => (
            <button key={chip.id} onClick={() => { if (!outcomeLocked) setOutcome(chip.id); }}
              disabled={outcomeLocked && outcome !== chip.id}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", borderRadius: 12, border: `1px solid ${outcome === chip.id ? chip.border : "var(--bm-border)"}`, background: outcome === chip.id ? chip.bg : "var(--bm-bg3)", cursor: outcomeLocked ? (outcome === chip.id ? "default" : "not-allowed") : "pointer", opacity: outcomeLocked && outcome !== chip.id ? 0.45 : 1, fontFamily: "inherit", textAlign: "left", transition: "all 0.15s" }}>
              <span style={{ fontSize: 15, color: outcome === chip.id ? chip.color : "var(--bm-text3)", fontWeight: 700, width: 20 }}>{chip.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: outcome === chip.id ? 700 : 500, color: outcome === chip.id ? chip.color : "var(--bm-text2)" }}>{chip.label}</div>
                <div style={{ fontSize: 10, color: "var(--bm-text3)" }}>{chip.sublabel}</div>
              </div>
            </button>
          ))}
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.10 }}
        style={{ border: "1px dashed var(--bm-border2)", borderRadius: 12, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10, cursor: "pointer", background: uploadedFile ? "var(--bm-bg2)" : "transparent" }}
        onClick={() => document.getElementById("reflect-file-input")?.click()}>
        <span style={{ fontSize: 18 }}>📎</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)" }}>
            {extracting ? "Extracting data from file…" : uploadedFile ? uploadedFile.name : "Upload markdown, CSV, or text log"}
          </div>
          <div style={{ fontSize: 11, color: "var(--bm-text4)", marginTop: 2 }}>AI will extract your data points automatically</div>
        </div>
        {uploadedFile && !extracting && <span style={{ fontSize: 11, color: "var(--bm-green)", fontWeight: 700 }}>✓ Done</span>}
      </motion.div>

      <input id="reflect-file-input" type="file" accept=".md,.csv,.txt" style={{ display: "none" }}
        onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setUploadedFile(file); await handleFileExtract(file); }} />

      {(["what_tried", "what_happened", "what_learned", ...(outcome === "blocked" ? ["blocker"] : [])] as const).map((field) => {
        const cfg = {
          what_tried:    { label: "What did you actually try?",     required: true,  placeholder: "Specific action: posted on Reddit r/indiehackers, cold-emailed 5 founders…", value: whatTried,     set: setWhatTried },
          what_happened: { label: "What concretely happened?",      required: false, placeholder: "Numbers if possible: 3 replies, 0 signups, 1 interested DM, post got 47 upvotes…", value: whatHappened,  set: setWhatHappened },
          what_learned:  { label: "What did you learn?",            required: false, placeholder: "Insight you can act on tomorrow: founders want X not Y, the problem is actually Z…", value: whatLearned,   set: setWhatLearned },
          blocker:       { label: "What exactly is blocking you?",  required: false, placeholder: "Specific blocker — not 'motivation', but: can't find users, auth keeps failing…", value: blocker,       set: setBlocker },
        }[field];
        if (!cfg) return null;
        return <ReflectionField key={field} label={cfg.label} required={cfg.required} placeholder={cfg.placeholder} value={cfg.value} onChange={cfg.set} />;
      })}

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
        style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 14, padding: "18px clamp(14px, 4vw, 22px)", marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 6 }}>How confident do you feel?</div>
        <div style={{ fontSize: 12, color: CONFIDENCE_COLORS[confidence], fontWeight: 600, marginBottom: 12 }}>{CONFIDENCE_LABELS[confidence]}</div>
        <div style={{ display: "flex", gap: 9 }}>
          {[1,2,3,4,5].map(v => (
            <button key={v} onClick={() => setConfidence(v)}
              style={{ flex: 1, height: 36, borderRadius: 10, border: `1px solid ${confidence === v ? CONFIDENCE_COLORS[v] : "var(--bm-border)"}`, background: confidence === v ? `${CONFIDENCE_COLORS[v]}15` : "var(--bm-bg3)", color: confidence === v ? CONFIDENCE_COLORS[v] : "var(--bm-text3)", fontSize: 14, fontWeight: confidence === v ? 800 : 400, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
              {v}
            </button>
          ))}
        </div>
      </motion.div>

      <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} onClick={handleSubmit} disabled={!canSubmit || submitting}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "14px 0", borderRadius: 12, border: "none", background: !outcome ? "var(--bm-bg4)" : "var(--grad-primary)", color: !outcome ? "var(--bm-text3)" : "white", fontWeight: 700, fontSize: 14, cursor: !outcome ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
        {submitting ? "Saving…" : <>Save reflection <ArrowRight size={16} /></>}
      </motion.button>
    </div>
  );
}
