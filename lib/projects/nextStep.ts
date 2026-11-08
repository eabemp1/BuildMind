/** lib/projects/nextStep.ts — the one thing to show on a project card. Pure. */
export function nextStepFor(s: { tasksTotal?: number | null; tasksCompleted?: number | null; pendingTasks?: string[] }): { kind: "task" | "done" | "empty"; text: string } {
  const total = s.tasksTotal ?? 0;
  const done = s.tasksCompleted ?? 0;
  const first = (s.pendingTasks ?? []).map((t) => String(t).trim()).find(Boolean);
  if (first) return { kind: "task", text: first };
  if (total > 0 && done >= total) return { kind: "done", text: "Every task is done. Review the stage and plan the next one." };
  return { kind: "empty", text: "No tasks yet. Open the project to generate your first steps." };
}
