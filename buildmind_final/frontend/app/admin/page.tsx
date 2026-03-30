"use client";

import { useEffect, useState } from "react";
import AdminMetricCard from "@/components/admin/admin-metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminOverview } from "@/lib/admin";

export default function AdminOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [metrics, setMetrics] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalProjects: 0,
    aiRequests: 0,
  });

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const overview = await getAdminOverview();
        setMetrics({
          totalUsers: overview.totalUsers,
          activeUsers: overview.activeUsers,
          totalProjects: overview.totalProjects,
          aiRequests: overview.aiRequests,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load admin overview");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Admin Overview</h1>
        <p className="text-body mt-1">Global BuildMind metrics and platform health snapshot.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard title="Total Users" value={String(metrics.totalUsers)} />
        <AdminMetricCard title="Active Users" value={String(metrics.activeUsers)} helper="Daily active users" />
        <AdminMetricCard title="Total Projects" value={String(metrics.totalProjects)} />
        <AdminMetricCard title="AI Usage Requests" value={String(metrics.aiRequests)} />
      </div>

      <Card className="glass-panel panel-glow">
        <CardHeader>
          <CardTitle className="text-zinc-100">Status</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-zinc-400">Loading admin metrics...</p> : null}
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          {!loading && !error ? <p className="text-sm text-emerald-300">Admin dashboard is online and synced with platform data.</p> : null}
        </CardContent>
      </Card>
    </section>
  );
}
