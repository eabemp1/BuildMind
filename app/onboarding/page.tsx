"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";
import { createProjectWithRoadmap, getCurrentUser, getOnboardingStatus } from "@/lib/buildmind";
import { onboardingSchema } from "@/lib/validation";
import { identifyUser } from "@/lib/analytics";
import { Suspense } from "react";
import { trackFunnelStep } from "@/lib/onboarding-analytics";
import BuildMindLoader from "@/components/BuildMindLoader";

type Step = 1 | 2 | 3 | 4 | 5;
type StartupStage = "Idea" | "Validation" | "MVP" | "Launch" | "Growth" | "Revenue";

const STAGE_OPTIONS: StartupStage[] = ["Idea", "Validation", "MVP", "Launch", "Growth", "Revenue"];

// What's holding you back — pick one
const BLOCKER_OPTIONS = [
  { id: "dont_know_what_to_do", label: "I don't know what to do next", icon: "?" },
  { id: "too_many_ideas",       label: "Too many ideas, can't pick one",  icon: "◈" },
  { id: "no_users_yet",        label: "Can't find my first users",        icon: "◎" },
  { id: "building_too_slow",   label: "Building too slowly",              icon: "▷" },
  { id: "no_revenue",          label: "Not making any money yet",         icon: "$" },
  { id: "just_starting",       label: "Just starting — need structure",   icon: "→" },
];

// Domain / industry picker
const DOMAIN_OPTIONS = [
  "Fintech / Payments", "Legal Tech", "Health Tech", "EdTech",
  "SaaS / B2B Tools", "Consumer App", "E-commerce", "AI / Dev Tools",
  "Social / Community", "Other",
];

function normalizeStage(input: string | null): StartupStage {
  const v = String(input ?? "").trim().toLowerCase();
  if (v.includes("valid")) return "Validation";
  if (v.includes("mvp") || v.includes("proto")) return "MVP";
  if (v.includes("launch")) return "Launch";
  if (v.includes("growth")) return "Growth";
  if (v.includes("revenue")) return "Revenue";
  return "Idea";
}

const BrandMark = ({ size = 24 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width={size} height={size} style={{ flexShrink: 0 }}>
    <rect width="32" height="32" rx="7" fill="#09090B" />
    <rect width="32" height="32" rx="7" fill="none" stroke="rgba(139,92,246,0.4)" strokeWidth="0.8" />
    <circle cx="6"  cy="16" r="2.2" fill="#C4B5FD" />
    <circle cx="16" cy="14" r="2.4" fill="#A78BFA" />
    <circle cx="26" cy="16" r="2.2" fill="#C4B5FD" />
  </svg>
);

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>(1);

  // Step 1 — idea
  const [idea, setIdea] = useState("");
  // Step 2 — target users
  const [targetUsers, setTargetUsers] = useState("");
  // Step 3 — problem
  const [problem, setProblem] = useState(searchParams.get("problem") ?? "");
  // Step 4 — blocker (what's holding you back)
  const [blockerType, setBlockerType] = useState("");
  // Step 5 — domain + stage
  const [domain, setDomain] = useState("");
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
        else trackFunnelStep("onboarding_start");
      } catch { router.replace("/auth/login"); }
    };
    void check();
  }, [router]);

  // Track step progression
  useEffect(() => {
    if (step === 1) trackFunnelStep("onboarding_idea");
    if (step === 3) trackFunnelStep("onboarding_stage");
  }, [step]);

  const validate = (): boolean => {
    setError("");
    if (step === 1 && !idea.trim()) { setError("Describe your startup idea."); return false; }
    if (step === 2 && !targetUsers.trim()) { setError("Tell us who this is for."); return false; }
    if (step === 3 && !problem.trim()) { setError("Describe the problem you're solving."); return false; }
    if (step === 4 && !blockerType) { setError("Pick what's holding you back most."); return false; }
    if (step === 5 && !domain) { setError("Select your domain."); return false; }
    return true;
  };

  const onNext = () => {
    if (!validate()) return;
    if (step < 5) setStep((step + 1) as Step);
  };

  const onBack = () => {
    setError("");
    if (step > 1) setStep((step - 1) as Step);
  };

  const onComplete = async () => {
    if (!validate()) return;
    try {
      setLoading(true);
      onboardingSchema.parse({ idea, targetUsers, problem, blockerType, domain });
      await createProjectWithRoadmap({
        project_name: idea.trim(),
        idea_description: idea.trim(),
        target_users: targetUsers.trim(),
        problem: problem.trim(),
        startup_stage: startupStage,
        // Extra context stored in description for AI personalisation
      });
      // Store blocker + domain locally so dashboard can personalise first action
      if (typeof window !== "undefined") {
        localStorage.setItem("bm_blocker", blockerType);
        localStorage.setItem("bm_domain", domain);
        localStorage.setItem("bm_stage", startupStage);
      }
      trackFunnelStep("onboarding_complete");
      router.replace("/today");
    } catch (err) {
      if (err instanceof z.ZodError) setError(err.issues[0]?.message ?? "Invalid data.");
      else setError(err instanceof Error ? err.message : "Failed to complete onboarding.");
    } finally { setLoading(false); }
  };

  const TOTAL = 5;

  // ── Render ────────────────────────────────────────────────────────────────
  const stepLabels = ["Idea", "Users", "Problem", "Blocker", "Domain"];

  // Show branded full-screen loader while generating workspace
  if (loading) return (
    <BuildMindLoader
      variant="page"
      label="Building your workspace…"
      sublabel="Generating your first action, milestones &amp; 90-day roadmap"
    />
  );

  return (
    <div className="min-h-screen bm-bg flex flex-col items-center justify-center px-4 py-10 overflow-x-hidden"
      style={{ fontFamily: "system-ui,sans-serif" }}>

      {/* Logo */}
      <div className="flex items-center gap-2 mb-8">
        <BrandMark size={22} />
        <span className="text-[14px] font-medium bm-text">BuildMind</span>
      </div>

      {/* Step dots */}
      <div className="flex items-center gap-2 mb-8">
        {stepLabels.map((label, i) => {
          const n = (i + 1) as Step;
          const done = n < step;
          const active = n === step;
          return (
            <div key={n} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold transition-all"
                  style={{
                    background: done ? "#fff" : "transparent",
                    border: active ? "1.5px solid #fff" : done ? "1px solid #fff" : "1px solid #2a2a2a",
                    color: done ? "#000" : active ? "#fff" : "#333",
                  }}>
                  {done ? "✓" : n}
                </div>
                <div className="text-[9px] whitespace-nowrap hidden sm:block"
                  style={{ color: active ? "#d4d4d4" : done ? "#555" : "#2a2a2a" }}>
                  {label}
                </div>
              </div>
              {i < TOTAL - 1 && (
                <div className="w-6 sm:w-10 h-px mb-3" style={{ background: done ? "#444" : "#1c1c1c" }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Card */}
      <AnimatePresence mode="wait">
        <motion.div key={step}
          initial={{ opacity: 0, x: 20, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -20, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          className="w-full max-w-sm">

          <div className="border border-[var(--bm-border2)] rounded-xl overflow-hidden">

            {/* Header */}
            <div className="px-5 py-4 border-b border-[var(--bm-border)] bm-bg3">
              <div className="text-[10px] bm-text3 uppercase tracking-wider mb-1">Step {step} of {TOTAL}</div>
              <div className="text-[15px] font-medium bm-text tracking-tight">
                {step === 1 && "What are you building?"}
                {step === 2 && "Who is this for?"}
                {step === 3 && "What problem does it solve?"}
                {step === 4 && "What's holding you back most?"}
                {step === 5 && "Your domain and stage"}
              </div>
            </div>

            {/* Body */}
            <div className="px-5 py-5 bm-bg">

              {/* Hint */}
              <div className="text-[12px] bm-text3 mb-4 leading-relaxed">
                {step === 1 && "Be specific. \"Daily action engine for solo founders\" beats \"AI for startups\"."}
                {step === 2 && "The more specific your target user, the more focused your roadmap."}
                {step === 3 && "This shapes every action BuildMind gives you. Be honest about the pain."}
                {step === 4 && "BuildMind will tailor your first 7 actions around this."}
                {step === 5 && "This helps BuildMind pull the right tactics, benchmarks, and resources."}
              </div>

              {/* Step 1 — Idea */}
              {step === 1 && (
                <input value={idea} onChange={e => setIdea(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && onNext()}
                  placeholder="e.g. A tool that tells founders exactly what to do next"
                  autoFocus
                  className="w-full bm-bg2 border border-[var(--bm-border2)] rounded-lg px-3 py-2.5 text-[13px] bm-text2 outline-none focus:border-[#444] mb-4 transition-colors"
                  style={{ fontFamily: "inherit" }} />
              )}

              {/* Step 2 — Target users */}
              {step === 2 && (
                <input value={targetUsers} onChange={e => setTargetUsers(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && onNext()}
                  placeholder="e.g. Pre-revenue solo founders who feel stuck"
                  autoFocus
                  className="w-full bm-bg2 border border-[var(--bm-border2)] rounded-lg px-3 py-2.5 text-[13px] bm-text2 outline-none focus:border-[#444] mb-4 transition-colors"
                  style={{ fontFamily: "inherit" }} />
              )}

              {/* Step 3 — Problem */}
              {step === 3 && (
                <textarea value={problem} onChange={e => setProblem(e.target.value)}
                  placeholder="e.g. Founders waste weeks building the wrong thing with no clear daily action"
                  rows={4} autoFocus
                  className="w-full bm-bg2 border border-[var(--bm-border2)] rounded-lg px-3 py-2.5 text-[13px] bm-text2 outline-none focus:border-[#444] mb-4 resize-none transition-colors"
                  style={{ fontFamily: "inherit" }} />
              )}

              {/* Step 4 — Blocker */}
              {step === 4 && (
                <div className="flex flex-col gap-2 mb-4">
                  {BLOCKER_OPTIONS.map(opt => (
                    <button key={opt.id} onClick={() => setBlockerType(opt.id)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all cursor-pointer"
                      style={{
                        background: blockerType === opt.id ? "rgba(99,102,241,0.1)" : "#0a0a0a",
                        border: `1px solid ${blockerType === opt.id ? "rgba(99,102,241,0.35)" : "#1c1c1c"}`,
                        color: blockerType === opt.id ? "#c7d2fe" : "#888",
                        fontFamily: "inherit",
                      }}>
                      <span style={{ fontSize: 11, width: 16, textAlign: "center", color: blockerType === opt.id ? "#818cf8" : "#444", flexShrink: 0 }}>{opt.icon}</span>
                      <span style={{ fontSize: 12 }}>{opt.label}</span>
                      {blockerType === opt.id && <span style={{ marginLeft: "auto", fontSize: 10, color: "#818cf8" }}>●</span>}
                    </button>
                  ))}
                </div>
              )}

              {/* Step 5 — Domain + Stage */}
              {step === 5 && (
                <div className="flex flex-col gap-3 mb-4">
                  <div>
                    <div className="text-[11px] bm-text3 mb-2 uppercase tracking-wider">Industry / domain</div>
                    <div className="flex flex-wrap gap-2">
                      {DOMAIN_OPTIONS.map(d => (
                        <button key={d} onClick={() => setDomain(d)}
                          className="px-3 py-1.5 rounded-lg text-[11px] transition-all cursor-pointer"
                          style={{
                            background: domain === d ? "rgba(99,102,241,0.1)" : "#0a0a0a",
                            border: `1px solid ${domain === d ? "rgba(99,102,241,0.3)" : "#1c1c1c"}`,
                            color: domain === d ? "#c7d2fe" : "#666",
                            fontFamily: "inherit",
                          }}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] bm-text3 mb-2 uppercase tracking-wider">Current stage</div>
                    <select value={startupStage} onChange={e => setStartupStage(normalizeStage(e.target.value))}
                      className="w-full bm-bg2 border border-[var(--bm-border2)] rounded-lg px-3 py-2.5 text-[13px] bm-text2 outline-none focus:border-[#444] transition-colors"
                      style={{ fontFamily: "inherit" }}>
                      {STAGE_OPTIONS.map(s => (
                        <option key={s} value={s} style={{ background:"var(--bm-bg2)", color:"var(--bm-text2)" }}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-[12px] text-red-400 mb-3">
                  {error}
                </motion.div>
              )}

              {/* Buttons */}
              <div className="flex gap-2">
                {step > 1 && (
                  <button onClick={onBack}
                    className="px-4 py-3 text-[13px] bm-text2 bg-transparent border border-[var(--bm-border2)] rounded-lg cursor-pointer"
                    style={{ fontFamily: "inherit" }}>
                    Back
                  </button>
                )}
                {step < 5 ? (
                  <button onClick={onNext}
                    className="flex-1 py-3 bg-white text-black text-[13px] font-medium rounded-lg border-none cursor-pointer"
                    style={{ fontFamily: "inherit" }}>
                    Continue →
                  </button>
                ) : (
                  <button onClick={() => void onComplete()} disabled={loading}
                    className="flex-1 py-3 text-[13px] font-medium rounded-lg border-none"
                    style={{
                      background: loading ? "#1c1c1c" : "#fff",
                      color: loading ? "#444" : "#000",
                      cursor: loading ? "not-allowed" : "pointer",
                      fontFamily: "inherit",
                    }}>
                    {loading ? "Generating your workspace..." : "Generate workspace →"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {step === 5 && !loading && (
            <p className="text-center text-[11px] bm-text4 mt-2.5">
              BuildMind generates your first action, milestones, and 90-day roadmap now.
            </p>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<BuildMindLoader variant="page" label="Getting ready…" />}>
      <OnboardingContent />
    </Suspense>
  );
}
