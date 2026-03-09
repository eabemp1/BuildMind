"use client";

type Props = { streak: number };

export default function ExecutionStreakCard({ streak }: Props) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Execution Streak</p>
      <p className="mt-3 text-3xl font-semibold text-slate-900">{streak} days</p>
      <p className="mt-2 text-sm text-slate-600">Consecutive days with completed tasks.</p>
    </article>
  );
}
