"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { updateAchievementStats, checkAndUnlockAchievements, getAchievementStats } from "@/lib/achievements";
import { incrementDailyStreak, getStoredStreak } from "@/lib/plan";
import { notifyStreakMilestone } from "@/lib/notifications";
import { trackFunnelStep } from "@/lib/onboarding-analytics";
import { CheckCircle2, ChevronRight, Flame, Brain, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { storage } from "@/lib/storage";
import { fetchBehaviorState, persistBehaviorState } from "@/lib/userBehaviorState";
import TestimonialModal, {
  shouldShowTestimonialModal,
  markTestimonialAsked,
  type TestimonialSource,
} from "@/components/TestimonialModal";
import { PageHeader } from "@/components/ui/PageHeader";

type Outcome = "completed" | "blocked" | "partial" | "learned";

const OUTCOME_CHIPS: { id: Outcome; label: string; sublabel: string; color: string; bg: string; border: string; icon: string }[] = [
  { id: "completed", label: "Nailed it",        sublabel: "Made real progress",  color: "var(--bm-green)", bg: "var(--bm-accent-dim)",   border: "var(--bm-accent-bd)",         icon: "✓" },
  { id: "partial",   label: "Partly done",      sublabel: "Made some progress",  color: "var(--bm-amber)", bg: "rgba(232,160,32,0.08)",  border: "rgba(232,160,32,0.22)",       icon: "◐" },
  { id: "blocked",   label: "Got blocked",      sublabel: "Hit a roadblock",     color: "var(--bm-red)",   bg: "rgba(224,85,85,0.08)",   border: "rgba(224,85,85,0.22)",        icon: "✕" },
  { id: "learned",   label: "Learned something",sublabel: "New insight",         color: "#A78BFA",         bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.22)",      icon: "↯" },
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

export default function ReflectPage() {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [note, setNote] = useState("");
  const [confidence, setConfidence] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [causality, setCausality] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [todayAction, setTodayAction] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [streak, setStreak] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [startupStage, setStartupStage] = useState("Idea");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [testimonialSource, setTestimonialSource] = useState<TestimonialSource | null>(null);
  /**
   * historySynthesis — AI interpretation of the founder's reflection
   * history across time. Fetched on page load when ≥ 5 reflections exist.
   * Null until loaded; empty string if the API returned nothing useful.
   */
  const [historySynthesis, setHistorySynthesis] = useState<string | null>(null);

  const NEXT_ACTION_FALLBACK: Record<string, string> = {
    Idea:       "Tomorrow: find one more person who has this problem and ask them about their current workaround.",
    Validation: "Tomorrow: convert one opinion into a commitment — time, money, or workflow change.",
    MVP:        "Tomorrow: put the working link in front of one person you haven't shown it to yet.",
    Launch:     "Tomorrow: post once, measure the response, iterate the message.",
    Growth:     "Tomorrow: talk to one churned user.",
    Revenue:    "Tomorrow: map the biggest drop-off between awareness and payment.",
  };
  const displayNextAction = nextAction || NEXT_ACTION_FALLBACK[startupStage] || "Tomorrow: do the one thing that would most reduce your biggest current risk.";

  useEffect(() => {
    try {
      const saved = storage.getJSON("bm_reflect_history", []);
      setHistory(saved);
      const action = storage.getJSON<{ action?: string }>("bm_today_action", {});
      setTodayAction(action?.action ?? "");
      setStreak(getStoredStreak());
    } catch {}
    fetchBehaviorState<{ today_action: { action?: string } }>(["today_action"]).then(values => {
      if (values.today_action?.action) {
        storage.setJSON("bm_today_action", values.today_action);
        setTodayAction(values.today_action.action);
      }
    }).catch(() => {});
    // Fix #2: Fetch actual startup stage from project summaries
    // Fix #11: Seed reflect history from Supabase so it survives device switches
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);
          const [summariesRes, reflectionsRes] = await Promise.allSettled([
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
          ]);

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
            // Merge with localStorage — prefer server data, it's the source of truth
            setHistory(serverHistory);
            storage.setJSON("bm_reflect_history", serverHistory);

            // ── Cross-time AI synthesis ──────────────────────────────────────
            // Only fire when there's enough history to say something meaningful.
            // We send the last 10 reflections (enough for pattern recognition,
            // cheap enough to keep latency acceptable).
            const reflectionCount = reflectionsRes.status === "fulfilled"
              ? (reflectionsRes.value.data?.length ?? 0) : 0;
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
                    streak: getStoredStreak(),
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
              } catch {
                // Non-fatal — synthesis is additive, not required
              }
            }
          }
        }
      } catch {}
    })();
  }, []);

  async function handleSubmit() {
    if (!outcome) return;
    setSubmitting(true);
    try {
      const fallback = buildFallbackCausality(outcome, note, confidence);
      let caus = fallback;
      let next = "";
      try {
        const res = await fetch("/api/ai/reflect-action", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outcome, note, confidence, todayAction, stage: startupStage, streak, projectId: activeProjectId }),
        });
        if (res.ok) { const d = await res.json(); const payload = d.data ?? d; caus = payload.causality || fallback; next = payload.nextAction || ""; }
      } catch {}
      setCausality(caus);
      setNextAction(next);
      const entry = { date: Date.now(), outcome, note, confidence, causality: caus };
      const newHistory = [...history, entry].slice(-30);
      setHistory(newHistory);
      storage.setJSON("bm_reflect_history", newHistory);
      persistBehaviorState({
        today_action: { action: todayAction, outcome, note, confidence },
      });
      const stats = getAchievementStats();
      updateAchievementStats({ ...stats, reflectionsLogged: (stats.reflectionsLogged ?? 0) + 1 });
      checkAndUnlockAchievements();

      const currentStreakForAchievements = getStoredStreak();
      updateAchievementStats({ ...getAchievementStats(), streak: currentStreakForAchievements });
      notifyStreakMilestone(currentStreakForAchievements);

      if (userId) storage.set(`bm_last_reflection_ts_${userId}`, Date.now().toString());

      trackFunnelStep("first_reflect");
      // Mark reflection done today for the daily loop status bar in app-shell
      const rfKey = `bm_reflect_done_${new Date().toISOString().slice(0, 10)}`;
      storage.set(rfKey, "1");

      // Check if this session should trigger the testimonial modal
      const currentStreak = getStoredStreak();
      const modalSource = shouldShowTestimonialModal(currentStreak, outcome, confidence);
      if (modalSource) setTestimonialSource(modalSource);

      setDone(true);
    } finally { setSubmitting(false); }
  }

  if (done) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "48px clamp(12px, 5vw, 24px)" }}>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <CheckCircle2 size={26} color="var(--bm-accent)" />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", marginBottom: 8 }}>Reflection saved</h2>
            <p style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.6 }}>This compounds. Every reflection makes tomorrow sharper.</p>
          </div>
          {causality && (
            <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-accent-bd)", borderRadius: 16, padding: "20px 22px", marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-accent)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
                <Brain size={10} /> AI Causality
              </div>
              <p style={{ fontSize: 14, color: "var(--bm-text)", lineHeight: 1.6, margin: 0, fontStyle: "italic" }}>&ldquo;{causality}&rdquo;</p>
            </div>
          )}
          <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: "18px 20px", marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Tomorrow's Focus</div>
            <p style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.6, margin: 0 }}>{displayNextAction}</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => router.push("/overview")} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text2)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Back to dashboard</button>
            <button onClick={() => router.push("/today")} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", background: "var(--grad-primary)", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>See tomorrow's action →</button>
          </div>
        </motion.div>

        {/* Testimonial modal — shown at high-engagement moments */}
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
              <span className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--bm-border)] bg-[var(--bm-bg2)] px-3 text-[11px] font-bold text-[var(--bm-amber)]">
                <Flame size={13} />
                {streak}d
              </span>
            ) : null
          }
        />
      </motion.div>

      {/* Cross-time AI synthesis — shown when we have enough history */}
      {historySynthesis && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}
          style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-accent)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
            <Brain size={10} /> Pattern across your reflections
          </div>
          <p style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.6, margin: 0 }}>{historySynthesis}</p>
        </motion.div>
      )}

      {/* Outcome */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
        style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 14, padding: "18px clamp(14px, 4vw, 22px)", marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 14 }}>What happened?</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
          {OUTCOME_CHIPS.map(chip => (
            <button key={chip.id} onClick={() => setOutcome(chip.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", borderRadius: 12, border: `1px solid ${outcome === chip.id ? chip.border : "var(--bm-border)"}`, background: outcome === chip.id ? chip.bg : "var(--bm-bg3)", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 0.15s" }}>
              <span style={{ fontSize: 15, color: outcome === chip.id ? chip.color : "var(--bm-text3)", fontWeight: 700, width: 20 }}>{chip.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: outcome === chip.id ? 700 : 500, color: outcome === chip.id ? chip.color : "var(--bm-text2)" }}>{chip.label}</div>
                <div style={{ fontSize: 10, color: "var(--bm-text3)" }}>{chip.sublabel}</div>
              </div>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Note */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.10 }}
        style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 14, padding: "18px clamp(14px, 4vw, 22px)", marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 10 }}>What actually happened? <span style={{ color: "var(--bm-text3)", fontWeight: 400 }}>(optional)</span></div>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Be specific. What did you do? What did you learn? What got in the way?"
          style={{ width: "100%", background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 10, padding: "11px 14px", fontSize: 13, color: "var(--bm-text)", outline: "none", fontFamily: "inherit", resize: "none", boxSizing: "border-box", lineHeight: 1.6, transition: "border-color 0.15s" }}
          onFocus={e => { e.target.style.borderColor = "var(--bm-accent-bd)"; }}
          onBlur={e => { e.target.style.borderColor = "var(--bm-border2)"; }} />
      </motion.div>

      {/* Confidence */}
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

      <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} onClick={handleSubmit} disabled={!outcome || submitting}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "14px 0", borderRadius: 12, border: "none", background: !outcome ? "var(--bm-bg4)" : "var(--grad-primary)", color: !outcome ? "var(--bm-text3)" : "white", fontWeight: 700, fontSize: 14, cursor: !outcome ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
        {submitting ? "Saving…" : <>Save reflection <ArrowRight size={16} /></>}
      </motion.button>
    </div>
  );
}
