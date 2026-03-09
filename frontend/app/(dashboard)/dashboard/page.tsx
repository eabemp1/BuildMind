"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardCard from "@/components/dashboard-card";
import DashboardVisuals from "@/components/dashboard-visuals";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { calculateDashboardStats, getDashboardOverview, getProjectsForCurrentUser } from "@/lib/buildmind";

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Awaited<ReturnType<typeof getProjectsForCurrentUser>>>([]);
  const [recentActivity, setRecentActivity] = useState<string[]>([]);
  const [aiUsage, setAiUsage] = useState(0);
  const [milestonesCompleted, setMilestonesCompleted] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const [projectRows, overview] = await Promise.all([getProjectsForCurrentUser(), getDashboardOverview()]);
        setProjects(projectRows);
        setRecentActivity(overview.recentActivity);
        setAiUsage(overview.aiUsage);
        setMilestonesCompleted(overview.milestonesCompleted);
      } catch {
        setProjects([]);
        setRecentActivity([]);
        setAiUsage(0);
        setMilestonesCompleted(0);
      }
    };
    void load();
  }, []);

  const stats = useMemo(
    () => calculateDashboardStats(projects),
    [projects]
  );

  const momentumData = useMemo(
    () =>
      projects.slice(0, 6).reverse().map((p, index) => ({
        name: `P${index + 1}`,
        progress: Math.min(100, 20 + p.validation_strengths.length * 20),
      })),
    [projects],
  );

  const stageMix = useMemo(() => {
    const map = new Map<string, number>();
    projects.forEach((project) => {
      const stage = project.validation_strengths.length >= 3 ? "Validation" : project.validation_strengths.length > 0 ? "Discovery" : "Idea";
      map.set(stage, (map.get(stage) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([stage, count]) => ({ stage, count }));
  }, [projects]);

  if (projects.length === 0) {
    return (
      <section className="space-y-6 fade-up">
        <Card className="overflow-hidden border-slate-200/80 bg-white/90">
          <div className="bg-gradient-to-r from-teal-600 to-blue-600 px-6 py-5 text-white">
            <p className="text-xs uppercase tracking-[0.2em] text-teal-100">New Workspace</p>
            <h3 className="mt-1 text-xl font-semibold">Welcome to BuildMind</h3>
          </div>
          <CardHeader>
            <CardTitle className="text-2xl">Create your first startup idea</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">Set your idea, target users, and problem statement. BuildMind will generate your first roadmap instantly.</p>
            <Button className="bg-slate-900 hover:bg-slate-800" onClick={() => router.push("/projects")}>Create Project</Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-6 fade-up">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Dashboard</h2>
        <p className="mt-1 text-sm text-slate-600">Execution overview for your BuildMind workspace.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardCard title="Active Projects" value={String(stats.activeProjects)} />
        <DashboardCard title="Milestones Completed" value={String(milestonesCompleted)} helper="Across all projects" />
        <DashboardCard title="AI Usage" value={`${aiUsage}/20`} tone="positive" />
        <DashboardCard title="Recent Activity" value={String(recentActivity.length)} helper="Latest signals" />
      </div>

      <DashboardVisuals momentum={momentumData} stageMix={stageMix} />

      <Card className="border-slate-200/80 bg-white/90">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-slate-700">
            {recentActivity.map((item, idx) => (
              <li key={idx} className="rounded-lg border border-slate-200 px-3 py-2">
                {item}
              </li>
            ))}
            {!recentActivity.length ? <li className="text-slate-500">No activity yet.</li> : null}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
