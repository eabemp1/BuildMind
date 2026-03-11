"use client";

import { useEffect, useState } from "react";
import AdminLineChart from "@/components/admin/admin-line-chart";
import AdminMetricCard from "@/components/admin/admin-metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminOverview, getAdminProjects, getAdminUsers } from "@/lib/admin";

type AnalyticsState = {
  totalUsers: number;
  activeUsers: number;
  totalProjects: number;
  totalTasks: number;
  userGrowth: Array<{ date: string; count: number }>;
  projectTrends: Array<{ date: string; count: number }>;
};

export default function AdminAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [state, setState] = useState<AnalyticsState>({
    totalUsers: 0,
    activeUsers: 0,
    totalProjects: 0,
    totalTasks: 0,
    userGrowth: [],
    projectTrends: [],
  });

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const [overview, users, projects] = await Promise.all([getAdminOverview(), getAdminUsers(), getAdminProjects()]);
        const usersByDay = new Map<string, number>();
        for (const row of users) {
          const day = row.createdAt.slice(0, 10);
          usersByDay.set(day, (usersByDay.get(day) ?? 0) + 1);
        }
        const projectsByDay = new Map<string, number>();
        for (const row of projects) {
          const day = row.createdAt.slice(0, 10);
          projectsByDay.set(day, (projectsByDay.get(day) ?? 0) + 1);
        }
        setState({
          totalUsers: overview.totalUsers,
          activeUsers: overview.activeUsers,
          totalProjects: overview.totalProjects,
          totalTasks: projects.reduce((sum, p) => sum + p.milestonesCount, 0),
          userGrowth: Array.from(usersByDay.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, count]) => ({ date, count })),
          projectTrends: Array.from(projectsByDay.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, count]) => ({ date, count })),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load analytics");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Analytics</h1>
        <p className="text-body mt-1">Growth and execution trends across the entire platform.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard title="Total Users" value={String(state.totalUsers)} />
        <AdminMetricCard title="Active Users" value={String(state.activeUsers)} />
        <AdminMetricCard title="Total Projects" value={String(state.totalProjects)} />
        <AdminMetricCard title="Total Tasks" value={String(state.totalTasks)} />
      </div>

      {loading ? <p className="text-sm text-zinc-400">Loading analytics...</p> : null}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      {!loading && !error ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="glass-panel panel-glow">
            <CardHeader>
              <CardTitle className="text-zinc-100">User Growth</CardTitle>
            </CardHeader>
            <CardContent>
              <AdminLineChart data={state.userGrowth} />
            </CardContent>
          </Card>
          <Card className="glass-panel panel-glow">
            <CardHeader>
              <CardTitle className="text-zinc-100">Project Creation Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <AdminLineChart data={state.projectTrends} stroke="#059669" />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </section>
  );
}
