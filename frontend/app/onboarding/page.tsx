"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createProjectWithRoadmap, getCurrentUser, getOnboardingStatus } from "@/lib/buildmind";
import { onboardingSchema } from "@/lib/validation";
import { identifyUser } from "@/lib/analytics";

type Step = 1 | 2 | 3;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [idea, setIdea] = useState("");
  const [targetUsers, setTargetUsers] = useState("");
  const [problem, setProblem] = useState("");
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
      } catch {
        router.replace("/auth/login");
      }
    };
    void check();
  }, [router]);

  const title = useMemo(() => {
    if (step === 1) return "Step 1: Startup Idea";
    if (step === 2) return "Step 2: Target Users";
    return "Step 3: Problem";
  }, [step]);

  const onNext = () => {
    if (step === 1 && !idea.trim()) return setError("Startup idea is required.");
    if (step === 2 && !targetUsers.trim()) return setError("Target users are required.");
    if (step === 3 && !problem.trim()) return setError("Problem statement is required.");
    setError("");
    setStep((prev) => (prev === 3 ? prev : ((prev + 1) as Step)));
  };

  const onComplete = async () => {
    try {
      setError("");
      const values = onboardingSchema.parse({ idea, targetUsers, problem });
      setLoading(true);
      await createProjectWithRoadmap({
        project_name: values.idea.trim(),
        idea_description: values.idea.trim(),
        target_users: values.targetUsers.trim(),
        problem: values.problem.trim(),
      });
      router.replace("/dashboard");
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0]?.message ?? "Invalid onboarding data.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to complete onboarding");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl">
        <Card className="glass-panel panel-glow overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-500/30 to-purple-500/30 px-6 py-5">
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-200">Onboarding</p>
            <h2 className="mt-1 text-2xl font-semibold text-zinc-100">{title}</h2>
          </div>
          <CardHeader>
            <CardTitle className="text-zinc-100">Build your first workspace</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {step === 1 ? (
              <Input className="border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Describe your startup idea" />
            ) : null}
            {step === 2 ? (
              <Input className="border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500" value={targetUsers} onChange={(e) => setTargetUsers(e.target.value)} placeholder="Who is this for?" />
            ) : null}
            {step === 3 ? (
              <Input className="border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500" value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="What problem are you solving?" />
            ) : null}

            {error ? <p className="text-sm text-rose-400">{error}</p> : null}

            <div className="flex justify-between">
              <Button variant="outline" className="border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10" disabled={step === 1 || loading} onClick={() => setStep((s) => ((s - 1) as Step))}>
                Back
              </Button>
              {step < 3 ? (
                <Button className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white" onClick={onNext}>
                  Next
                </Button>
              ) : (
                <Button className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white" disabled={loading} onClick={() => void onComplete()}>
                  {loading ? "Generating workspace..." : "Generate workspace"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
