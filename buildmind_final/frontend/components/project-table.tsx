"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ProgressBar from "@/components/progress-bar";

type ProjectRow = {
  id: string;
  title: string;
  stage: string;
  progress: number;
  milestones: number;
};

export default function ProjectTable({ rows }: { rows: ProjectRow[] }) {
  const router = useRouter();

  return (
    <Card className="glass-panel panel-glow">
      <CardHeader>
        <CardTitle className="text-zinc-100">Projects</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-2">Project</th>
              <th className="py-2">Stage</th>
              <th className="py-2">Milestones</th>
              <th className="py-2">Progress</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="group cursor-pointer border-b border-white/5 transition hover:bg-white/5"
                onClick={() => router.push(`/projects/${row.id}`)}
              >
                <td className="py-3 font-medium text-zinc-100">{row.title}</td>
                <td className="py-3">
                  <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-medium text-zinc-300">
                    {row.stage}
                  </span>
                </td>
                <td className="py-3 text-zinc-300">{row.milestones}</td>
                <td className="py-3">
                  <ProgressBar value={row.progress} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
