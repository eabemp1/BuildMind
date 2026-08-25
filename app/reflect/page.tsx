"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { updateAchievementStats, checkAndUnlockAchievements, getAchievementStats } from "@/lib/achievements";
import { getStoredStreak } from "@/lib/plan";
import { notifyStreakMilestone } from "@/lib/notifications";
import { trackFunnelStep } from "@/lib/onboarding-analytics";
import { Flame, Brain, ArrowRight } from "lucide-react";
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
import { ConfidenceSelector } from "./components/ConfidenceSelector";
import { OutcomePicker, type ReflectionOutcome } from "./components/OutcomePicker";
import { ReflectionCompletion } from "./components/ReflectionCompletion";

type Outcome = ReflectionOutcome;

type ReflectionHistoryEntry = {
  date: number;
  outcome: string;
  note: string;
  confidence: number;
  causality: string;
};

function buildFallbackCausality(o: Outcome, n: string, c: number): string {
  if (o === "completed" && c >= 4) {
    return "You executed with high confidence. Tomorrow builds on that momentum and goes one level deeper.";
  }

  if (o === "completed") {
    return "You got it done. That is the baseline. Tomorrow we sharpen the approach.";
  }

  if (o === "partial") {
    return "Partial progress is still progress. Tomorrow the focus is removing the last blocker.";
  }

  if (o === "blocked") {
    return n
      ? `Blocked by: "${n}". Tomorrow the first task is removing this specific obstacle before anything else.`
      : "You hit a wall. Tomorrow starts by naming and removing the obstacle specifically.";
  }

  return "You gained an insight. Tomorrow we apply it. Knowledge without action is just trivia.";
}

function buildFallbackWitness(o: Outcome, whatTried: string): string {
  const specific = whatTried.trim();

  if (o === "completed") {
    return specific
      ? `You said you'd try "${specific.slice(0, 60)}" and you actually did it today.`
      : "You said you'd do it, and you did, on a day nobody was checking but you.";
  }

  if (o === "partial") {
    return "You showed up and moved it forward, even without finishing. That is still real progress logged.";
  }

  if (o === "blocked") {
    return "You hit a wall today and told the system instead of pretending it did not happen. That matters.";
  }

  return "Today was not a shipped feature, but you are leaving it with something you did not have this morning.";
}

export default function ReflectPage() {
  const router = useRouter();

  const [outcome, setOutcome] = useState<Outcome | null>(null);
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

  const [todayAction, setTodayAction] = useState("");
  const [history, setHistory] = useState<ReflectionHistoryEntry[]>([]);
  const [streak, setStreak] = useState(0);
  const [startupStage, setStartupStage] = useState("Idea");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [testimonialSource, setTestimonialSource] = useState<TestimonialSource | null>(null);
  const [historySynthesis, setHistorySynthesis] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationMomentum, setCelebrationMomentum] = useState<{ before: number; after: number } | undefined>(undefined);
  const [celebrationStreak, setCelebrationStreak] = useState(0);
  const [streakExtended, setStreakExtended] = useState(false);

  const NEXT_ACTION_FALLBACK: Record<string, string> = {
    Idea: "Tomorrow: find one more person who has this problem and ask them about their current workaround.",
    Validation: "Tomorrow: convert one opinion into a commitment, time, money, or workflow change.",
    MVP: "Tomorrow: put the working link in front of one person you have not shown it to yet.",
    Launch: "Tomorrow: post once, measure the response, then iterate the message.",
    Growth: "Tomorrow: talk to one churned user.",
    Revenue: "Tomorrow: map the biggest drop-off between awareness and payment.",
  };

  const displayNextAction =
    nextAction ||
    NEXT_ACTION_FALLBACK[startupStage] ||
    "Tomorrow: do the one thing that would most reduce your biggest current risk.";

  const canSubmit = outcome !== null && whatTried.trim().length > 0;

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const preOutcome = params.get("outcome") as Outcome | null;

      if (preOutcome && ["completed", "partial", "blocked", "learned"].includes(preOutcome)) {
        setOutcome(preOutcome);
        setOutcomeLocked(true);
      }
    }

    try {
      const saved = storage.getJSON<ReflectionHistoryEntry[]>("bm_reflect_history", []);
      setHistory(saved);

      const action = storage.getJSON<{ action?: string }>("bm_today_action", {});
      setTodayAction(action?.action ?? "");
      setStreak(0);
    } catch {}

    fetchBehaviorState<{
      today_action: { action?: string };
      reflect_done_date: string;
    }>(["today_action", "reflect_done_date"])
      .then((values) => {
        if (values.today_action?.action) {
          storage.setJSON("bm_today_action", values.today_action);
          setTodayAction(values.today_action.action);
        }

        const today = new Date().toISOString().slice(0, 10);

        if (values.reflect_done_date === today) {
          storage.set(`bm_reflect_done_${today}`, "1");
          storage.set("bm_reflect_pending", "false");
          setDone(true);
        }
      })
      .catch(() => {});

    void (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

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
          const serverHistory = reflectionsRes.value.data
            .map((reflection) => ({
              date: new Date(reflection.created_at).getTime(),
              outcome: reflection.outcome,
              note: reflection.note ?? "",
              confidence: reflection.confidence ?? 3,
              causality: "",
            }))
            .reverse();

          setHistory(serverHistory);
          storage.setJSON("bm_reflect_history", serverHistory);

          if (serverHistory.length >= 5) {
            try {
              const synthRes = await fetch("/api/ai/reflect-synthesis", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  history: serverHistory.slice(-10).map((entry) => ({
                    outcome: entry.outcome,
                    note: entry.note,
                    confidence: entry.confidence,
                    daysAgo: Math.round((Date.now() - entry.date) / (1000 * 60 * 60 * 24)),
                  })),
                  stage:
                    summariesRes.status === "fulfilled"
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
      } catch {}
    })();
  }, []);

  async function handleFileExtract(file: File) {
    setExtracting(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/reflect/extract", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();

        if (data.what_tried) setWhatTried((previous) => previous || data.what_tried);
        if (data.what_happened) setWhatHappened((previous) => previous || data.what_happened);
        if (data.what_learned) setWhatLearned((previous) => previous || data.what_learned);
        if (data.blocker) setBlocker((previous) => previous || data.blocker);
        if (data.outcome) setOutcome((previous) => previous || data.outcome);
      }
    } catch {
      // File extraction is optional.
    }

    setExtracting(false);
  }

  async function handleSubmit() {
    if (!canSubmit || !outcome) return;

    setSubmitting(true);

    try {
      const richNote = [
        whatTried ? `Tried: ${whatTried}` : "",
        whatHappened ? `Result: ${whatHappened}` : "",
        whatLearned ? `Learned: ${whatLearned}` : "",
        blocker ? `Blocker: ${blocker}` : "",
      ]
        .filter(Boolean)
        .join(" | ");

      let resolvedCausality = buildFallbackCausality(outcome, richNote, confidence);
      let resolvedNextAction = "";
      let resolvedWitnessed = buildFallbackWitness(outcome, whatTried);

      try {
        const response = await fetch("/api/ai/reflect-action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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

        if (response.ok) {
          const responseData = await response.json();
          const payload = responseData.data ?? responseData;

          resolvedCausality = payload.causality || resolvedCausality;
          resolvedNextAction = payload.nextAction || "";
          resolvedWitnessed = payload.witnessed || resolvedWitnessed;

          const newStreak = typeof payload.streak === "number" ? payload.streak : streak;

          setStreakExtended(newStreak > streak);
          setCelebrationStreak(newStreak);
          setStreak(newStreak);

          if (payload.momentum) {
            setCelebrationMomentum(payload.momentum);
          }
        }
      } catch {
        // The fallback reflection remains usable when AI is unavailable.
      }

      setCausality(resolvedCausality);
      setWitnessed(resolvedWitnessed);
      setNextAction(resolvedNextAction);

      const entry: ReflectionHistoryEntry = {
        date: Date.now(),
        outcome,
        note: richNote,
        confidence,
        causality: resolvedCausality,
      };

      const newHistory = [...history, entry].slice(-30);

      setHistory(newHistory);
      storage.setJSON("bm_reflect_history", newHistory);

      persistBehaviorState({
        today_action: {
          action: todayAction,
          outcome,
          note: richNote,
          confidence,
          witnessed: resolvedWitnessed,
        },
        reflect_done_date: new Date().toISOString().slice(0, 10),
      });

      const stats = getAchievementStats();

      updateAchievementStats({
        ...stats,
        reflectionsLogged: (stats.reflectionsLogged ?? 0) + 1,
      });

      checkAndUnlockAchievements();

      const currentStreakForAchievements = getStoredStreak();

      updateAchievementStats({
        ...getAchievementStats(),
        streak: currentStreakForAchievements,
      });

      notifyStreakMilestone(currentStreakForAchievements);
      trackFunnelStep("first_reflect");

      const today = new Date().toISOString().slice(0, 10);

      storage.set(`bm_reflect_done_${today}`, "1");

      try {
        const previousCount = parseInt(storage.get(`bm_reflection_count_${today}`) ?? "0", 10);
        storage.set(`bm_reflection_count_${today}`, String(previousCount + 1));
      } catch {}

      if (userId) {
        storage.set(`bm_last_reflection_ts_${userId}`, Date.now().toString());
      }

      broadcastTabEvent({
        type: "reflection_done",
        date: today,
      });

      const currentStreak = getStoredStreak();
      const modalSource = shouldShowTestimonialModal(currentStreak, outcome, confidence);

      if (modalSource) {
        setTestimonialSource(modalSource);
      }

      setDone(true);
      setShowCelebration(true);
    } finally {
      setSubmitting(false);
    }
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

        <ReflectionCompletion
          witnessed={sanitizeOutput(witnessed)}
          causality={sanitizeOutput(causality)}
          nextAction={sanitizeOutput(displayNextAction)}
          onOverview={() => router.push("/overview")}
          onToday={() => router.push("/today")}
        />

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
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="mb-6"
      >
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
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 }}
          style={{
            background: "var(--bm-bg2)",
            border: "1px solid var(--bm-border)",
            borderRadius: 16,
            padding: "16px 18px",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--bm-accent)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Brain size={10} />
            Pattern across your reflections
          </div>

          <p style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.6, margin: 0 }}>
            {sanitizeOutput(historySynthesis)}
          </p>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
        style={{
          background: "var(--bm-bg2)",
          border: "1px solid var(--bm-border)",
          borderRadius: 14,
          padding: "18px clamp(14px, 4vw, 22px)",
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 4 }}>
          What happened?
        </div>

        {outcomeLocked && (
          <div style={{ fontSize: 11, color: "var(--bm-text3)", marginBottom: 10 }}>
            Set from today&apos;s check-in. Your momentum and streak were already updated for this outcome.
          </div>
        )}

        <div style={{ marginTop: outcomeLocked ? 0 : 14 }}>
          <OutcomePicker outcome={outcome} locked={outcomeLocked} onChange={setOutcome} />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        style={{
          border: "1px dashed var(--bm-border2)",
          borderRadius: 12,
          padding: "12px 16px",
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: "pointer",
          background: uploadedFile ? "var(--bm-bg2)" : "transparent",
        }}
        onClick={() => document.getElementById("reflect-file-input")?.click()}
      >
        <span style={{ fontSize: 18 }}>📎</span>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)" }}>
            {extracting
              ? "Extracting data from file..."
              : uploadedFile
                ? uploadedFile.name
                : "Upload markdown, CSV, or text log"}
          </div>

          <div style={{ fontSize: 11, color: "var(--bm-text4)", marginTop: 2 }}>
            AI will extract your data points automatically
          </div>
        </div>

        {uploadedFile && !extracting && (
          <span style={{ fontSize: 11, color: "var(--bm-green)", fontWeight: 700 }}>Done</span>
        )}
      </motion.div>

      <input
        id="reflect-file-input"
        type="file"
        accept=".md,.csv,.txt"
        style={{ display: "none" }}
        onChange={async (event) => {
          const file = event.target.files?.[0];

          if (!file) return;

          setUploadedFile(file);
          await handleFileExtract(file);
        }}
      />

      {(["what_tried", "what_happened", "what_learned", ...(outcome === "blocked" ? ["blocker"] : [])] as const).map(
        (field) => {
          const config = {
            what_tried: {
              label: "What did you actually try?",
              required: true,
              placeholder: "Specific action: posted on Reddit r/indiehackers, cold-emailed 5 founders...",
              value: whatTried,
              set: setWhatTried,
            },
            what_happened: {
              label: "What concretely happened?",
              required: false,
              placeholder: "Numbers if possible: 3 replies, 0 signups, 1 interested DM, post got 47 upvotes...",
              value: whatHappened,
              set: setWhatHappened,
            },
            what_learned: {
              label: "What did you learn?",
              required: false,
              placeholder: "Insight you can act on tomorrow: founders want X not Y, the problem is actually Z...",
              value: whatLearned,
              set: setWhatLearned,
            },
            blocker: {
              label: "What exactly is blocking you?",
              required: false,
              placeholder: "Specific blocker: cannot find users, auth keeps failing...",
              value: blocker,
              set: setBlocker,
            },
          }[field];

          if (!config) return null;

          return (
            <ReflectionField
              key={field}
              label={config.label}
              required={config.required}
              placeholder={config.placeholder}
              value={config.value}
              onChange={config.set}
            />
          );
        },
      )}

      <ConfidenceSelector value={confidence} onChange={setConfidence} />

      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleSubmit}
        disabled={!canSubmit || submitting}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          width: "100%",
          padding: "14px 0",
          borderRadius: 12,
          border: "none",
          background: !outcome ? "var(--bm-bg4)" : "var(--grad-primary)",
          color: !outcome ? "var(--bm-text3)" : "white",
          fontWeight: 700,
          fontSize: 14,
          cursor: !outcome ? "not-allowed" : "pointer",
          fontFamily: "inherit",
        }}
      >
        {submitting ? (
          "Saving..."
        ) : (
          <>
            Save reflection <ArrowRight size={16} />
          </>
        )}
      </motion.button>
    </div>
  );
}
