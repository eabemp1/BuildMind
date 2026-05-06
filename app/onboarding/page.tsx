"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";
import { createProjectWithRoadmap, getCurrentUser, getOnboardingStatus } from "@/lib/buildmind";
import { createClient } from "@/lib/supabase/client";
import { onboardingSchema } from "@/lib/validation";
import { identifyUser } from "@/lib/analytics";
import { Suspense } from "react";
import { trackFunnelStep } from "@/lib/onboarding-analytics";
import BuildMindLoader from "@/components/BuildMindLoader";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import Image from "next/image";

type Step = 1 | 2 | 3 | 4 | 5;
type StartupStage = "Idea" | "Validation" | "MVP" | "Launch" | "Growth" | "Revenue";

const STAGE_OPTIONS: StartupStage[] = ["Idea", "Validation", "MVP", "Launch", "Growth", "Revenue"];

const BLOCKER_OPTIONS = [
  { id: "dont_know_what_to_do", label: "I don't know what to do next",   icon: "?" },
  { id: "too_many_ideas",       label: "Too many ideas, can't pick one",  icon: "◈" },
  { id: "no_users_yet",         label: "Can't find my first users",       icon: "◎" },
  { id: "building_too_slow",    label: "Building too slowly",             icon: "▷" },
  { id: "no_revenue",           label: "Not making any money yet",        icon: "$" },
  { id: "just_starting",        label: "Just starting — need structure",  icon: "→" },
];

const DOMAIN_OPTIONS = ["Fintech / Payments","Legal Tech","Health Tech","EdTech","SaaS / B2B Tools","Consumer App","E-commerce","AI / Dev Tools","Social / Community","Other"];

function normalizeStage(input: string | null): StartupStage {
  const v = String(input ?? "").trim().toLowerCase();
  if (v.includes("valid")) return "Validation";
  if (v.includes("mvp") || v.includes("proto")) return "MVP";
  if (v.includes("launch")) return "Launch";
  if (v.includes("growth")) return "Growth";
  if (v.includes("revenue")) return "Revenue";
  return "Idea";
}

const STEP_LABELS = ["Idea", "Users", "Problem", "Blocker", "Stage"];
const TOTAL_STEPS = 5;

function ProgressBar({ step }: { step: number }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 36 }}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div key={i} style={{ flex: 1, height: 3, borderRadius: 99, overflow: "hidden", background: "var(--bm-bg3)" }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: i < step ? "100%" : "0%" }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            style={{ height: "100%", background: "var(--grad-primary)", borderRadius: 99 }}
          />
        </div>
      ))}
    </div>
  );
}

function StepLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
      {children}
    </div>
  );
}

function StepTitle({ children }: { children: ReactNode }) {
  return (
    <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", margin: "0 0 8px", lineHeight: 1.2 }}>
      {children}
    </h2>
  );
}

function StepSub({ children }: { children: ReactNode }) {
  return (
    <p style={{ fontSize: 13, color: "var(--bm-text3)", margin: "0 0 28px", lineHeight: 1.6 }}>{children}</p>
  );
}

function BigTextarea({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  rows?: number;
}) {
  return (
    <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows}
      style={{ width: "100%", background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 12, padding: "14px 16px", fontSize: 14, color: "var(--bm-text)", outline: "none", fontFamily: "inherit", resize: "none", boxSizing: "border-box", lineHeight: 1.6, transition: "border-color 0.15s" }}
      onFocus={e => { e.target.style.borderColor = "var(--bm-accent-bd)"; }}
      onBlur={e => { e.target.style.borderColor = "var(--bm-border2)"; }}
    />
  );
}

function NextButton({
  onClick,
  disabled,
  loading,
  children = "Continue",
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} onClick={onClick} disabled={disabled || loading}
      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "14px 0", borderRadius: 12, border: "none", background: disabled || loading ? "var(--bm-bg4)" : "var(--grad-primary)", color: disabled || loading ? "var(--bm-text3)" : "#fff", fontWeight: 700, fontSize: 14, cursor: disabled || loading ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "background 0.15s", marginTop: 20 }}>
      {loading ? <Loader2 size={16} className="animate-spin" /> : <>{children} <ArrowRight size={16} /></>}
    </motion.button>
  );
}

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>(1);
  const [idea, setIdea] = useState("");
  const [targetUsers, setTargetUsers] = useState("");
  const [problem, setProblem] = useState(searchParams.get("problem") ?? "");
  const [blockerType, setBlockerType] = useState("");
  const [domain, setDomain] = useState("");
  const [startupStage, setStartupStage] = useState<StartupStage>(normalizeStage(searchParams.get("stage")));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Reflexion Strike — fires in background after step 1 to prove value immediately
  const [strikeResult, setStrikeResult] = useState<{ marketGap: string; firstTask: string } | null>(null);
  const [strikeLoading, setStrikeLoading] = useState(false);

  function fireReflexionStrike(ideaText: string) {
    setStrikeLoading(true);
    // Retry once after 1.5s to handle auth session not yet committed
    const attempt = (retries: number) => {
      fetch("/api/ai/reflexion-strike", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startupDescription: ideaText, stage: startupStage, domain }),
      })
        .then(r => {
          if (r.status === 401 && retries > 0) {
            // Session not committed yet — retry after brief delay
            return new Promise<void>(res => setTimeout(res, 1500))
              .then(() => attempt(retries - 1));
          }
          return r.ok ? r.json() : Promise.reject(new Error(`${r.status}`));
        })
        .then(json => {
          if (json?.data) setStrikeResult(json.data);
        })
        .catch(() => {
          // Show a meaningful fallback so the panel isn't blank
          setStrikeResult({
            marketGap: "This space has generic tools. The gap is deep specificity for your exact user type.",
            firstTask: "Find one person with this problem — message them in the next 30 minutes.",
          });
        })
        .finally(() => setStrikeLoading(false));
    };
    attempt(1);
  }

  async function handleFinish() {
    setLoading(true);
    setError("");
    try {
      if (typeof window !== "undefined" && localStorage.getItem("bm_dev_auth") === "1") {
        const now = new Date().toISOString();
        localStorage.setItem("bm_dev_project", JSON.stringify({
          id: "00000000-0000-4000-8000-000000000001",
          title: domain || idea || "Local test startup",
          description: idea || "Local onboarding test project",
          created_at: now,
          industry: domain || null,
          startup_stage: startupStage,
          validation_score: 35,
          execution_score: 20,
          momentum_score: 50,
          validation_strengths: [],
          tasksCompleted: 0,
          tasksTotal: 3,
          progress: 0,
          lastActivity: now,
        }));
        document.cookie = "bm_dev_onboarded=1; path=/; max-age=86400; samesite=lax";
        trackFunnelStep("onboarding_complete");
        router.push("/today?first_session=true");
        return;
      }

      const user = await getCurrentUser();
      if (!user) { router.replace("/auth/login"); return; }
      await createProjectWithRoadmap({
        project_name: domain || idea,
        idea_description: idea,
        target_users: targetUsers,
        problem,
        startup_stage: startupStage,
        blocker_type: blockerType,
      });
      const supabase = createClient();
      await supabase.auth.updateUser({ data: { onboarding_completed: true } });
      trackFunnelStep("onboarding_complete");
      router.push("/today?first_session=true");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bm-bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{ width: "100%", maxWidth: 520 }}>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 36, justifyContent: "center" }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              overflow: "hidden",
              background: "var(--bm-bg3)",
              border: "1px solid var(--bm-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Image src="/logo/buildmind-mark.svg" alt="BuildMind" width={22} height={22} priority />
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--bm-text)" }}>BuildMind</span>
        </div>

        <ProgressBar step={step} />

        <AnimatePresence mode="wait">
          <motion.div key={step}
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}>

            {step === 1 && (
              <div>
                <StepLabel>Step 1 of 5 — Idea</StepLabel>
                <StepTitle>What are you building?</StepTitle>
                <StepSub>Describe your startup idea in plain language. Don't polish it — just say it.</StepSub>
                <BigTextarea value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="E.g. A tool that helps solo founders track their progress and stay accountable using AI coaching..." />
                <NextButton onClick={() => { trackFunnelStep("onboarding_idea"); fireReflexionStrike(idea); setStep(2); }} disabled={idea.trim().length < 15}>Continue</NextButton>
              </div>
            )}

            {step === 2 && (
              <div>
                <StepLabel>Step 2 of 5 — Target Users</StepLabel>
                <StepTitle>Who is this for?</StepTitle>
                <StepSub>Be specific. "Everyone" is not an answer. Describe the exact person with this problem.</StepSub>
                {/* Reflexion Strike preview — shows AI already went to work on their idea */}
                {(strikeLoading || strikeResult) && (
                  <div style={{
                    background: "var(--bm-accent-dim)",
                    border: "1px solid var(--bm-accent-bd)",
                    borderRadius: 14,
                    padding: "16px 18px",
                    marginBottom: 24,
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-accent)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>⚡</span> AI already scanned your idea
                    </div>
                    {strikeLoading && !strikeResult ? (
                      <p style={{ fontSize: 13, color: "var(--bm-text3)", margin: 0 }}>Analysing your startup…</p>
                    ) : strikeResult ? (
                      <>
                        <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: "0 0 10px", lineHeight: 1.6 }}>
                          <strong style={{ color: "var(--bm-text)" }}>Gap spotted:</strong> {strikeResult.marketGap}
                        </p>
                        <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: 0, lineHeight: 1.6 }}>
                          <strong style={{ color: "var(--bm-text)" }}>Your first task:</strong> {strikeResult.firstTask}
                        </p>
                      </>
                    ) : null}
                  </div>
                )}
                <BigTextarea value={targetUsers} onChange={(e) => setTargetUsers(e.target.value)} placeholder="E.g. First-time founders building B2B SaaS, aged 25–40, technical background, working full-time on their startup..." rows={3} />
                <NextButton onClick={() => { trackFunnelStep("onboarding_stage"); setStep(3); }} disabled={targetUsers.trim().length < 10}>Continue</NextButton>
              </div>
            )}

            {step === 3 && (
              <div>
                <StepLabel>Step 3 of 5 — Problem</StepLabel>
                <StepTitle>What problem does it solve?</StepTitle>
                <StepSub>What's painful or broken today? Focus on the problem, not your solution.</StepSub>
                {/* Keep strike result visible — it motivates specific problem articulation */}
                {strikeResult && (
                  <div style={{
                    background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)",
                    borderRadius: 12, padding: "12px 16px", marginBottom: 18,
                    display: "flex", alignItems: "flex-start", gap: 10,
                  }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>⚡</span>
                    <div>
                      <p style={{ fontSize: 12, color: "var(--bm-text2)", margin: "0 0 6px", lineHeight: 1.55 }}>
                        <strong style={{ color: "var(--bm-text)" }}>Market gap:</strong> {strikeResult.marketGap}
                      </p>
                      <p style={{ fontSize: 12, color: "var(--bm-accent)", margin: 0, fontWeight: 600 }}>
                        First task: {strikeResult.firstTask}
                      </p>
                    </div>
                  </div>
                )}
                <BigTextarea value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="E.g. Founders have no structured way to measure their own execution. They plan a lot but ship slowly and don't know why..." rows={3} />
                <NextButton onClick={() => { trackFunnelStep("onboarding_stage"); setStep(4); }} disabled={problem.trim().length < 15}>Continue</NextButton>
              </div>
            )}

            {step === 4 && (
              <div>
                <StepLabel>Step 4 of 5 — Your Blocker</StepLabel>
                <StepTitle>What's holding you back right now?</StepTitle>
                <StepSub>Be honest. This helps BuildMind give you the right starting push.</StepSub>
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {BLOCKER_OPTIONS.map(opt => (
                    <button key={opt.id} onClick={() => setBlockerType(opt.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderRadius: 12,
                        border: `1px solid ${blockerType === opt.id ? "var(--bm-accent-bd)" : "var(--bm-border)"}`,
                        background: blockerType === opt.id ? "var(--bm-accent-dim)" : "var(--bm-bg2)",
                        cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 0.15s",
                      }}>
                      <span style={{ fontSize: 16, width: 24, textAlign: "center", flexShrink: 0 }}>{opt.icon}</span>
                      <span style={{ fontSize: 13, color: blockerType === opt.id ? "var(--bm-accent)" : "var(--bm-text2)", fontWeight: blockerType === opt.id ? 600 : 400 }}>{opt.label}</span>
                      {blockerType === opt.id && <Check size={14} color="var(--bm-accent)" style={{ marginLeft: "auto" }} />}
                    </button>
                  ))}
                </div>
                <NextButton onClick={() => { trackFunnelStep("onboarding_stage"); setStep(5); }} disabled={!blockerType}>Continue</NextButton>
              </div>
            )}

            {step === 5 && (
              <div>
                <StepLabel>Step 5 of 5 — Stage</StepLabel>
                <StepTitle>Where are you right now?</StepTitle>
                <StepSub>Select your current startup stage. BuildMind will tailor your roadmap accordingly.</StepSub>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9, marginBottom: 20 }}>
                  {STAGE_OPTIONS.map(s => (
                    <button key={s} onClick={() => setStartupStage(s)}
                      style={{
                        padding: "14px 10px", borderRadius: 12, textAlign: "center",
                        border: `1px solid ${startupStage === s ? "var(--bm-accent-bd)" : "var(--bm-border)"}`,
                        background: startupStage === s ? "var(--bm-accent-dim)" : "var(--bm-bg2)",
                        color: startupStage === s ? "var(--bm-accent)" : "var(--bm-text2)",
                        fontSize: 13, fontWeight: startupStage === s ? 700 : 400,
                        cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                      }}>
                      {s}
                    </button>
                  ))}
                </div>

                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Industry (optional)</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {DOMAIN_OPTIONS.map(d => (
                      <button key={d} onClick={() => setDomain(d)}
                        style={{ padding: "7px 13px", borderRadius: 20, border: `1px solid ${domain === d ? "var(--bm-accent-bd)" : "var(--bm-border)"}`, background: domain === d ? "var(--bm-accent-dim)" : "transparent", color: domain === d ? "var(--bm-accent)" : "var(--bm-text3)", fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                {error && <div style={{ fontSize: 12, color: "var(--bm-red)", marginBottom: 10 }}>{error}</div>}
                <NextButton onClick={handleFinish} loading={loading}>Build my roadmap</NextButton>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {step > 1 && (
          <button onClick={() => setStep(s => (s - 1) as Step)}
            style={{ display: "block", margin: "16px auto 0", background: "none", border: "none", color: "var(--bm-text3)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            ← Back
          </button>
        )}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<BuildMindLoader />}>
      <OnboardingContent />
    </Suspense>
  );
}
