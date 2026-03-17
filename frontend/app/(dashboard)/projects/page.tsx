"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { z } from "zod";
import { useRouter } from "next/navigation";
import ProjectCard from "@/components/project-card";
import { Button } from "@/components/ui/button";
import GlowCard from "@/components/ui/glow-card";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import PageHero from "@/components/layout/page-hero";
import { computeStartupScore } from "@/lib/buildmind";
import { getActiveProjectId, setActiveProjectId } from "@/lib/api";
import { useCreateProjectMutation, useDeleteProjectMutation, useProjectSummariesQuery } from "@/lib/queries";
import { projectCreateSchema } from "@/lib/validation";

function stageFromStrengthCount(strengthCount: number): string {
  if (strengthCount >= 3) return "Validation";
  if (strengthCount > 0) return "Discovery";
  return "Idea";
}

export default function ProjectsPage() {
  const router = useRouter();
  const { data: summaries = [], isLoading, error: summariesError } = useProjectSummariesQuery();
  const createMutation = useCreateProjectMutation();
  const deleteMutation = useDeleteProjectMutation();

  const [modalOpen, setModalOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [ideaDescription, setIdeaDescription] = useState("");
  const [targetUsers, setTargetUsers] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!summaries.length) return;
    const active = getActiveProjectId();
    if (!active) {
      const firstId = Number(summaries[0]?.id);
      if (Number.isFinite(firstId)) setActiveProjectId(firstId);
    }
  }, [summaries]);

  const onCreate = async () => {
    try {
      setError("");
      const values = projectCreateSchema.parse({ projectName, ideaDescription, targetUsers });
      const created = await createMutation.mutateAsync({
        project_name: values.projectName,
        idea_description: values.ideaDescription,
        target_users: values.targetUsers,
        problem: values.ideaDescription,
      });
      setModalOpen(false);
      router.push(`/projects/${created.id}`);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0]?.message ?? "Please fill all required fields.");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to create project");
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-7xl space-y-8 px-6"
    >
      <PageHero
        kicker="Projects"
        title="Build Your Startup Workspace"
        subtitle="Create and manage startup ideas, milestones, and execution tasks."
        actions={
          <Button className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white" onClick={() => setModalOpen(true)}>
            + Create Project
          </Button>
        }
      />

      {isLoading ? (
        <div className="text-sm text-zinc-400">Loading projects...</div>
      ) : summariesError ? (
        <div className="text-sm text-rose-400">{summariesError instanceof Error ? summariesError.message : "Failed to load projects"}</div>
      ) : summaries.length === 0 ? (
        <GlowCard className="overflow-hidden p-0">
          <div className="bg-gradient-to-r from-indigo-500/30 to-purple-500/30 px-6 py-5">
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-200">No Projects Yet</p>
            <h3 className="mt-1 text-xl font-semibold text-zinc-100">Create your first startup idea</h3>
          </div>
          <CardContent className="px-6 pb-6">
            <p className="text-body">Start with a clear problem and target audience. BuildMind will generate validation and roadmap automatically.</p>
          </CardContent>
        </GlowCard>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {summaries.map((summary) => (
            <ProjectCard
              key={summary.id}
              id={summary.id}
              title={summary.title}
              description={summary.description}
              progress={summary.progress}
              industry={summary.industry ?? "General"}
              startupScore={computeStartupScore(summary)}
              tasksCompleted={summary.tasksCompleted}
              tasksTotal={summary.tasksTotal}
              lastActivity={summary.lastActivity}
              stage={summary.startup_stage ?? stageFromStrengthCount(summary.validation_strengths.length)}
              deleting={deleteMutation.isPending}
              onDelete={(id) => {
                const confirmed = window.confirm("Delete this project and all associated milestones and tasks?");
                if (!confirmed) return;
                deleteMutation.mutate(id);
              }}
            />
          ))}
        </div>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm">
          <GlowCard className="w-full max-w-xl p-0">
            <CardHeader className="mb-6 px-6 pt-6">
              <CardTitle className="text-zinc-100">Create Project</CardTitle>
              <p className="text-body">We will validate your idea and generate a milestone roadmap.</p>
            </CardHeader>
            <CardContent className="space-y-3 px-6 pb-6">
              <Input
                placeholder="Project name"
                className="border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
              <textarea
                className="min-h-24 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-indigo-400/60"
                placeholder="Idea description"
                value={ideaDescription}
                onChange={(e) => setIdeaDescription(e.target.value)}
              />
              <Input
                placeholder="Target users"
                className="border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
                value={targetUsers}
                onChange={(e) => setTargetUsers(e.target.value)}
              />
              {error ? <p className="text-sm text-rose-400">{error}</p> : null}
              <div className="flex justify-end gap-2">
                <Button variant="outline" className="border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white" onClick={() => void onCreate()} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Generating workspace..." : "Create Project"}
                </Button>
              </div>
            </CardContent>
          </GlowCard>
        </div>
      ) : null}
    </motion.section>
  );
}
