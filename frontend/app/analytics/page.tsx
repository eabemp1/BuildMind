import { scoreHistory } from "@/lib/mockData";

export default function AnalyticsPage() {
  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Analytics</h2>
        <p className="mt-1 text-sm text-slate-600">Execution score history and consistency insights.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Score Line Chart (Placeholder)</h3>
        <div className="mt-4 h-72 rounded-lg border border-dashed border-slate-300 bg-slate-50" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Score History</h3>
          <ul className="mt-4 space-y-2">
            {scoreHistory.map((row) => (
              <li key={row.week} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <span className="text-slate-600">{row.week}</span>
                <span className="font-semibold text-slate-900">{row.score}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Consistency Tracking</h3>
          <div className="mt-4 h-48 rounded-lg border border-dashed border-slate-300 bg-slate-50" />
          <p className="mt-3 text-sm text-slate-600">Weekly consistency trend area for future integrations.</p>
        </article>
      </div>
    </section>
  );
}
