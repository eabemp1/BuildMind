"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createProjectWithRoadmap, getCurrentUser, getOnboardingStatus } from "@/lib/buildmind";

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
        if (!user) {
          router.replace("/auth/login");
          return;
        }
        const done = await getOnboardingStatus(user.id);
        if (done) {
          router.replace("/dashboard");
        }
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
    if (step === 1 && !idea.trim()) return;
    if (step === 2 && !targetUsers.trim()) return;
    if (step === 3 && !problem.trim()) return;
    setStep((prev) => (prev === 3 ? prev : ((prev + 1) as Step)));
  };

  const onComplete = async () => {
    if (!idea.trim() || !targetUsers.trim() || !problem.trim()) return;
    try {
      setLoading(true);
      setError("");
      await createProjectWithRoadmap({
        project_name: idea.trim(),
        idea_description: idea.trim(),
        target_users: targetUsers.trim(),
        problem: problem.trim(),
      });
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete onboarding");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-gray-50 p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Onboarding</p>
          <CardTitle className="mt-2 text-2xl">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 1 ? (
            <Input
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="Example: AI-first startup app generator"
            />
          ) : null}
          {step === 2 ? (
            <Input
              value={targetUsers}
              onChange={(e) => setTargetUsers(e.target.value)}
              placeholder="Example: University entrepreneurs"
            />
          ) : null}
          {step === 3 ? (
            <Input
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              placeholder="Example: Founders struggle to turn ideas into executable plans."
            />
          ) : null}

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <div className="flex justify-between">
            <Button variant="outline" disabled={step === 1 || loading} onClick={() => setStep((s) => ((s - 1) as Step))}>
              Back
            </Button>
            {step < 3 ? (
              <Button onClick={onNext}>Next</Button>
            ) : (
              <Button disabled={loading} onClick={() => void onComplete()}>
                {loading ? "Generating roadmap..." : "Generate roadmap"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

