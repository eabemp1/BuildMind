"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import DashboardCard from "@/components/dashboard-card";
import DashboardVisuals from "@/components/dashboard-visuals";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { calculateDashboardStats } from "@/lib/buildmind";
import { useDashboardOverviewQuery, useProjectsQuery } from "@/lib/queries";
import { Activity, BarChart2, Bot, CheckCircle2 } from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const { data: projects = [], isLoading: projectsLoading } = useProjectsQuery();
  const { data: overview, isLoading: overviewLoading } = useDashboardOverviewQuery();

  const stats = useMemo(() => calculateDashboardStats(projects), [projects]);

  const execution = useMemo(
    () =>
      projects.slice(0, 8).reverse().map((project, index) => ({
        name: `P${index + 1}`,
        progress: Math.min(100, 20 + project.validation_strengths.length * 15),
      })),
    [projects],
  );

  const aiUsageTrend = useMemo(() => {
    const baseline = overview?.aiUsage ?? 0;
    return [
      { name: "W1", usage: Math.max(0, baseline - 4) },
      { name: "W2", usage: Math.max(0, baseline - 2) },
      { name: "W3", usage: Math.max(0, baseline - 1) },
      { name: "W4", usage: baseline },
    ];
  }, [overview?.aiUsage]);

  if (projectsLoading || overviewLoading) {
    return <div className="text-sm text-zinc-400">Loading dashboard...</div>;
  }

  if (!projects.length) {
    return (
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <Card className="glass-panel panel-glow overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-500/30 to-purple-500/30 px-6 py-5">
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-200">Welcome</p>
            <h3 className="mt-1 text-xl font-semibold text-zinc-100">Create your first startup idea</h3>
          </div>
          <CardContent className="space-y-4 p-6">
            <p className="text-body">Turn your idea into an execution roadmap with milestones, tasks, and AI guidance.</p>
            <Button className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white" onClick={() => router.push("/projects")}>
              Create Project
            </Button>
          </CardContent>
        </Card>
      </motion.section>
    );
  }

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-zinc-100">Dashboard</h2>
        <p className="text-body mt-1">Track momentum, execution quality, and AI guidance across your projects.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardCard
          title="Active Projects"
          value={String(stats.activeProjects)}
          trend="Trending up this week"
          icon={<BarChart2 size={16} />}
        />
        <DashboardCard
          title="Completed Tasks"
          value={String(overview?.completedTasks ?? 0)}
          trend="On pace for weekly goal"
          icon={<CheckCircle2 size={16} />}
        />
        <DashboardCard
          title="Milestones Completed"
          value={String(overview?.milestonesCompleted ?? 0)}
          trend="Execution in motion"
          icon={<Activity size={16} />}
        />
        <DashboardCard
          title="AI Usage"
          value={`${overview?.aiUsage ?? 0}/20`}
          trend="Monthly allowance"
          tone="positive"
          icon={<Bot size={16} />}
        />
      </div>

      <DashboardVisuals execution={execution} aiUsage={aiUsageTrend} />

      <Card className="glass-panel panel-glow">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base text-zinc-100">Weekly Founder Report</CardTitle>
          <Button
            variant="outline"
            className="border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"
            onClick={() => router.push("/reports")}
          >
            View Report
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-300">
            Get a weekly AI summary of your progress, risks, and next-step recommendations.
          </p>
        </CardContent>
      </Card>

      <Card className="glass-panel panel-glow">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base text-zinc-100">Activity Feed</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" className="border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10" onClick={() => router.push("/projects")}>
              Create Project
            </Button>
            <Button className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white" onClick={() => router.push("/ai-coach")}>
              Open BuildMini
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {(overview?.recentActivity ?? []).map((item, idx) => (
              <li key={idx} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300">
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </motion.section>
  );
}
