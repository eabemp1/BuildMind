"use client";

import TourStep from "@/components/TourStep";

type Props = { visible: boolean; onComplete: () => void };

const STEPS = [
  { title: "Welcome to BuildMind", description: "This is your startup operating system." },
  { title: "Dashboard", description: "Track execution score, streak, and weekly progress." },
  { title: "Create Project", description: "Create your startup project and define customer problem." },
  { title: "Roadmap Generator", description: "Generate milestone-driven execution plans." },
  { title: "Startup Journey", description: "Move through Idea to Revenue with visible progress." },
];

export default function OnboardingTour({ visible, onComplete }: Props) {
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-lg">
        <h3 className="text-xl font-semibold text-slate-900">Onboarding Tour</h3>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {STEPS.map((step, idx) => (
            <TourStep key={step.title} index={idx + 1} title={step.title} description={step.description} active={idx === 0} />
          ))}
        </div>
        <button
          type="button"
          onClick={onComplete}
          className="mt-5 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Finish Tour
        </button>
      </div>
    </div>
  );
}
