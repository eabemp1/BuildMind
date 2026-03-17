"use client";

import { useRouter } from "next/navigation";
import { ArrowUpRight, Target, Trash2 } from "lucide-react";
import ProgressBar from "@/components/progress-bar";
import { Button } from "@/components/ui/button";
import { setActiveProjectId } from "@/lib/api";
import GlowCard from "@/components/ui/glow-card";

type ProjectCardProps = {
  id: string;
  title: string;
  description?: string | null;
  progress: number;
  industry?: string | null;
  startupScore?: number;
  tasksCompleted: number;
  tasksTotal: number;
  lastActivity: string;
  stage: string;
  onDelete?: (id: string) => void;
  deleting?: boolean;
};

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return value;
  }
}

export default function ProjectCard({
  id,
  title,
  description,
  progress,
  industry,
  startupScore,
  tasksCompleted,
  tasksTotal,
  lastActivity,
  stage,
  onDelete,
  deleting,
}: ProjectCardProps) {
  const router = useRouter();

  return (
    <GlowCard className="group flex h-full flex-col gap-4 p-6" interactive>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-200/80">Project</p>
          <h3 className="mt-2 text-lg font-semibold text-zinc-100">{title}</h3>
          <p className="text-body mt-2">{description || "No description yet."}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-200">
          <Target size={18} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{stage}</span>
        {industry ? <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{industry}</span> : null}
        <span>Last activity · {formatDate(lastActivity)}</span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>Progress</span>
          <span className="text-zinc-200">{progress}%</span>
        </div>
        <ProgressBar value={progress} />
        {typeof startupScore === "number" ? (
          <p className="text-xs text-zinc-400">Startup score · {startupScore}/100</p>
        ) : null}
        <p className="text-xs text-zinc-400">
          {tasksCompleted} of {tasksTotal} tasks completed
        </p>
      </div>

      <div className="mt-auto space-y-2">
        <Button
          type="button"
          onClick={() => {
            const numericId = Number(id);
            if (Number.isFinite(numericId)) {
              setActiveProjectId(numericId);
            }
            router.push(`/projects/${id}`);
          }}
          className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white"
        >
          Open Project
          <ArrowUpRight className="ml-2 h-4 w-4" />
        </Button>
      {onDelete ? (
          <button
            type="button"
            onClick={() => onDelete(id)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200 transition duration-200 hover:scale-105 hover:bg-rose-500/20 hover:shadow-lg"
            disabled={deleting}
          >
            <Trash2 className="h-4 w-4" />
            {deleting ? "Deleting..." : "Delete Project"}
          </button>
        ) : null}
      </div>
    </GlowCard>
  );
}
