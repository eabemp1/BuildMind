"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminProjectRow, getAdminProjects } from "@/lib/admin";

function fmtDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

export default function AdminProjectsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [projects, setProjects] = useState<AdminProjectRow[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        setProjects(await getAdminProjects());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load projects");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Projects</h1>
        <p className="text-body mt-1">All projects across the BuildMind platform.</p>
      </div>

      <Card className="glass-panel panel-glow">
        <CardHeader>
          <CardTitle className="text-zinc-100">Project Directory</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? <p className="text-sm text-zinc-400">Loading projects...</p> : null}
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          {!loading ? (
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-4">Project Name</th>
                  <th className="py-2 pr-4">Owner</th>
                  <th className="py-2 pr-4">Milestones</th>
                  <th className="py-2 pr-4">Creation Date</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td className="py-3 pr-4 font-medium text-zinc-100">{project.title}</td>
                    <td className="py-3 pr-4 text-zinc-300">{project.ownerEmail}</td>
                    <td className="py-3 pr-4 text-zinc-300">{project.milestonesCount}</td>
                    <td className="py-3 pr-4 text-zinc-400">{fmtDate(project.createdAt)}</td>
                    <td className="py-3 text-zinc-300">Active</td>
                  </tr>
                ))}
                {!projects.length ? (
                  <tr>
                    <td className="py-4 text-zinc-500" colSpan={5}>
                      No projects found.
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
