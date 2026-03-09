"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import MilestoneCard from "@/components/milestone-card";
import MilestoneChart from "@/components/milestone-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import ProgressBar from "@/components/progress-bar";
import { BuildMindMilestone, BuildMindProject, BuildMindTask, getProjectDetail, updateTaskStatus } from "@/lib/buildmind";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [project, setProject] = useState<BuildMindProject | null>(null);
  const [milestones, setMilestones] = useState<BuildMindMilestone[]>([]);
  const [tasks, setTasks] = useState<BuildMindTask[]>([]);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (!projectId) return;
    const load = async () => {
      try {
        const data = await getProjectDetail(projectId);
        setProject(data.project);
        setMilestones(data.milestones);
        setTasks(data.tasks);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load project");
      }
    };
    void load();
  }, [projectId]);

  const progress = useMemo(() => {
    if (!tasks.length) return 0;
    return Math.round((tasks.filter((t) => t.is_completed).length / tasks.length) * 100);
  }, [tasks]);

  const toggleTask = async (task: BuildMindTask) => {
    try {
      await updateTaskStatus(task.id, !task.is_completed, notesDraft[task.id] ?? task.notes ?? "");
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, is_completed: !task.is_completed, notes: notesDraft[task.id] ?? t.notes } : t)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update task");
    }
  };

  const saveNotes = async (task: BuildMindTask) => {
    try {
      await updateTaskStatus(task.id, task.is_completed, notesDraft[task.id] ?? task.notes ?? "");
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, notes: notesDraft[task.id] ?? t.notes } : t)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save notes");
    }
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

  return (
    <section className="space-y-6 fade-up">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">{project?.title ?? "Project"}</h2>
        <p className="mt-1 text-sm text-slate-600">Idea overview, validation feedback, and milestone execution.</p>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <Card className="border-slate-200/80 bg-white/90">
        <CardHeader>
          <CardTitle>Idea Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-700">
          <p>{project?.description || "No description yet."}</p>
          <p><strong>Target users:</strong> {project?.target_users || "Not set"}</p>
          <p><strong>Problem:</strong> {project?.problem || "Not set"}</p>
          <ProgressBar value={progress} label="Overall project progress" />
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 bg-white/90">
        <CardHeader>
          <CardTitle>AI Validation Feedback</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-700">
          <div>
            <p className="font-medium text-slate-900">Strengths</p>
            <ul className="list-disc space-y-1 pl-5">
              {(project?.validation_strengths ?? []).map((line, idx) => <li key={`s-${idx}`}>{line}</li>)}
            </ul>
          </div>
          <div>
            <p className="font-medium text-slate-900">Weaknesses</p>
            <ul className="list-disc space-y-1 pl-5">
              {(project?.validation_weaknesses ?? []).map((line, idx) => <li key={`w-${idx}`}>{line}</li>)}
            </ul>
          </div>
          <div>
            <p className="font-medium text-slate-900">Suggestions</p>
            <ul className="list-disc space-y-1 pl-5">
              {(project?.validation_suggestions ?? []).map((line, idx) => <li key={`i-${idx}`}>{line}</li>)}
            </ul>
          </div>
        </CardContent>
      </Card>

      <MilestoneChart data={milestoneChartData} />

      <div className="grid gap-4 xl:grid-cols-2">
        {milestones.map((milestone) => (
          <div key={milestone.id} className="space-y-3">
            <MilestoneCard
              title={milestone.title}
              status={milestone.stage}
              progress={
                (tasksByMilestone.get(milestone.id) ?? []).length
                  ? (((tasksByMilestone.get(milestone.id) ?? []).filter((t) => t.is_completed).length /
                      (tasksByMilestone.get(milestone.id) ?? []).length) *
                    100)
                  : 0
              }
              tasks={(tasksByMilestone.get(milestone.id) ?? []).map((task) => ({ id: task.id, title: task.title, done: task.is_completed }))}
            />
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
              {(tasksByMilestone.get(milestone.id) ?? []).map((task) => (
                <div key={`actions-${task.id}`} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-900">{task.title}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={() => void toggleTask(task)}>
                      {task.is_completed ? "Mark Incomplete" : "Mark Complete"}
                    </Button>
                    <Input
                      value={notesDraft[task.id] ?? task.notes ?? ""}
                      onChange={(e) => setNotesDraft((prev) => ({ ...prev, [task.id]: e.target.value }))}
                      placeholder="Add execution note"
                      className="min-w-[220px] flex-1"
                    />
                    <Button onClick={() => void saveNotes(task)}>Save Note</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
