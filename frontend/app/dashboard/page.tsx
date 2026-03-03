import MetricCard from "@/components/MetricCard";
import { metrics } from "@/lib/mockData";

export default function DashboardPage() {
  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Dashboard</h2>
        <p className="mt-1 text-sm text-slate-600">Execution visibility across current founder goals.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} label={metric.label} value={metric.value} hint={metric.hint} />
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Execution Trend (Placeholder)</h3>
        <div className="mt-4 h-72 rounded-lg border border-dashed border-slate-300 bg-slate-50" />
      </div>
    </section>
  );
}
