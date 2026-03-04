"use client";

import { useEffect, useState } from "react";
import MetricCard from "@/components/MetricCard";
import { DashboardData, getDashboard } from "@/lib/api";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        setError("");
        const result = await getDashboard();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  const metrics = [
    { label: "Execution Score", value: String(Math.round(data?.execution_score ?? 0)), hint: "Current score" },
    { label: "Projects", value: String(data?.project_count ?? 0), hint: "Total projects" },
    { label: "Milestones", value: String(data?.milestone_count ?? 0), hint: "Total milestones" },
    { label: "Tasks", value: String(data?.task_count ?? 0), hint: "Total tasks" },
    { label: "Consistency", value: `${Math.round((data?.weekly_consistency ?? 0) * 100)}%`, hint: "Weekly consistency" },
  ];

  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Dashboard</h2>
        <p className="mt-1 text-sm text-slate-600">Execution visibility across current founder goals.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} label={metric.label} value={metric.value} hint={metric.hint} />
        ))}
      </div>

      {isLoading ? <p className="text-sm text-slate-500">Loading dashboard...</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Execution Trend (Placeholder)</h3>
        <div className="mt-4 h-72 rounded-lg border border-dashed border-slate-300 bg-slate-50" />
      </div>
    </section>
  );
}
