"use client";

type Props = { score: number };

export default function ExecutionScoreCard({ score }: Props) {
  const safe = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Execution Score</p>
      <p className="mt-3 text-3xl font-semibold text-slate-900">{safe}</p>
      <div className="mt-4 h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-brand-600" style={{ width: `${safe}%` }} />
      </div>
    </article>
  );
}
