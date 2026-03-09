"use client";

type Props = { title: string; status: "locked" | "active" | "done" };

export default function JourneyPhaseCard({ title, status }: Props) {
  const cls = status === "done" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : status === "active" ? "bg-brand-50 text-brand-700 border-brand-200" : "bg-slate-50 text-slate-500 border-slate-200";
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm font-medium ${cls}`}>
      {title}
    </div>
  );
}
