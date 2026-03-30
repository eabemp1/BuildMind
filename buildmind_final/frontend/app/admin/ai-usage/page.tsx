"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminAiUsageRow, getAdminAiUsage } from "@/lib/admin";

function fmtDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function AdminAiUsagePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<AdminAiUsageRow[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        setRows(await getAdminAiUsage());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load AI usage");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">AI Usage</h1>
        <p className="text-body mt-1">Monitor AI activity, usage volume, and latest interactions.</p>
      </div>

      <Card className="glass-panel panel-glow">
        <CardHeader>
          <CardTitle className="text-zinc-100">Usage by User</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? <p className="text-sm text-zinc-400">Loading AI usage...</p> : null}
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          {!loading ? (
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-4">User</th>
                  <th className="py-2 pr-4">AI Requests</th>
                  <th className="py-2 pr-4">Tokens Used</th>
                  <th className="py-2">Last Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {rows.map((row) => (
                  <tr key={row.userId}>
                    <td className="py-3 pr-4 font-medium text-zinc-100">{row.userEmail}</td>
                    <td className="py-3 pr-4 text-zinc-300">{row.requests}</td>
                    <td className="py-3 pr-4 text-zinc-300">{row.tokensUsed.toLocaleString()}</td>
                    <td className="py-3 text-zinc-400">{fmtDate(row.lastActivity)}</td>
                  </tr>
                ))}
                {!rows.length ? (
                  <tr>
                    <td className="py-4 text-zinc-500" colSpan={4}>
                      No AI usage records found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
