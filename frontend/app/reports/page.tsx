"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFounderWeeklyReport, type FounderWeeklyReportData } from "@/lib/api";

export default function ReportsPage() {
  const [report, setReport] = useState<FounderWeeklyReportData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getFounderWeeklyReport();
        setReport(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load report.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-zinc-100">Weekly Founder Report</h2>
        <p className="text-body mt-1">Your AI-generated progress summary for the week.</p>
      </div>

      {loading ? <p className="text-sm text-zinc-400">Loading report...</p> : null}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      {report ? (
        <Card className="glass-panel panel-glow">
          <CardHeader>
            <CardTitle className="text-zinc-100">Your Weekly Founder Report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-zinc-300">
            <div className="grid gap-2 md:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Projects</p>
                <p className="text-lg text-zinc-100">{report.projects_count}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Milestones</p>
                <p className="text-lg text-zinc-100">{report.milestones_completed}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Tasks</p>
                <p className="text-lg text-zinc-100">{report.tasks_completed}</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-zinc-100">Strength</p>
              <p>{report.ai_summary || "No summary generated yet."}</p>
              <p className="text-sm font-semibold text-zinc-100">Risk</p>
              <p>{report.ai_risks || "No risks identified yet."}</p>
              <p className="text-sm font-semibold text-zinc-100">Suggested Next Step</p>
              <p>{report.ai_suggestions || "No suggestions yet."}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </motion.section>
  );
}
