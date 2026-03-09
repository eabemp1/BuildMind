"use client";

import JourneyPhaseCard from "@/components/JourneyPhaseCard";

const phases = ["Idea", "Validation", "Prototype", "MVP", "First Users", "Revenue"];

type Props = { progress: number };

export default function StartupJourney({ progress }: Props) {
  const doneCount = Math.round((Math.max(0, Math.min(100, progress)) / 100) * phases.length);
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Startup Journey</p>
        <p className="text-sm font-medium text-slate-700">{Math.round(progress)}%</p>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {phases.map((phase, index) => {
          const status = index < doneCount ? "done" : index === doneCount ? "active" : "locked";
          return <JourneyPhaseCard key={phase} title={phase} status={status} />;
        })}
      </div>
    </article>
  );
}
