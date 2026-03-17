"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Lightbulb, Sparkles } from "lucide-react";
import MilestoneChart from "@/components/milestone-chart";
import StartupTimeline from "@/components/startup-timeline";
import { Button } from "@/components/ui/button";
import GlowCard from "@/components/ui/glow-card";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import ProgressBar from "@/components/progress-bar";
import PageHero from "@/components/layout/page-hero";
import { type BuildMindMilestone, type BuildMindTask, updateMilestoneForCurrentUser, updateTaskStatus } from "@/lib/buildmind";
import { useDeleteProjectMutation, useProjectDetailQuery } from "@/lib/queries";
import { FEATURES } from "@/lib/features";
import { setActiveProjectId } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [milestoneDrafts, setMilestoneDrafts] = useState<Record<string, { title: string; stage: string }>>({});
  const [expandedMilestoneNotes, setExpandedMilestoneNotes] = useState<Record<string, boolean>>({});
  const [showValidation, setShowValidation] = useState(false);
  const qc = useQueryClient();
  const { data, isLoading, error } = useProjectDetailQuery(projectId);
  const deleteMutation = useDeleteProjectMutation();

  const project = data?.project ?? null;
  const milestones = data?.milestones ?? [];
  const tasks = data?.tasks ?? [];
  const validationTotal =
    (project?.validation_strengths?.length ?? 0) +
    (project?.validation_weaknesses?.length ?? 0) +
    (project?.validation_suggestions?.length ?? 0);
  const validationPending = isLoading || (project && validationTotal === 0);

  const progress = useMemo(() => {
    if (!tasks.length) return 0;
    return Math.round((tasks.filter((t) => t.is_completed).length / tasks.length) * 100);
  }, [tasks]);

  const updateMutation = useMutation({
    mutationFn: (payload: { taskId: string; isCompleted: boolean; notes?: string }) =>
      updateTaskStatus(payload.taskId, payload.isCompleted, payload.notes),
    onSuccess: (_data, variables) => {
      qc.setQueryData<{ project: unknown; milestones: BuildMindMilestone[]; tasks: BuildMindTask[] } | undefined>(
        ["project", projectId],
        (current) => {
          if (!current) return current;
          return {
            ...current,
            tasks: current.tasks.map((task) =>
              task.id === variables.taskId
                ? { ...task, is_completed: variables.isCompleted, notes: variables.notes ?? task.notes }
                : task,
            ),
          };
        },
      );
    },
  });

  const updateMilestoneMutation = useMutation({
    mutationFn: (payload: { id: string; title: string; stage: string }) =>
      updateMilestoneForCurrentUser(payload.id, { title: payload.title, stage: payload.stage }),
    onSuccess: (updated) => {
      qc.setQueryData<{ project: unknown; milestones: BuildMindMilestone[]; tasks: BuildMindTask[] } | undefined>(
        ["project", projectId],
        (current) => {
          if (!current) return current;
          return {
            ...current,
            milestones: current.milestones.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
          };
        },
      );
      setEditingMilestoneId(null);
    },
  });

  const toggleTask = (task: BuildMindTask) => {
    updateMutation.mutate({
      taskId: task.id,
      isCompleted: !task.is_completed,
      notes: notesDraft[task.id] ?? task.notes ?? "",
    });
  };

  const tasksByMilestone = useMemo(() => {
    const grouped = new Map<string, BuildMindTask[]>();
    for (const task of tasks) {
      const current = grouped.get(task.milestone_id) ?? [];
      current.push(task);
      grouped.set(task.milestone_id, current);
    }
    return grouped;
  }, [tasks]);

  const milestoneChartData = useMemo(
    () =>
      milestones.map((milestone) => {
        const milestoneTasks = tasksByMilestone.get(milestone.id) ?? [];
        const completion = milestoneTasks.length
          ? Math.round((milestoneTasks.filter((t) => t.is_completed).length / milestoneTasks.length) * 100)
          : 0;
        return { milestone: milestone.title, completion };
      }),
    [milestones, tasksByMilestone],
  );

  const isMilestoneComplete = (milestone: BuildMindMilestone) => {
    if (milestone.is_completed) return true;
    const status = (milestone.status ?? "").toLowerCase();
    if (status === "completed" || status === "done") return true;
    const milestoneTasks = tasksByMilestone.get(milestone.id) ?? [];
    return milestoneTasks.length > 0 && milestoneTasks.every((t) => t.is_completed);
  };

  const appendNote = (current: string | null | undefined, next: string) => {
    const trimmed = next.trim();
    if (!trimmed) return current ?? "";
    const existing = (current ?? "").trim();
    if (!existing) return trimmed;
    return `${existing}\n${trimmed}`;
  };

  const splitNotes = (value: string | null | undefined) =>
    (value ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

  const deleteProject = () => {
    if (!project) return;
    const ok = window.confirm(`Delete "${project.title}"? This cannot be undone.`);
    if (!ok) return;
    deleteMutation.mutate(project.id, {
      onSuccess: () => {
        router.push("/projects");
      },
    });
  };

  useEffect(() => {
    const numericId = Number(projectId);
    if (Number.isFinite(numericId)) {
      setActiveProjectId(numericId);
    }
  }, [projectId]);

  useEffect(() => {
    if (!isLoading) {
      setShowValidation(true);
    }
  }, [isLoading]);

  useEffect(() => {
    setShowValidation(false);
  }, [projectId]);

  return (
    <section className="mx-auto max-w-7xl space-y-8 px-6">
      <PageHero
        kicker="Project"
        title={project?.title ?? "Project"}
        subtitle="Idea overview, validation feedback, milestones, and task execution tracking."
        actions={
          <Button
            variant="outline"
            className="border-rose-500/40 text-rose-200 hover:bg-rose-500/10"
            onClick={deleteProject}
            disabled={!project || deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete Project"}
          </Button>
        }
      />

      {isLoading ? <p className="text-sm text-zinc-400">Loading project...</p> : null}
      {error ? <p className="text-sm text-rose-400">{error instanceof Error ? error.message : "Failed to load project"}</p> : null}
      {updateMutation.error ? (
        <p className="text-sm text-rose-400">
          {updateMutation.error instanceof Error ? updateMutation.error.message : "Failed to update task"}
        </p>
      ) : null}
      {deleteMutation.error ? (
        <p className="text-sm text-rose-400">
          {deleteMutation.error instanceof Error ? deleteMutation.error.message : "Failed to delete project"}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <GlowCard className="p-0">
          <CardHeader className="mb-6 flex flex-row items-center gap-3 px-6 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-indigo-200">
              <Lightbulb size={18} />
            </div>
            <div>
              <CardTitle className="text-zinc-100">Idea Overview</CardTitle>
              <p className="text-body">What you are building and for whom.</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-6 pb-6 text-sm text-zinc-300">
            <p>{project?.description || "No description yet."}</p>
            <p><strong className="text-zinc-100">Target users:</strong> {project?.target_users || "Not set"}</p>
            <p><strong className="text-zinc-100">Problem:</strong> {project?.problem || "Not set"}</p>
          </CardContent>
        </GlowCard>

        <GlowCard className="p-0">
          <CardHeader className="mb-6 flex flex-row items-center gap-3 px-6 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-emerald-200">
              <ClipboardList size={18} />
            </div>
            <div>
              <CardTitle className="text-zinc-100">Progress</CardTitle>
              <p className="text-body">Completion across milestones and tasks.</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-6 pb-6">
            <ProgressBar value={progress} label="Overall project progress" />
            <div className="grid gap-3 text-sm text-zinc-300">
              <div className="flex items-center justify-between">
                <span>Total tasks</span>
                <span className="text-zinc-100">{tasks.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Completed tasks</span>
                <span className="text-zinc-100">{tasks.filter((t) => t.is_completed).length}</span>
              </div>
            </div>
          </CardContent>
        </GlowCard>
      </div>

      {FEATURES.milestones ? <MilestoneChart data={milestoneChartData} /> : null}

      {FEATURES.startupTimeline ? (
        <StartupTimeline project={project} milestones={milestones} tasks={tasks} />
      ) : null}

      <GlowCard className="p-0">
        <CardHeader className="mb-6 flex flex-row items-center gap-3 px-6 pt-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-purple-200">
            <Sparkles size={18} />
          </div>
          <div>
            <CardTitle className="text-zinc-100">AI Validation</CardTitle>
            <p className="text-body">Structured feedback from BuildMind AI.</p>
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          {validationPending ? (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span>BuildMind AI analyzing your startup</span>
              <span className="animate-pulse">...</span>
            </div>
          ) : (
            <div
              className={cn(
                "grid gap-4 text-sm text-zinc-300 transition-opacity duration-500 md:grid-cols-3",
                showValidation ? "opacity-100" : "opacity-0",
              )}
            >
              <GlowCard className="p-6">
                <p className="font-medium text-zinc-100">Strengths</p>
                <ul className="mt-3 space-y-2">
                  {(project?.validation_strengths ?? []).map((line, idx) => <li key={`s-${idx}`}>• {line}</li>)}
                </ul>
              </GlowCard>
              <GlowCard className="p-6">
                <p className="font-medium text-zinc-100">Weaknesses</p>
                <ul className="mt-3 space-y-2">
                  {(project?.validation_weaknesses ?? []).map((line, idx) => <li key={`w-${idx}`}>• {line}</li>)}
                </ul>
              </GlowCard>
              <GlowCard className="p-6">
                <p className="font-medium text-zinc-100">Suggestions</p>
                <ul className="mt-3 space-y-2">
                  {(project?.validation_suggestions ?? []).map((line, idx) => <li key={`i-${idx}`}>• {line}</li>)}
                </ul>
              </GlowCard>
            </div>
          )}
        </CardContent>
      </GlowCard>

      {FEATURES.milestones ? (
        <GlowCard className="p-0">
          <CardHeader className="mb-6 px-6 pt-6">
            <CardTitle className="text-zinc-100">Milestone Timeline</CardTitle>
            <p className="text-body">Track each stage and its execution tasks.</p>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <div className="relative space-y-6">
              <div className="absolute left-4 top-0 h-full w-px bg-white/10" />
              {milestones.map((milestone) => {
                const milestoneTasks = tasksByMilestone.get(milestone.id) ?? [];
                const milestoneProgress = milestoneTasks.length
                  ? Math.round((milestoneTasks.filter((t) => t.is_completed).length / milestoneTasks.length) * 100)
                  : 0;
                const milestoneComplete = isMilestoneComplete(milestone);
                const isEditing = editingMilestoneId === milestone.id;
                const draft = milestoneDrafts[milestone.id] ?? {
                  title: milestone.title,
                  stage: milestone.stage,
                };
                return (
                  <div key={milestone.id} className="relative pl-12">
                    <div
                      className={`absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border ${
                        milestoneComplete
                          ? "border-indigo-300/80 bg-indigo-500/20 shadow-[0_0_14px_rgba(99,102,241,0.65)]"
                          : "border-white/20 bg-white/5"
                      }`}
                    >
                      {milestoneComplete ? (
                        <CheckCircle2 className="h-4 w-4 text-indigo-200" />
                      ) : (
                        <div className="h-2 w-2 rounded-full bg-white/30" />
                      )}
                    </div>
                    <GlowCard className="p-6">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          {isEditing ? (
                            <div className="grid gap-2">
                              <Input
                                value={draft.stage}
                                onChange={(e) =>
                                  setMilestoneDrafts((prev) => ({
                                    ...prev,
                                    [milestone.id]: { ...draft, stage: e.target.value },
                                  }))
                                }
                                className="border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
                                placeholder="Stage"
                              />
                              <Input
                                value={draft.title}
                                onChange={(e) =>
                                  setMilestoneDrafts((prev) => ({
                                    ...prev,
                                    [milestone.id]: { ...draft, title: e.target.value },
                                  }))
                                }
                                className="border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
                                placeholder="Milestone title"
                              />
                            </div>
                          ) : (
                            <>
                              <p className="text-sm uppercase tracking-[0.2em] text-indigo-200/80">{milestone.stage}</p>
                              <h4 className="mt-1 text-lg font-semibold text-zinc-100">{milestone.title}</h4>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
                            {milestoneProgress}%
                          </span>
                          {isEditing ? (
                            <>
                              <Button
                                variant="outline"
                                className="border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                                onClick={() =>
                                  updateMilestoneMutation.mutate({
                                    id: milestone.id,
                                    title: draft.title,
                                    stage: draft.stage,
                                  })
                                }
                                disabled={updateMilestoneMutation.isPending}
                              >
                                Save
                              </Button>
                              <Button
                                variant="outline"
                                className="border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                                onClick={() => setEditingMilestoneId(null)}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              className="border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                              onClick={() => {
                                setEditingMilestoneId(milestone.id);
                                setMilestoneDrafts((prev) => ({
                                  ...prev,
                                  [milestone.id]: { title: milestone.title, stage: milestone.stage },
                                }));
                              }}
                            >
                              Edit
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 space-y-4">
                        {milestoneTasks.map((task) => (
                          <label
                            key={task.id}
                            className={cn(
                              "flex items-center gap-4 rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-300 transition-all duration-300",
                              task.is_completed ? "bg-green-500/10 scale-[1.02] text-zinc-400" : "",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-white/20 bg-black/30 text-indigo-500 transition-all duration-300 checked:border-emerald-400 checked:bg-emerald-500/60"
                              checked={task.is_completed}
                              onChange={() => toggleTask(task)}
                            />
                            <span className={task.is_completed ? "text-zinc-400 line-through" : ""}>{task.title}</span>
                          </label>
                        ))}
                      </div>
                      {milestoneTasks.some((task) => splitNotes(task.notes).length) ? (
                        <div className="mt-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs uppercase tracking-[0.2em] text-indigo-200/80">Milestone Notes</p>
                            <Button
                              variant="outline"
                              className="border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                              onClick={() =>
                                setExpandedMilestoneNotes((prev) => ({
                                  ...prev,
                                  [milestone.id]: !(prev[milestone.id] ?? true),
                                }))
                              }
                            >
                              {(expandedMilestoneNotes[milestone.id] ?? true) ? "Hide" : "Show"}
                            </Button>
                          </div>
                          {(expandedMilestoneNotes[milestone.id] ?? true) ? (
                            <ul className="space-y-2 text-sm text-zinc-300">
                              {milestoneTasks.flatMap((task) =>
                                splitNotes(task.notes).map((note, idx) => (
                                  <li key={`${task.id}-milestone-note-${idx}`} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                                    <span className="text-zinc-200">{task.title}</span>
                                    <span className="text-zinc-400"> — </span>
                                    <span>{note}</span>
                                  </li>
                                )),
                              )}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}
                    </GlowCard>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </GlowCard>
      ) : null}

      <GlowCard className="p-0">
        <CardHeader className="mb-6 px-6 pt-6">
          <CardTitle className="text-zinc-100">Tasks List</CardTitle>
          <p className="text-body">Update execution notes and mark tasks complete.</p>
        </CardHeader>
        <CardContent className="space-y-4 px-6 pb-6">
          {tasks.map((task) => (
            <div
              key={`actions-${task.id}`}
              className={cn(
                "rounded-lg border border-white/10 bg-white/5 p-6 transition-all duration-300",
                task.is_completed ? "bg-green-500/10 scale-[1.02]" : "",
              )}
            >
              <p className={cn("text-sm font-medium text-zinc-100", task.is_completed ? "text-zinc-300" : "")}>
                {task.title}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <Button
                  variant="outline"
                  className="border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                  onClick={() => toggleTask(task)}
                  disabled={updateMutation.isPending}
                >
                  {task.is_completed ? "Mark Incomplete" : "Mark Complete"}
                </Button>
                <Input
                  value={notesDraft[task.id] ?? ""}
                  onChange={(e) => setNotesDraft((prev) => ({ ...prev, [task.id]: e.target.value }))}
                  placeholder="Add execution note"
                  className="min-w-[220px] flex-1 border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
                />
                <Button
                  className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white"
                  onClick={() => {
                    const next = notesDraft[task.id] ?? "";
                    const updatedNotes = appendNote(task.notes, next);
                    updateMutation.mutate({
                      taskId: task.id,
                      isCompleted: task.is_completed,
                      notes: updatedNotes,
                    });
                    setNotesDraft((prev) => ({ ...prev, [task.id]: "" }));
                  }}
                  disabled={updateMutation.isPending}
                >
                  Save Note
                </Button>
              </div>
              {splitNotes(task.notes).length ? (
                <ul className="mt-4 space-y-2 text-sm text-zinc-300">
                  {splitNotes(task.notes).map((note, idx) => (
                    <li key={`${task.id}-note-${idx}`} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                      {note}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </CardContent>
      </GlowCard>
    </section>
  );
}
