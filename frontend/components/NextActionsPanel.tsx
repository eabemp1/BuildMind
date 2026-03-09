"use client";

type Item = { task_id: number; title: string; priority: string; due_date: string | null };

type Props = { actions: Item[] };

export default function NextActionsPanel({ actions }: Props) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Next Actions</p>
      <ul className="mt-4 space-y-2 text-sm text-slate-700">
        {actions.length ? (
          actions.map((action) => (
            <li key={action.task_id} className="rounded-lg border border-slate-200 px-3 py-2">
              <p className="font-medium text-slate-900">{action.title}</p>
              <p className="mt-1 text-xs text-slate-500">
                Priority: {action.priority}
                {action.due_date ? ` • Due ${new Date(action.due_date).toLocaleDateString()}` : ""}
              </p>
            </li>
          ))
        ) : (
          <li className="text-slate-500">No pending actions.</li>
        )}
      </ul>
    </article>
  );
}
