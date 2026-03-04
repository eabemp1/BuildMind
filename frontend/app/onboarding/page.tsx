"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createProject, generateRoadmap, getStoredToken, setActiveProjectId, setOnboarded } from "@/lib/api";

type OnboardingState = {
  startupName: string;
  industry: string;
  stage: string;
  primaryGoal: string;
  weeklyHours: string;
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [form, setForm] = useState<OnboardingState>({
    startupName: "",
    industry: "",
    stage: "",
    primaryGoal: "",
    weeklyHours: "",
  });

  useEffect(() => {
    if (!getStoredToken()) {
      router.replace("/projects");
      return;
    }
    setCheckedAuth(true);
  }, [router]);

  if (!checkedAuth) return null;

  const onNext = () => {
    setError("");
    if (step === 1 && (!form.startupName.trim() || !form.industry.trim() || !form.stage.trim())) {
      setError("Please complete all fields in step 1.");
      return;
    }
    if (step === 2 && !form.primaryGoal.trim()) {
      setError("Please enter your primary goal.");
      return;
    }
    if (step === 3 && !form.weeklyHours.trim()) {
      setError("Please enter your weekly commitment.");
      return;
    }
    setStep((s) => Math.min(3, s + 1));
  };

  const onBack = () => setStep((s) => Math.max(1, s - 1));

  const onComplete = async () => {
    try {
      setIsLoading(true);
      setError("");
      const project = await createProject(
        form.primaryGoal,
        `${form.startupName} | ${form.industry} | ${form.stage} | ${form.weeklyHours} hrs/week`,
      );
      await generateRoadmap(project.id, 4);
      setActiveProjectId(project.id);
      setOnboarded();
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onboarding failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Onboarding</h2>
        <p className="mt-1 text-sm text-slate-600">Set your baseline so EvolvAI can structure your first execution plan.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-slate-500">Step {step} of 3</p>

        {step === 1 ? (
          <div className="mt-4 grid gap-4">
            <input
              placeholder="Startup name"
              value={form.startupName}
              onChange={(e) => setForm({ ...form, startupName: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2"
            />
            <input
              placeholder="Industry"
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2"
            />
            <input
              placeholder="Stage (idea, MVP, early traction)"
              value={form.stage}
              onChange={(e) => setForm({ ...form, stage: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2"
            />
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mt-4 grid gap-4">
            <textarea
              rows={4}
              placeholder="Primary goal (e.g., Launch MVP in 60 days)"
              value={form.primaryGoal}
              onChange={(e) => setForm({ ...form, primaryGoal: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2"
            />
          </div>
        ) : null}

        {step === 3 ? (
          <div className="mt-4 grid gap-4">
            <input
              type="number"
              min={1}
              max={80}
              placeholder="Weekly time commitment (hours)"
              value={form.weeklyHours}
              onChange={(e) => setForm({ ...form, weeklyHours: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2"
            />
          </div>
        ) : null}

        {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={step === 1 || isLoading}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            Back
          </button>
          {step < 3 ? (
            <button
              type="button"
              onClick={onNext}
              disabled={isLoading}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={onComplete}
              disabled={isLoading}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {isLoading ? "Setting up..." : "Finish"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
