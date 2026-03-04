"use client";

import { useEffect, useMemo, useState } from "react";
import TaskCard from "@/components/TaskCard";
import { createFeedback, completeTask, getActiveProjectId, getProject, MilestoneData } from "@/lib/api";

export default function ExecutionPage() {
  const [milestones, setMilestones] = useState<MilestoneData[]>([]);
  const [loadingTaskId, setLoadingTaskId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const activeTasks = useMemo(
    () =>
      milestones.flatMap((m) =>
        m.tasks
          .filter((t) => !t.is_completed)
          .map((t) => ({
            ...t,
            milestone: `Week ${m.week_number}: ${m.title}`,
          })),
      ),
    [milestones],
  );

  const loadProject = async () => {
    const projectId = getActiveProjectId();
    if (!projectId) {
      setMilestones([]);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError("");
      const project = await getProject(projectId);
      setMilestones(project.milestones);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load execution tasks");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadProject();
  }, []);

  const onComplete = async (taskId: number) => {
    try {
      setLoadingTaskId(taskId);
      await completeTask(taskId);
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete task");
    } finally {
      setLoadingTaskId(null);
    }
  };

  const onFeedback = async (taskId: number, feedbackType: "positive" | "negative") => {
    try {
      setLoadingTaskId(taskId);
      await createFeedback(taskId, feedbackType);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send feedback");
    } finally {
      setLoadingTaskId(null);
    }
  };

  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Execution</h2>
        <p className="mt-1 text-sm text-slate-600">Operate weekly tasks and capture reinforcement feedback.</p>
      </div>

      <div className="grid gap-4">
        {isLoading ? <p className="text-sm text-slate-500">Loading tasks...</p> : null}
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {activeTasks.map((task) => (
          <TaskCard
            key={task.id}
            taskId={task.id}
            title={task.description}
            milestone={task.milestone}
            due={task.completed_at || "Pending"}
            isCompleted={task.is_completed}
            isLoading={loadingTaskId === task.id}
            onComplete={onComplete}
            onFeedback={onFeedback}
            showFeedback
          />
        ))}
        {!isLoading && !error && activeTasks.length === 0 ? <p className="text-sm text-slate-500">No active tasks. Generate a roadmap first.</p> : null}
      </div>
    </section>
  );
}
