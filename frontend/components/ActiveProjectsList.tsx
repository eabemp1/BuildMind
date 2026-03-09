"use client";

type Item = { id: number; title: string; progress: number; stage: string };

type Props = { projects: Item[] };

export default function ActiveProjectsList({ projects }: Props) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active Projects</p>
      <div className="mt-4 space-y-3">
        {projects.length ? (
          projects.map((project) => (
            <div key={project.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-900">{project.title}</p>
                <p className="text-xs text-slate-500">{project.stage}</p>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-brand-600" style={{ width: `${Math.max(0, Math.min(100, project.progress))}%` }} />
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">No active projects.</p>
        )}
      </div>
    </article>
  );
}
