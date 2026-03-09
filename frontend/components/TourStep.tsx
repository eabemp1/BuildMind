"use client";

type Props = {
  index: number;
  title: string;
  description: string;
  active: boolean;
};

export default function TourStep({ index, title, description, active }: Props) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${active ? "border-brand-200 bg-brand-50" : "border-slate-200 bg-white"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step {index}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{title}</p>
      <p className="mt-1 text-xs text-slate-600">{description}</p>
    </div>
  );
}
