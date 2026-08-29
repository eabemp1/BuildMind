"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useCreateProjectMutation } from "@/lib/queries";
import { projectCreateSchema } from "@/lib/validation";
import { getLimits } from "@/lib/plan";
import { usePlan } from "@/lib/usePlan";
import { useLimitModal } from "@/components/LimitModal";
import { useProjectSummariesQuery } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";

const STAGE_OPTIONS = ["Idea", "Validation", "MVP", "Launch", "Growth", "Revenue"] as const;
type StartupStage = typeof STAGE_OPTIONS[number];

const STAGE_COLORS: Record<string, string> = {
  Idea: "var(--bm-text3)",
  Validation: "var(--bm-blue)",
  MVP: "var(--bm-amber)",
  Launch: "var(--bm-green)",
  Growth: "var(--bm-accent)",
  Revenue: "var(--bm-green)",
};

export default function NewProjectPage() {
  const router = useRouter();
  const { plan } = usePlan();
  const { showLimitModal } = useLimitModal();
  const { data: summaries = [] } = useProjectSummariesQuery();
  const createMut = useCreateProjectMutation();

  const limits = getLimits(plan);
  const hasUnlimitedProjects = limits.maxProjects === -1 || limits.maxProjects === Infinity;
  const canCreateProject = hasUnlimitedProjects || summaries.length < limits.maxProjects;

  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState("");
  const [targetUsers, setTargetUsers] = useState("");
  const [keyMetric, setKeyMetric] = useState("");
  const [currentHypothesis, setCurrentHypothesis] = useState("");
  const [stage, setStage] = useState<StartupStage>("Idea");
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!canCreateProject) {
      showLimitModal("projects");
      return;
    }
    setError("");
    if (!title.trim()) { setError("Project name is required."); return; }
    try {
      // FIX (carried over from the old modal): was hardcoded to "Founders"
      // here, so this check always passed regardless of what the founder
      // actually typed for targeting — meaning target_users fed into every
      // AI prompt from day one was a lie. Validate the real field.
      projectCreateSchema.parse({
        projectName: title.trim(),
        ideaDescription: problem.trim(),
        targetUsers: targetUsers.trim(),
      });
    } catch (e: unknown) {
      const msg = (e as { errors?: { message: string }[] })?.errors?.[0]?.message;
      setError(msg ?? "Invalid input");
      return;
    }

    try {
      const created = await createMut.mutateAsync({
        project_name: title.trim(),
        idea_description: problem.trim(),
        target_users: targetUsers.trim(),
        problem: problem.trim(),
        startup_stage: stage,
        key_metric: keyMetric.trim(),
        current_hypothesis: currentHypothesis.trim(),
      });
      const newId = (created as { id?: string } | null)?.id;
      router.push(newId ? `/projects/${newId}` : "/projects");
    } catch {
      setError("Couldn't create the project — try again.");
    }
  }

  return (
    <div className="mx-auto max-w-[1120px] px-3 py-5 sm:px-6 sm:py-7">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <Link href="/projects" className="mb-3.5 inline-block font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--bm-text4)] hover:text-[var(--bm-text3)]">
          Projects / New
        </Link>
        <h1
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            color: "var(--bm-text)",
            lineHeight: 1.2,
          }}
        >
          Create Project
        </h1>
      </motion.div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <Card className="min-w-0 p-5 sm:p-7">
          <div className="flex flex-col gap-4">
            <Input
              label="Project name"
              placeholder="e.g. Hypothesis A"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />

            <Textarea
              label="Problem statement"
              placeholder="Explain what expensive validation waste you are trying to mitigate…"
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              rows={3}
            />

            <Input
              label="Target users"
              placeholder="e.g. Pre-seed B2B SaaS founders"
              value={targetUsers}
              onChange={(e) => setTargetUsers(e.target.value)}
            />

            <Input
              label="Key metric"
              placeholder="e.g. Waitlist signups or active users"
              value={keyMetric}
              onChange={(e) => setKeyMetric(e.target.value)}
              helperText="Use a metric that clearly indicates validation proof points."
            />

            <Textarea
              label="Current hypothesis"
              placeholder="What core belief are you testing in this validation cycle?"
              value={currentHypothesis}
              onChange={(e) => setCurrentHypothesis(e.target.value)}
              rows={2}
            />

            <div className="flex flex-col gap-2">
              <label className="font-mono text-[11px] font-normal uppercase tracking-[0.06em] text-[var(--bm-text3)]">
                Startup stage
              </label>
              <div className="flex flex-wrap gap-2">
                {STAGE_OPTIONS.map((s) => {
                  const isActive = stage === s;
                  const color = STAGE_COLORS[s] ?? "var(--bm-text3)";
                  return (
                    <button
                      key={s}
                      onClick={() => setStage(s)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150"
                      style={{
                        background: isActive ? `${color}15` : "transparent",
                        borderColor: isActive ? `${color}55` : "var(--bm-border)",
                        color: isActive ? color : "var(--bm-text3)",
                      }}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <p className="text-xs p-3 rounded-lg" style={{ background: "rgba(224,85,85,0.08)", color: "var(--bm-red)", border: "1px solid rgba(224,85,85,0.2)" }}>
                {error}
              </p>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/projects" className="w-full sm:w-auto">
              <Button variant="secondary" fullWidth disabled={createMut.isPending}>
                Cancel
              </Button>
            </Link>
            <Button fullWidth onClick={handleSubmit} loading={createMut.isPending} disabled={!title.trim()}>
              Create Project <ArrowRight size={13} />
            </Button>
          </div>
        </Card>

        <aside className="order-first lg:order-none">
          <Card variant="alert" className="p-4">
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--bm-accent)]">
              Why this matters
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--bm-text3)]">
              BuildMind uses your project context to generate actionable recommendations. More detail means better signal quality and reduces waste.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
            }
