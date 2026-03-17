"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import DashboardCard from "@/components/dashboard-card";
import ProgressBar from "@/components/progress-bar";
import { Button } from "@/components/ui/button";
import GlowCard from "@/components/ui/glow-card";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import PageHero from "@/components/layout/page-hero";
import { calculateDashboardStats, computeStartupScore, type ProjectSummary } from "@/lib/buildmind";
import { getActiveProjectId } from "@/lib/api";
import { useClearNotificationsMutation, useDashboardOverviewQuery, useProjectsQuery, useProjectSummariesQuery } from "@/lib/queries";
import { BarChart2, CheckCircle2, Flame, Rocket, Zap } from "lucide-react";
import { FEATURES } from "@/lib/features";

export default function DashboardPage() {
  const router = useRouter();
  const { data: projects = [], isLoading: projectsLoading } = useProjectsQuery();
  const { data: summaries = [], isLoading: summariesLoading } = useProjectSummariesQuery();
  const { data: overview, isLoading: overviewLoading } = useDashboardOverviewQuery();
  const clearFeedMutation = useClearNotificationsMutation();

  const stats = useMemo(() => calculateDashboardStats(projects), [projects]);
  const activeProjectSummary = useMemo<ProjectSummary | null>(() => {
    if (!summaries.length) return null;
    return summaries.reduce((latest, current) =>
      new Date(current.lastActivity).getTime() > new Date(latest.lastActivity).getTime() ? current : latest,
    );
  }, [summaries]);

  const activeProjectScore = useMemo(() => {
    if (!summaries.length) return 0;
    return computeStartupScore(activeProjectSummary ?? summaries[0]);
  }, [summaries, activeProjectSummary]);
  const activeProjectName = useMemo(() => {
    if (!summaries.length) return "No projects yet";
    return (activeProjectSummary ?? summaries[0]).title ?? "Active project";
  }, [summaries, activeProjectSummary]);
  const activeProjectHint = useMemo(() => {
    if (!summaries.length) return "";
    if (summaries.length === 1) return `Active project · ${activeProjectName}`;
    return `Most recent activity · ${activeProjectName} · ${summaries.length} active`;
  }, [summaries, activeProjectName]);
  const activeStage = useMemo(() => {
    if (!activeProjectSummary) return "Idea";
    const stage = (activeProjectSummary.startup_stage ?? "").trim();
    if (stage) return stage;
    const strengthCount = activeProjectSummary.validation_strengths?.length ?? 0;
    if (strengthCount >= 3) return "Validation";
    if (strengthCount > 0) return "Discovery";
    return "Idea";
  }, [activeProjectSummary]);

  const nextAction = useMemo(() => {
    const stage = activeStage.toLowerCase();
    if (stage.includes("validation")) {
      return {
        action: "Talk to 5 potential users to validate your idea.",
        reason: "Your project is currently in the Validation stage and user feedback is missing.",
      };
    }
    if (stage.includes("discovery")) {
      return {
        action: "Run quick customer discovery calls this week.",
        reason: "Early discovery will sharpen your target market and problem definition.",
      };
    }
    if (stage.includes("mvp")) {
      return {
        action: "Build a focused prototype that solves one core problem.",
        reason: "Move from planning to a tangible MVP to learn faster.",
      };
    }
    if (stage.includes("launch")) {
      return {
        action: "Acquire your first 10 users through a focused channel.",
        reason: "Launch momentum needs a measurable acquisition experiment.",
      };
    }
    if (stage.includes("growth")) {
      return {
        action: "Scale the best-performing marketing channel.",
        reason: "Focus on the channel that consistently drives activation.",
      };
    }
    return {
      action: "Run quick market research to validate the opportunity.",
      reason: "Clarify your target users and validate the problem urgency.",
    };
  }, [activeStage]);

  const executionScore = activeProjectSummary?.execution_score ?? 0;
  const validationScore = activeProjectSummary?.validation_score ?? 0;
  const progressScore = activeProjectSummary?.progress ?? 0;

  const milestoneProgress = useMemo(() => {
    const total = overview?.milestonesCompleted ?? 0;
    const active = stats.activeProjects || 1;
    return Math.min(100, Math.round((total / (active * 4)) * 100));
  }, [overview?.milestonesCompleted, stats.activeProjects]);

  if (projectsLoading || summariesLoading || overviewLoading) {
    return <div className="text-sm text-zinc-400">Loading dashboard...</div>;
  }

  if (!projects.length) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-7xl space-y-8 px-6"
      >
        <GlowCard className="overflow-hidden p-0">
          <div className="bg-gradient-to-r from-indigo-500/30 to-purple-500/30 px-6 py-5">
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-200">Welcome</p>
            <h3 className="mt-1 text-xl font-semibold text-zinc-100">Create your first startup idea</h3>
          </div>
          <CardContent className="space-y-4 px-6 pb-6">
            <p className="text-body">Turn your idea into an execution roadmap with milestones, tasks, and AI guidance.</p>
            <Button className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white" onClick={() => router.push("/projects")}>
              Create Project
            </Button>
          </CardContent>
        </GlowCard>
      </motion.section>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-7xl space-y-8 px-6"
    >
      <PageHero
        kicker="Dashboard"
        title="Execution Dashboard"
        subtitle="Track momentum, execution quality, and AI guidance across your projects."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <GlowCard className="p-6">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-indigo-300" />
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Next Best Action</p>
          </div>
          <p className="mt-4 text-lg font-semibold text-zinc-100">{nextAction.action}</p>
          <p className="mt-3 text-sm text-zinc-400">{nextAction.reason}</p>
        </GlowCard>

        <GlowCard className="p-6">
          <div className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-indigo-300" />
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Startup Score</p>
          </div>
          <p className="mt-4 text-4xl font-bold text-zinc-100">{activeProjectScore} / 100</p>
          <div className="mt-4 space-y-3 text-xs text-zinc-400">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span>Execution Score</span>
                <span className="text-zinc-200">{executionScore}</span>
              </div>
              <ProgressBar value={executionScore} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span>Validation Score</span>
                <span className="text-zinc-200">{validationScore}</span>
              </div>
              <ProgressBar value={validationScore} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span>Progress Score</span>
                <span className="text-zinc-200">{progressScore}</span>
              </div>
              <ProgressBar value={progressScore} />
            </div>
          </div>
        </GlowCard>

        <GlowCard className="p-6">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-300" />
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Founder Execution Streak</p>
          </div>
          <p className="mt-4 text-3xl font-bold text-orange-400">{overview?.founderStreakDays ?? 0} days</p>
          <p className="mt-3 text-sm text-zinc-400">
            You have completed tasks for {overview?.founderStreakDays ?? 0} days in a row.
          </p>
        </GlowCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardCard
          title="Startup Score"
          value={`${activeProjectScore}/100`}
          trend={activeProjectHint}
          icon={<BarChart2 size={16} />}
        />
        <DashboardCard
          title="Projects Summary"
          value={`${stats.activeProjects} active`}
          trend={`${overview?.completedTasks ?? 0} tasks completed`}
          icon={<CheckCircle2 size={16} />}
        />

        <GlowCard className="p-0">
          <CardHeader className="mb-6 px-6 pt-6">
            <CardTitle className="text-base text-zinc-100">Milestones Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-6 pb-6">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Completed milestones</span>
              <span className="text-zinc-200">{overview?.milestonesCompleted ?? 0}</span>
            </div>
            <ProgressBar value={milestoneProgress} />
            <p className="text-xs text-zinc-400">{milestoneProgress}% of milestone targets completed</p>
          </CardContent>
        </GlowCard>

        <GlowCard className="p-0">
          <CardHeader className="mb-6 px-6 pt-6">
            <CardTitle className="text-base text-zinc-100">Quick BuildMini</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-6 pb-6">
            <Input
              placeholder="Ask BuildMini about your next steps..."
              className="h-10 border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"
                onClick={() => router.push("/projects")}
              >
                Create Project
              </Button>
              <Button className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white" onClick={() => router.push("/ai-coach")}>
                Open BuildMini
              </Button>
            </div>
          </CardContent>
        </GlowCard>
      </div>

      {FEATURES.analytics ? (
        <GlowCard className="p-0">
          <CardHeader className="mb-6 flex flex-row items-center justify-between px-6 pt-6">
            <CardTitle className="text-base text-zinc-100">Weekly Founder Report</CardTitle>
            <Button
              variant="outline"
              className="border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"
              onClick={() => router.push("/reports")}
            >
              View Report
            </Button>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-sm text-zinc-300">
              Get a weekly AI summary of your progress, risks, and next-step recommendations.
            </p>
          </CardContent>
        </GlowCard>
      ) : null}

      <GlowCard className="p-0">
        <CardHeader className="mb-6 flex flex-row items-center justify-between px-6 pt-6">
          <CardTitle className="text-base text-zinc-100">Recent Activity</CardTitle>
          <Button
            variant="outline"
            className="border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"
            onClick={() => void clearFeedMutation.mutateAsync()}
            disabled={clearFeedMutation.isPending || (overview?.recentActivity?.length ?? 0) === 0}
          >
            {clearFeedMutation.isPending ? "Clearing..." : "Clear feed"}
          </Button>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <ul className="space-y-2">
            {(overview?.recentActivity ?? []).map((item, idx) => (
              <li key={idx} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300">
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </GlowCard>
    </motion.section>
  );
}
