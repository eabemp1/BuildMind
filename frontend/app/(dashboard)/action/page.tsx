"use client";

import { useEffect, useMemo, useState } from "react";
import PageHero from "@/components/layout/page-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  completeTask,
  getActiveProjectId,
  getBuildmindDashboard,
  getProjects,
  type BuildmindDashboardData,
  type ProjectData,
} from "@/lib/api";

export default function TodayActionPage() {
  const [copied, setCopied] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<BuildmindDashboardData | null>(null);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([getBuildmindDashboard(), getProjects()])
      .then(([dash, projs]) => {
        if (!mounted) return;
        setDashboard(dash);
        setProjects(projs);
        setError(null);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load today's action.");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [reloadKey]);

  const activeProject = useMemo(() => {
    const activeId = getActiveProjectId();
    return projects.find((p) => p.id === activeId) ?? projects[0] ?? null;
  }, [projects]);

  const pendingTasks = useMemo(() => {
    return (activeProject?.milestones ?? []).flatMap((m) => m.tasks ?? []).filter((t) => !t.is_completed);
  }, [activeProject]);

  const primaryAction = dashboard?.next_actions?.[0];
  const actionTitle = primaryAction?.title || pendingTasks[0]?.description || "Complete your highest impact task for today.";
  const stage = activeProject?.startup_stage || dashboard?.active_projects?.[0]?.stage || "MVP";
  const projectTitle = activeProject?.title || "your product";
  const targetUsers = activeProject?.target_users || activeProject?.problem || "founders";

  const message = `Hey — I’m building ${projectTitle} to help ${targetUsers}. Could I steal 10 minutes for feedback today? Here’s the link: [your-link]`;

  const copyMessage = () => {
    navigator.clipboard.writeText(message).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleComplete = async () => {
    if (!primaryAction?.task_id) {
      setCommitted(true);
      return;
    }
    setCompletingId(primaryAction.task_id);
    try {
      await completeTask(primaryAction.task_id);
      setCommitted(true);
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark the task complete.");
    } finally {
      setCompletingId(null);
    }
  };

  return (
    <section className="space-y-6">
      <PageHero
        kicker="Focus"
        title="Today's Action"
        subtitle="One high-leverage action, grounded in your project data and stage."
        actions={
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
            Stage: {stage}
          </span>
        }
      />

      {loading ? <p className="text-sm text-zinc-400">Loading action...</p> : null}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <Card className="glass-panel panel-glow border border-white/10">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Do This Now</CardTitle>
            <p className="text-body mt-1">Personalised action for {projectTitle}.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
              AI + proven founder actions
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-zinc-200">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-base font-semibold text-zinc-100">
            {actionTitle}
          </div>

          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-4 text-sm text-zinc-200">
            <div className="flex items-start justify-between gap-3">
              <p className="italic">"{message}"</p>
              <button
                onClick={copyMessage}
                className="rounded-lg border border-white/10 bg-white/10 px-2 py-1 text-xs text-zinc-100 transition hover:bg-white/20"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <button
              onClick={copyMessage}
              className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-4 py-3 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-500/20"
            >
              Copy message
            </button>
            <button
              onClick={handleComplete}
              className="rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-400/40"
              disabled={Boolean(completingId)}
            >
              {committed ? "Committed!" : completingId ? "Marking..." : "Mark done"}
            </button>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Time Block</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div>
                <p className="text-xs font-semibold text-indigo-200">Focus</p>
                <p className="text-sm">Shipping — send the message before any other work.</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-indigo-200">What you do</p>
                <p className="text-sm">Open your project, complete one task, log the outcome.</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-indigo-200">Evening</p>
                <p className="text-sm">Follow up with 3 potential users to keep momentum.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel panel-glow">
        <CardHeader>
          <CardTitle>Why this works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-zinc-300">
          {[
            "Direct outreach beats organic traffic in the first 10 customers for most successful SaaS products.",
            "Fast feedback loops are the clearest predictor of early traction at MVP stage.",
            "Daily actions compound — short streaks create confidence and momentum.",
          ].map((item) => (
            <div key={item} className="rounded-lg border border-white/10 bg-white/5 p-3">
              {item}
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
