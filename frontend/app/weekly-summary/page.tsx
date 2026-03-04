"use client";

import { useEffect, useMemo, useState } from "react";
import { WeeklyReportData, getWeeklyReport } from "@/lib/api";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function WeeklySummaryPage() {
  const [data, setData] = useState<WeeklyReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        setError("");
        setData(await getWeeklyReport());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load weekly report");
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  const trend = useMemo(
    () =>
      (data?.execution_score_trend || []).map((x) => ({
        day: x.date.slice(5),
        score: Math.round(x.score),
      })),
    [data],
  );

  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Weekly Summary</h2>
        <p className="mt-1 text-sm text-slate-600">Last 7 days execution metrics and reinforcement signals.</p>
      </div>

      {isLoading ? <p className="text-sm text-slate-500">Loading weekly summary...</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Tasks Completed</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{data?.tasks_completed_this_week ?? 0}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Positive Feedback</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{data?.feedback.positive ?? 0}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Feedback Ratio</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{Math.round((data?.feedback.positive_ratio ?? 0) * 100)}%</p>
        </article>
      </div>

      <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Execution Score Trend (7 days)</h3>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </article>
    </section>
  );
}
