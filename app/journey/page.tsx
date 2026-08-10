"use client";

/**
 * app/journey/page.tsx — Developer Journey: Today (student view)
 *
 * Phase 1 vertical slice. Deliberately minimal — proves the loop
 * (today → project → submit) end to end. Not yet wired into
 * lib/nav-config.ts or styled to the full shared component library;
 * see docs/developer-journey-phase0-audit.md, section M.
 */

import { useEffect, useState, useCallback } from "react";
import type { TodayMission } from "@/lib/journey";

interface ProgressSummary {
  level: number;
  levelName: string;
  totalXp: number;
  xpToNextLevel: number | null;
  currentStreak: number;
  achievements: { id: string; name: string; description: string; unlockedAt: string }[];
}

export default function JourneyTodayPage() {
  const [mission, setMission] = useState<TodayMission | null>(null);
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [todayRes, progressRes] = await Promise.all([
        fetch("/api/journey/today"),
        fetch("/api/journey/progress"),
      ]);
      const data = await todayRes.json();
      if (!data.ok) throw new Error(data.error || "Failed to load");
      setMission(data.mission);

      const progressData = await progressRes.json();
      if (progressData.ok) setProgress(progressData.progress);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleStart() {
    if (!mission) return;
    setSubmitMsg(null);
    const res = await fetch("/api/journey/projects/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module_order: mission.moduleOrder }),
    });
    const data = await res.json();
    if (data.ok) await load();
    else setError(data.error || "Failed to start project");
  }

  async function handleSubmit() {
    if (!mission?.project) return;
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const res = await fetch(`/api/journey/projects/${mission.project.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository_url: repoUrl || undefined, notes: notes || undefined }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to submit");
      setSubmitMsg("Submitted. Your mentor will review it.");
      setRepoUrl("");
      setNotes("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--bm-bg)] text-[var(--bm-text)] flex items-center justify-center">
        <p className="text-sm text-[var(--bm-text3)]">Loading today&apos;s mission…</p>
      </main>
    );
  }

  if (error && !mission) {
    return (
      <main className="min-h-screen bg-[var(--bm-bg)] text-[var(--bm-text)] flex items-center justify-center px-6">
        <p className="text-sm text-red-400 max-w-md text-center">{error}</p>
      </main>
    );
  }

  if (!mission) return null;

  const status = mission.project?.status ?? "not_started";

  return (
    <main className="min-h-screen bg-[var(--bm-bg)] text-[var(--bm-text)]">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <p className="text-xs uppercase tracking-wider text-[var(--bm-text3)] mb-2">
          Module {mission.moduleOrder} of 16 · {mission.progressPct}% through the journey
        </p>
        <h1 className="text-2xl font-semibold tracking-tight mb-1">{mission.moduleTitle}</h1>
        <p className="text-sm text-[var(--bm-text2)] mb-4">
          Today&apos;s build: <span className="font-medium text-[var(--bm-text)]">{mission.projectTitle}</span>
        </p>

        {progress && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--bm-text3)] mb-8 pb-6 border-b border-[var(--bm-border)]">
            <span className="font-medium text-[var(--bm-text)]">
              Level {progress.level} · {progress.levelName}
            </span>
            <span>{progress.totalXp} XP{progress.xpToNextLevel !== null ? ` (${progress.xpToNextLevel} to next level)` : " (max level)"}</span>
            {progress.currentStreak > 0 && <span>🔥 {progress.currentStreak}-day streak</span>}
            {progress.achievements.length > 0 && (
              <span title={progress.achievements.map((a) => a.name).join(", ")}>
                🏆 {progress.achievements.length} achievement{progress.achievements.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        )}

        <section className="border border-[var(--bm-border)] rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold mb-3">Study</h2>
          <ul className="text-sm text-[var(--bm-text2)] space-y-1 list-disc list-inside">
            {mission.topics.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>

        <section className="border border-[var(--bm-border)] rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold mb-3">Build: {mission.projectTitle}</h2>

          {status === "not_started" && (
            <button
              onClick={handleStart}
              className="text-sm font-medium bg-white text-black rounded-lg px-4 py-2"
            >
              Start this project
            </button>
          )}

          {mission.milestone?.deadline && (
            <p className="text-xs text-[var(--bm-text3)] mt-3">
              Due: {new Date(mission.milestone.deadline).toLocaleDateString()}
            </p>
          )}

          {(status === "in_progress" || status === "graded") && (
            <div className="mt-4 space-y-3">
              {mission.latestGrade && (
                <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium text-amber-400">
                    Last score: {mission.latestGrade.score}/100 — let&apos;s tighten this up before moving on.
                  </p>
                  {mission.latestGrade.feedback && (
                    <p className="text-sm text-[var(--bm-text2)]">{mission.latestGrade.feedback}</p>
                  )}
                  {mission.latestGrade.required_fixes && (
                    <p className="text-sm text-[var(--bm-text2)]">
                      <span className="font-medium">Fix before resubmitting:</span> {mission.latestGrade.required_fixes}
                    </p>
                  )}
                  {mission.remediation.length > 0 && (
                    <div className="pt-1">
                      <p className="text-xs uppercase tracking-wide text-[var(--bm-text3)] mb-1">Focus on</p>
                      <ul className="text-sm text-[var(--bm-text2)] space-y-1 list-disc list-inside">
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
              <input
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="GitHub repository URL"
                className="w-full text-sm bg-transparent border border-[var(--bm-border)] rounded-lg px-3 py-2 outline-none"
              />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes / reflection (what you tried, what was hard)"
                rows={3}
                className="w-full text-sm bg-transparent border border-[var(--bm-border)] rounded-lg px-3 py-2 outline-none"
              />
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="text-sm font-medium bg-white text-black rounded-lg px-4 py-2 disabled:opacity-50"
              >
                {submitting ? "Submitting…" : status === "graded" ? "Submit revision" : "Submit for review"}
              </button>
              {submitMsg && <p className="text-xs text-emerald-400">{submitMsg}</p>}
            </div>
          )}

          {status === "submitted" && (
            <p className="text-sm text-[var(--bm-text2)] mt-2">
              Submitted — waiting on mentor feedback.
            </p>
          )}

          {status === "passed" && (
            <p className="text-sm text-[var(--bm-text2)] mt-2">Graded — you passed this one 🎉</p>
          )}
        </section>

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </main>
  );
}
