"use client";

import { type BuildMindMilestone, type BuildMindProject, type BuildMindTask } from "@/lib/buildmind";
import GlowCard from "@/components/ui/glow-card";

type TimelineProps = {
  project: BuildMindProject | null;
  milestones: BuildMindMilestone[];
  tasks: BuildMindTask[];
};

export default function StartupTimeline({ project, milestones, tasks }: TimelineProps) {
  const tasksByMilestone = new Map<string, BuildMindTask[]>();
  tasks.forEach((task) => {
    const key = String(task.milestone_id);
    const current = tasksByMilestone.get(key) ?? [];
    current.push(task);
    tasksByMilestone.set(key, current);
  });

  const isMilestoneComplete = (milestone: BuildMindMilestone) => {
    if (milestone.is_completed) return true;
    const status = (milestone.status ?? "").toLowerCase();
    if (status === "completed" || status === "done") return true;
    const milestoneTasks = tasksByMilestone.get(String(milestone.id)) ?? [];
    return milestoneTasks.length > 0 && milestoneTasks.every((t) => t.is_completed);
  };

  const orderedMilestones = [...milestones].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

  const stages = orderedMilestones.length
    ? orderedMilestones.map((milestone) => ({
        label: milestone.stage || milestone.title,
        complete: isMilestoneComplete(milestone),
      }))
    : [
        { label: "Idea", complete: Boolean(project) },
        { label: "Validation", complete: Boolean(project?.problem && project?.target_users) },
        { label: "MVP", complete: false },
        { label: "Launch", complete: false },
        { label: "Growth", complete: false },
      ];

  return (
    <GlowCard className="p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-zinc-100">Startup Timeline</h3>
        <p className="text-body">Track your journey from idea to first revenue.</p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {stages.map((stage, index) => {
          const complete = stage.complete;
          const isLast = index === stages.length - 1;
          return (
            <div key={stage.label} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                    complete
                      ? "border-indigo-400 bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.7)]"
                      : "border-white/20 bg-white/5"
                  }`}
                >
                  {complete ? <div className="h-2 w-2 rounded-full bg-white" /> : null}
                </div>
                <span className="mt-2 text-xs text-zinc-300">{stage.label}</span>
              </div>
              {!isLast ? (
                <div
                  className={`mx-3 h-px w-10 ${
                    complete ? "bg-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.6)]" : "bg-white/10"
                  }`}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </GlowCard>
  );
}
