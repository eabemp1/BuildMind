"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MetricCard from "@/components/MetricCard";
import { DashboardData, getDashboard, getStoredToken, markTourSeen, shouldShowTour } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    if (!getStoredToken()) {
      router.replace("/projects");
      return;
    }
    setShowTour(shouldShowTour());
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
  }, [router]);

  const closeTour = () => {
    markTourSeen();
    setShowTour(false);
  };

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

      {showTour ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-slate-900">Welcome to your dashboard</h3>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-700">
              <li>Use the sidebar to navigate between dashboard, projects, execution, and analytics.</li>
              <li>Execution Score shows your current weekly execution momentum.</li>
              <li>Project board holds milestones and tasks generated from your startup goal.</li>
            </ul>
            <button onClick={closeTour} className="mt-6 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Start using EvolvAI
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
