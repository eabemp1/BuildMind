"use client";

/**
 * app/journey/s/[token]/page.tsx — the actual link you send her.
 *
 * No login, no BuildMind account — the token in the URL is the access
 * control (see lib/journeyAccess.ts). Same visual system as
 * app/journey/page.tsx (the authenticated equivalent) — see that file's
 * header comment for the design rationale. Combines Today + Progress on
 * one page since she has no nav to move between screens.
 */

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Flame,
  Trophy,
  CheckCircle2,
  Circle,
  ChevronDown,
  Clock,
  BookOpen,
  Wrench,
  Github,
  Sparkles,
  Target,
  AlertTriangle,
} from "lucide-react";
import type { TodayMission } from "@/lib/journey";
import { PythonCode } from "@/components/journey/PythonCode";

const DIFFICULTY_STYLES: Record<string, string> = {
  warmup: "bg-[var(--bm-blue-dim)] text-[var(--bm-blue)]",
  core: "bg-[var(--bm-accent-dim)] text-[var(--bm-accent)]",
  stretch: "bg-[var(--bm-red-dim)] text-[var(--bm-red)]",
};

interface ProgressSummary {
  level: number;
  levelName: string;
  totalXp: number;
  xpIntoLevel: number;
  xpToNextLevel: number | null;
  currentStreak: number;
  achievements: { id: string; name: string; description: string; unlockedAt: string }[];
}

export default function JourneyStudentLinkPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();

  const [studentName, setStudentName] = useState("");
  const [mission, setMission] = useState<TodayMission | null>(null);
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [awaitingPlacement, setAwaitingPlacement] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const placementRes = await fetch(`/api/journey/s/${token}/placement/status`);
      if (placementRes.status === 404) {
        setNotFound(true);
        return;
      }
      const placementData = await placementRes.json();
      if (placementData.ok && !placementData.hasPath) {
        if (placementData.pendingRequest) {
          setAwaitingPlacement(true);
          return;
        }
        router.push(`/journey/s/${token}/placement`);
        return;
      }

      const [todayRes, progressRes] = await Promise.all([
        fetch(`/api/journey/s/${token}/today`),
        fetch(`/api/journey/s/${token}/progress`),
      ]);
      if (todayRes.status === 404) {
        setNotFound(true);
        return;
      }
      const data = await todayRes.json();
      if (!data.ok) throw new Error(data.error || "Failed to load");
      setStudentName(data.studentName);
      setMission(data.mission);

      if (progressRes.ok) {
        const progressData = await progressRes.json();
        if (progressData.ok) setProgress(progressData.progress);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [token, router]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleStart() {
    if (!mission) return;
    const res = await fetch(`/api/journey/s/${token}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module_order: mission.moduleOrder }),
    });
    const data = await res.json();
    if (data.ok) await load();
    else setError(data.error || "Failed to start project");
  }

  async function handleCompleteLesson(lessonId: string) {
    const res = await fetch(`/api/journey/s/${token}/lessons/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lesson_id: lessonId }),
    });
    const data = await res.json();
    if (data.ok) await load();
    else setError(data.error || "Failed to mark lesson complete");
  }

  async function handleCompleteExercise(exerciseId: string) {
    const res = await fetch(`/api/journey/s/${token}/exercises/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exercise_id: exerciseId }),
    });
    const data = await res.json();
    if (data.ok) await load();
    else setError(data.error || "Failed to mark exercise complete");
  }

  async function handleSubmit() {
    if (!mission?.project) return;
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const res = await fetch(`/api/journey/s/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: mission.project.id,
          repository_url: repoUrl || undefined,
          notes: notes || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to submit");
      setSubmitMsg("Submitted! Your mentor will take a look and get back to you.");
      setRepoUrl("");
      setNotes("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  if (notFound) {
    return (
      <main className="min-h-screen bg-[var(--bm-bg)] text-[var(--bm-text)] flex items-center justify-center px-6">
        <p className="text-sm text-[var(--bm-text2)] max-w-md text-center">
          This link isn&apos;t valid. Double-check the URL, or ask your mentor to resend it.
        </p>
      </main>
    );
  }

  if (awaitingPlacement) {
    return (
      <main className="min-h-screen bg-[var(--bm-bg)] text-[var(--bm-text)] flex items-center justify-center px-6">
        <p className="text-sm text-[var(--bm-text2)] max-w-md text-center">
          Your placement request is waiting on your mentor&apos;s review. Check back soon.
        </p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--bm-bg)] text-[var(--bm-text)] flex items-center justify-center">
        <p className="text-sm text-[var(--bm-text3)] font-mono">Loading today&apos;s mission…</p>
      </main>
    );
  }

  if (error && !mission) {
    return (
      <main className="min-h-screen bg-[var(--bm-bg)] text-[var(--bm-text)] flex items-center justify-center px-6">
        <p className="text-sm text-[var(--bm-red)] max-w-md text-center">{error}</p>
      </main>
    );
  }

  if (!mission) return null;

  const status = mission.project?.status ?? "not_started";
  const xpBarPct = progress?.xpToNextLevel != null
    ? Math.max(4, Math.round((progress.xpIntoLevel / (progress.xpIntoLevel + progress.xpToNextLevel)) * 100))
    : 100;

  return (
    <main className="min-h-screen bg-[var(--bm-bg)] text-[var(--bm-text)]">
      <div className="max-w-2xl mx-auto px-6 py-14">
        {/* ── Signature element: status strip ───────────────────────────── */}
        {progress && (
          <div className="rounded-lg border border-[var(--bm-border)] bg-[var(--bm-bg2)] px-5 py-4 mb-8 flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full border border-[var(--bm-accent-bd)] bg-[var(--bm-accent-dim)] flex items-center justify-center shrink-0">
                <span className="font-mono text-sm text-[var(--bm-accent)] font-medium">{progress.level}</span>
              </div>
              <div>
                <p className="text-sm font-medium leading-none mb-1">{progress.levelName}</p>
                <p className="text-xs text-[var(--bm-text3)] font-mono">
                  {progress.totalXp.toLocaleString()} XP
                </p>
              </div>
            </div>

            <div className="flex-1 min-w-[100px]">
              <div className="h-1.5 rounded-full bg-[var(--bm-bg4)] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-[var(--bm-accent)]"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, Math.max(4, xpBarPct))}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>
              {progress.xpToNextLevel !== null && (
                <p className="text-[10px] text-[var(--bm-text3)] font-mono mt-1">
                  {progress.xpToNextLevel} XP to next level
                </p>
              )}
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <div className="flex items-center gap-1.5" title={`${progress.currentStreak}-day streak`}>
                <Flame
                  size={16}
                  className={progress.currentStreak > 0 ? "text-[var(--bm-accent)]" : "text-[var(--bm-text4)]"}
                  fill={progress.currentStreak > 0 ? "var(--bm-accent)" : "none"}
                />
                <span className="font-mono text-sm">{progress.currentStreak}</span>
              </div>
              {progress.achievements.length > 0 && (
                <div
                  className="flex items-center gap-1.5"
                  title={progress.achievements.map((a) => a.name).join(", ")}
                >
                  <Trophy size={16} className="text-[var(--bm-accent)]" />
                  <span className="font-mono text-sm">{progress.achievements.length}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--bm-text3)] mb-3">
          Hi {studentName} &nbsp;·&nbsp; Module {mission.moduleOrder} / 16 &nbsp;·&nbsp; {mission.progressPct}% through the journey
        </p>
        <h1 className="font-syne text-3xl font-bold tracking-tight mb-2">{mission.moduleTitle}</h1>
        <p className="text-sm text-[var(--bm-text2)] mb-10">
          Today&apos;s build: <span className="text-[var(--bm-text)] font-medium">{mission.projectTitle}</span>
        </p>

        {/* ── Learn ──────────────────────────────────────────────────────── */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen size={15} className="text-[var(--bm-text3)]" />
            <h2 className="text-xs font-mono uppercase tracking-wider text-[var(--bm-text3)]">Learn</h2>
          </div>
          <div className="space-y-3">
            {mission.lessons.map((lesson) => (
              <div key={lesson.id} className="rounded-lg border border-[var(--bm-border)] bg-[var(--bm-bg2)] p-5">
                <div className="flex items-center justify-between mb-3 gap-3">
                  <h3 className="text-sm font-semibold">{lesson.title}</h3>
                  {lesson.completed ? (
                    <motion.span
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 20 }}
                      className="flex items-center gap-1 text-xs text-[var(--bm-green)] shrink-0"
                    >
                      <CheckCircle2 size={14} /> Done
                    </motion.span>
                  ) : (
                    <button
                      onClick={() => handleCompleteLesson(lesson.id)}
                      className="flex items-center gap-1 text-xs text-[var(--bm-text3)] hover:text-[var(--bm-text)] border border-[var(--bm-border2)] hover:border-[var(--bm-border3)] rounded-md px-2.5 py-1 shrink-0 transition-colors"
                    >
                      <Circle size={12} /> Mark complete
                    </button>
                  )}
                </div>

                <div className="flex items-start gap-2 rounded-md bg-[var(--bm-accent-dim)] border border-[var(--bm-accent-bd)] px-3 py-2.5 mb-4">
                  <Target size={13} className="text-[var(--bm-accent)] mt-0.5 shrink-0" />
                  <p className="text-xs text-[var(--bm-text2)] leading-relaxed">{lesson.whyItMatters}</p>
                </div>

                {lesson.body.map((para, i) => (
                  <p key={i} className="text-sm text-[var(--bm-text2)] leading-relaxed mb-2.5 last:mb-0">{para}</p>
                ))}

                <div className="mt-4">
                  <PythonCode code={lesson.codeExample.code} caption={lesson.codeExample.caption} />
                </div>

                <div className="mt-4">
                  <p className="text-[10px] font-mono uppercase tracking-wide text-[var(--bm-text3)] mb-2 flex items-center gap-1">
                    <AlertTriangle size={10} /> Common mistakes
                  </p>
                  <ul className="space-y-1.5">
                    {lesson.commonMistakes.map((m) => (
                      <li key={m} className="text-xs text-[var(--bm-text2)] leading-relaxed flex gap-2">
                        <span className="text-[var(--bm-text4)] shrink-0">—</span>
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-[var(--bm-border)]">
                  {lesson.keyTakeaways.map((t) => (
                    <span
                      key={t}
                      className="text-[11px] leading-snug text-[var(--bm-text3)] bg-[var(--bm-bg3)] border border-[var(--bm-border)] rounded-full px-2.5 py-1"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Practice ───────────────────────────────────────────────────── */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Wrench size={15} className="text-[var(--bm-text3)]" />
            <h2 className="text-xs font-mono uppercase tracking-wider text-[var(--bm-text3)]">Practice</h2>
          </div>
          <div className="space-y-2.5">
            {mission.exercises.map((exercise) => (
              <div
                key={exercise.id}
                className="rounded-lg border border-[var(--bm-border)] bg-[var(--bm-bg2)] p-4 border-l-2 border-l-[var(--bm-accent-bd)]"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1">
                    <span
                      className={`inline-block text-[10px] font-mono uppercase tracking-wide rounded px-1.5 py-0.5 mb-1.5 ${
                        DIFFICULTY_STYLES[exercise.difficulty]
                      }`}
                    >
                      {exercise.difficulty}
                    </span>
                    <p className="text-sm text-[var(--bm-text)]">{exercise.prompt}</p>
                  </div>
                  {exercise.completed ? (
                    <span className="flex items-center gap-1 text-xs text-[var(--bm-green)] shrink-0">
                      <CheckCircle2 size={14} /> Done
                    </span>
                  ) : (
                    <button
                      onClick={() => handleCompleteExercise(exercise.id)}
                      className="flex items-center gap-1 text-xs text-[var(--bm-text3)] hover:text-[var(--bm-text)] border border-[var(--bm-border2)] hover:border-[var(--bm-border3)] rounded-md px-2.5 py-1 shrink-0 transition-colors"
                    >
                      <Circle size={12} /> Mark complete
                    </button>
                  )}
                </div>
                <details className="group text-xs text-[var(--bm-text3)]">
                  <summary className="cursor-pointer list-none flex items-center gap-1 w-fit hover:text-[var(--bm-text2)]">
                    <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
                    Hint
                  </summary>
                  <p className="mt-2 pl-4 border-l border-[var(--bm-border)] text-[var(--bm-text2)]">{exercise.hint}</p>
                </details>
              </div>
            ))}
          </div>
        </section>

        {/* ── Build ──────────────────────────────────────────────────────── */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Github size={15} className="text-[var(--bm-text3)]" />
            <h2 className="text-xs font-mono uppercase tracking-wider text-[var(--bm-text3)]">Build</h2>
          </div>

          <div className="rounded-lg border border-[var(--bm-border)] bg-[var(--bm-bg2)] p-5">
            <h3 className="text-sm font-semibold mb-1">{mission.projectTitle}</h3>

            {mission.milestone?.deadline && (
              <p className="flex items-center gap-1.5 text-xs text-[var(--bm-text3)] font-mono mb-4">
                <Clock size={12} /> Due {new Date(mission.milestone.deadline).toLocaleDateString()}
              </p>
            )}

            {status === "not_started" && (
              <button
                onClick={handleStart}
                className="text-sm font-medium bg-[var(--bm-accent)] hover:bg-[var(--bm-accent2)] text-[var(--bm-text-inv)] rounded-md px-4 py-2 transition-colors"
              >
                Start this project
              </button>
            )}

            {(status === "in_progress" || status === "graded") && (
              <div className="mt-1 space-y-4">
                {mission.latestGrade && (
                  <div className="rounded-lg border border-[var(--bm-red-bd)] bg-[var(--bm-red-dim)] p-4 space-y-2">
                    <p className="text-sm font-medium text-[var(--bm-red)]">
                      Last score: {mission.latestGrade.score}/100 — let&apos;s tighten this up before moving on.
                    </p>
                    {mission.latestGrade.feedback && (
                      <p className="text-sm text-[var(--bm-text2)]">{mission.latestGrade.feedback}</p>
                    )}
                    {mission.latestGrade.required_fixes && (
                      <p className="text-sm text-[var(--bm-text2)]">
                        <span className="font-medium text-[var(--bm-text)]">Fix before resubmitting:</span>{" "}
                        {mission.latestGrade.required_fixes}
                      </p>
                    )}
                    {mission.remediation.length > 0 && (
                      <div className="pt-1">
                        <p className="text-[10px] font-mono uppercase tracking-wide text-[var(--bm-text3)] mb-1.5 flex items-center gap-1">
                          <Sparkles size={10} /> Focus on
                        </p>
                        <ul className="text-sm text-[var(--bm-text2)] space-y-1">
                          {mission.remediation.map((r) => (
                            <li key={r.skillId}>
                              <span className="font-medium text-[var(--bm-text)]">{r.skillName}:</span> {r.tip}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-3">
                  <input
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="GitHub repository URL"
                    className="w-full text-sm bg-[var(--bm-bg3)] border border-[var(--bm-border)] focus:border-[var(--bm-border3)] rounded-md px-3 py-2.5 outline-none transition-colors placeholder:text-[var(--bm-text3)]"
                  />
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notes / reflection (what you tried, what was hard)"
                    rows={3}
                    className="w-full text-sm bg-[var(--bm-bg3)] border border-[var(--bm-border)] focus:border-[var(--bm-border3)] rounded-md px-3 py-2.5 outline-none transition-colors placeholder:text-[var(--bm-text3)]"
                  />
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="text-sm font-medium bg-[var(--bm-accent)] hover:bg-[var(--bm-accent2)] text-[var(--bm-text-inv)] rounded-md px-4 py-2 disabled:opacity-50 transition-colors"
                  >
                    {submitting ? "Submitting…" : status === "graded" ? "Submit revision" : "Submit for review"}
                  </button>
                  {submitMsg && <p className="text-xs text-[var(--bm-green)]">{submitMsg}</p>}
                </div>
              </div>
            )}

            {status === "submitted" && (
              <p className="text-sm text-[var(--bm-text2)] mt-2">Submitted — waiting on feedback.</p>
            )}

            {status === "passed" && (
              <p className="flex items-center gap-1.5 text-sm text-[var(--bm-green)] mt-2">
                <CheckCircle2 size={16} /> You passed this one
              </p>
            )}
          </div>
        </section>

        {error && <p className="text-xs text-[var(--bm-red)]">{error}</p>}
      </div>
    </main>
  );
}
