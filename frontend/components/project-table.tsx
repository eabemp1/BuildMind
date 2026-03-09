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
    <Card className="border-slate-200/80 bg-white/90">
      <CardHeader>
        <CardTitle>Projects</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
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
                className="group cursor-pointer border-b border-slate-100 transition hover:bg-slate-50"
                onClick={() => router.push(`/projects/${row.id}`)}
              >
                <td className="py-3 font-medium text-slate-900 group-hover:text-slate-950">{row.title}</td>
                <td className="py-3">
                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {row.stage}
                  </span>
                </td>
                <td className="py-3 text-slate-700">{row.milestones}</td>
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
