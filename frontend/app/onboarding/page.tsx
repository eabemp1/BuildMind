"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";
import { createProjectWithRoadmap, getCurrentUser, getOnboardingStatus } from "@/lib/buildmind";
import { onboardingSchema } from "@/lib/validation";
import { identifyUser } from "@/lib/analytics";
import { Suspense } from "react";

type Step = 1 | 2 | 3;
type StartupStage = "Idea" | "Validation" | "MVP" | "Launch" | "Growth" | "Revenue";

const STAGE_OPTIONS: StartupStage[] = ["Idea", "Validation", "MVP", "Launch", "Growth", "Revenue"];

function normalizeStage(input: string | null): StartupStage {
  const value = String(input ?? "").trim().toLowerCase();
  if (value.includes("valid")) return "Validation";
  if (value.includes("mvp") || value.includes("proto")) return "MVP";
  if (value.includes("launch")) return "Launch";
  if (value.includes("growth")) return "Growth";
  if (value.includes("revenue")) return "Revenue";
  return "Idea";
}

const BrandMark = ({ size = 24 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width={size} height={size} style={{ flexShrink: 0 }}>
    <defs>
      <linearGradient id="onb-node" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#C4B5FD" /><stop offset="100%" stopColor="#7C3AED" />
      </linearGradient>
      <filter id="onb-glow">
        <feGaussianBlur stdDeviation="0.8" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
    <rect width="32" height="32" rx="7" fill="#09090B" />
    <rect width="32" height="32" rx="7" fill="none" stroke="rgba(139,92,246,0.4)" strokeWidth="0.8" />
    <circle cx="6"  cy="16" r="2.2" fill="url(#onb-node)" filter="url(#onb-glow)" />
    <circle cx="16" cy="14" r="2.4" fill="#A78BFA" filter="url(#onb-glow)" />
    <circle cx="26" cy="16" r="2.2" fill="#C4B5FD" filter="url(#onb-glow)" />
  </svg>
);

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>(1);
  const [idea, setIdea] = useState("");
  const [targetUsers, setTargetUsers] = useState("");
  const [problem, setProblem] = useState(searchParams.get("problem") ?? "");
  const [startupStage, setStartupStage] = useState<StartupStage>(normalizeStage(searchParams.get("stage")));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const check = async () => {
      try {
        const user = await getCurrentUser();
        if (!user) return router.replace("/auth/login");
        identifyUser(user.id, user.email);
        const done = await getOnboardingStatus(user.id);
        if (done) router.replace("/today");
      } catch { router.replace("/auth/login"); }
    };
    void check();
  }, [router]);

  const onNext = () => {
    if (step === 1 && !idea.trim()) return setError("Describe your startup idea.");
    if (step === 2 && !targetUsers.trim()) return setError("Who is this for?");
    setError("");
    if (step < 3) setStep((step + 1) as Step);
  };

  const onComplete = async () => {
    if (!problem.trim()) return setError("What problem are you solving?");
    try {
      setError(""); setLoading(true);
      const values = onboardingSchema.parse({ idea, targetUsers, problem });
      await createProjectWithRoadmap({
        project_name: values.idea.trim(),
        idea_description: values.idea.trim(),
        target_users: values.targetUsers.trim(),
        problem: values.problem.trim(),
        startup_stage: startupStage,
      });
      router.replace("/today");
    } catch (err) {
      if (err instanceof z.ZodError) setError(err.issues[0]?.message ?? "Invalid data.");
      else setError(err instanceof Error ? err.message : "Failed to complete onboarding");
    } finally { setLoading(false); }
  };

  const steps = [
    { n: 1 as Step, label: "Idea",    title: "What are you building?",        hint: "Be specific. \"Daily action engine for solo founders\" beats \"AI for startups\".", ph: "e.g. An AI tool that tells founders exactly what to do next", val: idea, set: setIdea },
    { n: 2 as Step, label: "Users",   title: "Who is this for?",              hint: "The more specific your target user, the better your roadmap.", ph: "e.g. Pre-revenue solo founders who feel stuck", val: targetUsers, set: setTargetUsers },
    { n: 3 as Step, label: "Problem", title: "What problem does it solve?",   hint: "This shapes every action BuildMind gives you. Be honest.", ph: "e.g. Founders waste weeks building the wrong thing with no clear daily action", val: problem, set: setProblem },
  ];
  const cur = steps[step - 1];

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 py-8 overflow-x-hidden"
      style={{ fontFamily: "system-ui,sans-serif" }}>

      {/* Logo */}
      <div className="flex items-center gap-2 mb-8">
        <BrandMark size={22} />
        <span className="text-[14px] font-medium text-white">BuildMind</span>
      </div>

      {/* Step indicators */}
      <div className="flex items-center mb-7">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold"
                style={{ background: s.n < step ? "#fff" : "transparent", border: s.n === step ? "1.5px solid #fff" : s.n < step ? "1px solid #fff" : "1px solid #2a2a2a", color: s.n < step ? "#000" : s.n === step ? "#fff" : "#444" }}>
                {s.n < step ? "✓" : s.n}
              </div>
              <div className="text-[9px] whitespace-nowrap"
                style={{ color: s.n === step ? "#d4d4d4" : s.n < step ? "#555" : "#333" }}>
                {s.label}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className="w-8 sm:w-12 h-px mx-1.5 mb-3.5" style={{ background: s.n < step ? "#444" : "#1c1c1c" }} />
            )}
          </div>
        ))}
      </div>

      {/* Card */}
      <AnimatePresence mode="wait">
        <motion.div key={step}
          initial={{ opacity: 0, x: 16, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -16, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-sm">

          <div className="border border-[#222] rounded-xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-[#1c1c1c] bg-[#080808]">
              <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Step {step} of 3</div>
              <div className="text-[15px] font-medium text-white tracking-tight">{cur.title}</div>
            </div>

            {/* Body */}
            <div className="px-5 py-5 bg-black">
              <div className="text-[12px] text-[#555] mb-4 leading-relaxed">{cur.hint}</div>

              {step === 3 ? (
                <textarea value={cur.val} onChange={e => cur.set(e.target.value)}
                  placeholder={cur.ph} rows={4} autoFocus
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded-lg px-3 py-2.5 text-[13px] text-[#d4d4d4] outline-none focus:border-[#444] mb-4 resize-none transition-colors"
                  style={{ fontFamily: "inherit" }} />
              ) : (
                <input value={cur.val} onChange={e => cur.set(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") step < 3 ? onNext() : void onComplete(); }}
                  placeholder={cur.ph} autoFocus
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded-lg px-3 py-2.5 text-[13px] text-[#d4d4d4] outline-none focus:border-[#444] mb-4 transition-colors"
                  style={{ fontFamily: "inherit" }} />
              )}

              {step === 3 && (
                <div className="mb-4">
                  <div className="text-[11px] text-[#555] mb-2">What stage are you currently in?</div>
                  <select
                    value={startupStage}
                    onChange={(e) => setStartupStage(normalizeStage(e.target.value))}
                    className="w-full bg-[#0a0a0a] border border-[#222] rounded-lg px-3 py-2.5 text-[13px] text-[#d4d4d4] outline-none focus:border-[#444] transition-colors"
                    style={{ fontFamily: "inherit" }}
                  >
                    {STAGE_OPTIONS.map((s) => (
                      <option key={s} value={s} style={{ background: "#0a0a0a", color: "#d4d4d4" }}>{s}</option>
                    ))}
                  </select>
                </div>
              )}

              {error && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-[12px] text-red-400 mb-3">{error}</motion.div>
              )}

              <div className="flex gap-2">
                {step > 1 && (
                  <button onClick={() => { setError(""); setStep((step - 1) as Step); }}
                    className="px-4 py-3 text-[13px] text-[#777] bg-transparent border border-[#222] rounded-lg cursor-pointer"
                    style={{ fontFamily: "inherit" }}>
                    Back
                  </button>
                )}
                {step < 3 ? (
                  <button onClick={onNext}
                    className="flex-1 py-3 bg-white text-black text-[13px] font-medium rounded-lg border-none cursor-pointer"
                    style={{ fontFamily: "inherit" }}>
                    Continue
                  </button>
                ) : (
                  <button onClick={() => void onComplete()} disabled={loading}
                    className="flex-1 py-3 text-[13px] font-medium rounded-lg border-none cursor-pointer"
                    style={{ background: loading ? "#1c1c1c" : "#fff", color: loading ? "#444" : "#000", cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                    {loading ? "Generating workspace..." : "Generate workspace"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {step === 3 && !loading && (
            <p className="text-center text-[11px] text-[#333] mt-2.5">
              BuildMind generates validation, milestones, and your first daily action.
            </p>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <OnboardingContent />
    </Suspense>
  );
}
