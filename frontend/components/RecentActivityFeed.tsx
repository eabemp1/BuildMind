"use client";

type Item = { id: number; activity_type: string; created_at: string };

type Props = { items: Item[] };

export default function RecentActivityFeed({ items }: Props) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent Activity</p>
      <ul className="mt-4 space-y-2 text-sm text-slate-700">
        {items.length ? (
          items.map((item) => (
            <li key={item.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
              <span>{item.activity_type.replaceAll("_", " ")}</span>
              <span className="text-xs text-slate-500">{new Date(item.created_at).toLocaleDateString()}</span>
            </li>
          ))
        ) : (
          <li className="text-slate-500">No activity yet.</li>
        )}
      </ul>
    </article>
  );
}
