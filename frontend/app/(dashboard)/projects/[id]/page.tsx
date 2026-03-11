"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Lightbulb, Sparkles } from "lucide-react";
import MilestoneChart from "@/components/milestone-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import ProgressBar from "@/components/progress-bar";
import { type BuildMindMilestone, type BuildMindTask, updateTaskStatus } from "@/lib/buildmind";
import { useDeleteProjectMutation, useProjectDetailQuery } from "@/lib/queries";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const { data, isLoading, error } = useProjectDetailQuery(projectId);
  const deleteMutation = useDeleteProjectMutation();

  const project = data?.project ?? null;
  const milestones = data?.milestones ?? [];
  const tasks = data?.tasks ?? [];

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

  const toggleTask = (task: BuildMindTask) => {
    updateMutation.mutate({
      taskId: task.id,
      isCompleted: !task.is_completed,
      notes: notesDraft[task.id] ?? task.notes ?? "",
    });
  };

  const saveNotes = (task: BuildMindTask) => {
    updateMutation.mutate({
      taskId: task.id,
      isCompleted: task.is_completed,
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

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100">{project?.title ?? "Project"}</h2>
          <p className="text-body mt-1">Idea overview, validation feedback, milestones, and task execution tracking.</p>
        </div>
        <Button
          variant="outline"
          className="border-rose-500/40 text-rose-200 hover:bg-rose-500/10"
          onClick={deleteProject}
          disabled={!project || deleteMutation.isPending}
        >
          {deleteMutation.isPending ? "Deleting..." : "Delete Project"}
        </Button>
      </div>

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

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card className="glass-panel panel-glow">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-indigo-200">
              <Lightbulb size={18} />
            </div>
            <div>
              <CardTitle className="text-zinc-100">Idea Overview</CardTitle>
              <p className="text-body">What you are building and for whom.</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-zinc-300">
            <p>{project?.description || "No description yet."}</p>
            <p><strong className="text-zinc-100">Target users:</strong> {project?.target_users || "Not set"}</p>
            <p><strong className="text-zinc-100">Problem:</strong> {project?.problem || "Not set"}</p>
          </CardContent>
        </Card>

        <Card className="glass-panel panel-glow">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-emerald-200">
              <ClipboardList size={18} />
            </div>
            <div>
              <CardTitle className="text-zinc-100">Progress</CardTitle>
              <p className="text-body">Completion across milestones and tasks.</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
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
        </Card>
      </div>

      <MilestoneChart data={milestoneChartData} />

      <Card className="glass-panel panel-glow">
        <CardHeader className="flex flex-row items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-purple-200">
            <Sparkles size={18} />
          </div>
          <div>
            <CardTitle className="text-zinc-100">AI Validation</CardTitle>
            <p className="text-body">Structured feedback from BuildMind AI.</p>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm text-zinc-300 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="font-medium text-zinc-100">Strengths</p>
            <ul className="mt-2 space-y-1">
              {(project?.validation_strengths ?? []).map((line, idx) => <li key={`s-${idx}`}>• {line}</li>)}
            </ul>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="font-medium text-zinc-100">Weaknesses</p>
            <ul className="mt-2 space-y-1">
              {(project?.validation_weaknesses ?? []).map((line, idx) => <li key={`w-${idx}`}>• {line}</li>)}
            </ul>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="font-medium text-zinc-100">Suggestions</p>
            <ul className="mt-2 space-y-1">
              {(project?.validation_suggestions ?? []).map((line, idx) => <li key={`i-${idx}`}>• {line}</li>)}
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel panel-glow">
        <CardHeader>
          <CardTitle className="text-zinc-100">Milestone Timeline</CardTitle>
          <p className="text-body">Track each stage and its execution tasks.</p>
        </CardHeader>
        <CardContent>
          <div className="relative space-y-6">
            <div className="absolute left-4 top-0 h-full w-px bg-white/10" />
            {milestones.map((milestone) => {
              const milestoneTasks = tasksByMilestone.get(milestone.id) ?? [];
              const milestoneProgress = milestoneTasks.length
                ? Math.round((milestoneTasks.filter((t) => t.is_completed).length / milestoneTasks.length) * 100)
                : 0;
              return (
                <div key={milestone.id} className="relative pl-12">
                  <div className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-white/5">
                    <CheckCircle2 className="h-4 w-4 text-indigo-300" />
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm uppercase tracking-[0.2em] text-indigo-200/80">{milestone.stage}</p>
                        <h4 className="mt-1 text-lg font-semibold text-zinc-100">{milestone.title}</h4>
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
                        {milestoneProgress}%
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {milestoneTasks.map((task) => (
                        <label key={task.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-300">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-white/20 bg-black/30 text-indigo-500"
                            checked={task.is_completed}
                            onChange={() => toggleTask(task)}
                          />
                          <span className={task.is_completed ? "text-zinc-200 line-through" : ""}>{task.title}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel panel-glow">
        <CardHeader>
          <CardTitle className="text-zinc-100">Tasks List</CardTitle>
          <p className="text-body">Update execution notes and mark tasks complete.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {tasks.map((task) => (
            <div key={`actions-${task.id}`} className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-sm font-medium text-zinc-100">{task.title}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  className="border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                  onClick={() => toggleTask(task)}
                  disabled={updateMutation.isPending}
                >
                  {task.is_completed ? "Mark Incomplete" : "Mark Complete"}
                </Button>
                <Input
                  value={notesDraft[task.id] ?? task.notes ?? ""}
                  onChange={(e) => setNotesDraft((prev) => ({ ...prev, [task.id]: e.target.value }))}
                  placeholder="Add execution note"
                  className="min-w-[220px] flex-1 border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
                />
                <Button
                  className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white"
                  onClick={() => saveNotes(task)}
                  disabled={updateMutation.isPending}
                >
                  Save Note
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
