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

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1 as Step);
  const [idea, setIdea] = useState("");
  const [targetUsers, setTargetUsers] = useState("");
  const [problem, setProblem] = useState(searchParams.get("problem") ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const check = async () => {
      try {
        const user = await getCurrentUser();
        if (!user) return router.replace("/auth/login");
        identifyUser(user.id, user.email);
        const done = await getOnboardingStatus(user.id);
        if (done) router.replace("/dashboard");
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
      setError("");
      const values = onboardingSchema.parse({ idea, targetUsers, problem });
      setLoading(true);
      await createProjectWithRoadmap({ project_name: values.idea.trim(), idea_description: values.idea.trim(), target_users: values.targetUsers.trim(), problem: values.problem.trim() });
      router.replace("/dashboard");
    } catch (err) {
      if (err instanceof z.ZodError) setError(err.issues[0]?.message ?? "Invalid data.");
      else setError(err instanceof Error ? err.message : "Failed to complete onboarding");
    } finally { setLoading(false); }
  };

  const steps = [
    { n: 1 as Step, label: "Your idea", title: "What are you building?", hint: "Be specific. \"Daily action engine for solo founders\" beats \"AI for startups\".", ph: "e.g. An AI tool that tells founders exactly what to do next", val: idea, set: setIdea },
    { n: 2 as Step, label: "Who it\u2019s for", title: "Who is this for?", hint: "The more specific your target user, the better your roadmap.", ph: "e.g. Pre-revenue solo founders who feel stuck", val: targetUsers, set: setTargetUsers },
    { n: 3 as Step, label: "The problem", title: "What problem does it solve?", hint: "This shapes every action BuildMind gives you. Be honest.", ph: "e.g. Founders waste weeks building the wrong thing with no clear daily action", val: problem, set: setProblem },
  ];
  const cur = steps[step - 1];

  return (
    <div style={{ minHeight: "100vh", background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", fontFamily: "system-ui,sans-serif" }}>

      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 48 }}>
        <div style={{ width: 24, height: 24, borderRadius: 5, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 12, color: "#000", fontWeight: 900, lineHeight: 1 }}>B</span>
        </div>
        <span style={{ fontSize: 15, fontWeight: 500, color: "#fff", letterSpacing: "-0.01em" }}>BuildMind</span>
      </div>

      {/* Step indicators */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 36 }}>
        {steps.map((s, i) => (
          <div key={s.n} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, background: s.n < step ? "#fff" : "transparent", border: s.n === step ? "1px solid #fff" : s.n < step ? "1px solid #fff" : "1px solid #2a2a2a", color: s.n < step ? "#000" : s.n === step ? "#fff" : "#444" }}>
                {s.n < step ? "\u2713" : s.n}
              </div>
              <div style={{ fontSize: 10, color: s.n === step ? "#d4d4d4" : s.n < step ? "#666" : "#333" }}>{s.label}</div>
            </div>
            {i < steps.length - 1 && <div style={{ width: 44, height: 1, background: s.n < step ? "#444" : "#1c1c1c", margin: "0 6px", marginBottom: 15 }} />}
          </div>
        ))}
      </div>

      {/* Card */}
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }} style={{ width: "100%", maxWidth: 480 }}>
          <div style={{ border: "1px solid #222", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #1c1c1c", background: "#080808" }}>
              <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 4 }}>Step {step} of 3</div>
              <div style={{ fontSize: 16, fontWeight: 500, color: "#fff", letterSpacing: "-0.01em" }}>{cur.title}</div>
            </div>
            <div style={{ padding: "20px", background: "#000" }}>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 16, lineHeight: 1.65 }}>{cur.hint}</div>
              {step === 3
                ? <textarea value={cur.val} onChange={(e) => cur.set(e.target.value)} placeholder={cur.ph} rows={3} autoFocus
                    style={{ width: "100%", background: "#0a0a0a", border: "1px solid #222", borderRadius: 6, padding: "10px 13px", fontSize: 14, color: "#d4d4d4", outline: "none", fontFamily: "inherit", resize: "none", boxSizing: "border-box" }} />
                : <input value={cur.val} onChange={(e) => cur.set(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") step < 3 ? onNext() : void onComplete(); }} placeholder={cur.ph} autoFocus
                    style={{ width: "100%", background: "#0a0a0a", border: "1px solid #222", borderRadius: 6, padding: "10px 13px", fontSize: 14, color: "#d4d4d4", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
              }
              {error && <div style={{ fontSize: 12, color: "#f87171", marginTop: 10 }}>{error}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                {step > 1 && (
                  <button onClick={() => { setError(""); setStep((step - 1) as Step); }}
                    style={{ background: "transparent", border: "1px solid #222", color: "#888", fontSize: 13, padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>
                    Back
                  </button>
                )}
                {step < 3
                  ? <button onClick={onNext} style={{ flex: 1, background: "#fff", color: "#000", fontSize: 13, fontWeight: 500, padding: "8px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit" }}>Continue</button>
                  : <button onClick={() => void onComplete()} disabled={loading} style={{ flex: 1, background: loading ? "#1c1c1c" : "#fff", color: loading ? "#555" : "#000", fontSize: 13, fontWeight: 500, padding: "8px 14px", borderRadius: 6, border: "none", cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                      {loading ? "Generating workspace..." : "Generate workspace"}
                    </button>
                }
              </div>
            </div>
          </div>
          {step === 3 && !loading && (
            <div style={{ marginTop: 10, fontSize: 12, color: "#444", textAlign: "center" }}>
              BuildMind generates validation, milestones, and your first daily action.
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#000" }} />}>
      <OnboardingContent />
    </Suspense>
  );
}
