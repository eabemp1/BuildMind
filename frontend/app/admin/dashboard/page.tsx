"use client";

import { useEffect, useState } from "react";
import { getAdminAnalytics, AdminAnalyticsData } from "@/lib/api";

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminAnalyticsData | null>(null);
  useEffect(() => {
    const load = async () => {
      try {
        setData(await getAdminAnalytics());
      } catch {
        setData(null);
      }
    };
    void load();
  }, []);

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-slate-900">Admin Dashboard</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-slate-200 bg-white p-4">Users: {data?.total_users ?? 0}</div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">Projects: {data?.total_projects ?? 0}</div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">Milestones: {data?.total_milestones ?? 0}</div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">Tasks: {data?.total_tasks ?? 0}</div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">DAU: {data?.daily_active_users ?? 0}</div>
      </div>
    </section>
  );
}
