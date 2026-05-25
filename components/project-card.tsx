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
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--bm-accent)]/80">Project</p>
          <h3 className="mt-2 text-lg font-semibold bm-text">{title}</h3>
          <p className="text-body mt-2">{description || "No description yet."}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-[var(--r-xl)] border border-[var(--bm-border2)] bg-white/5 bm-text">
          <Target size={18} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs bm-text2">
        <span className="rounded-full border border-[var(--bm-border2)] bg-white/5 px-3 py-1">{stage}</span>
        {industry ? <span className="rounded-full border border-[var(--bm-border2)] bg-white/5 px-3 py-1">{industry}</span> : null}
        <span>Last activity · {formatDate(lastActivity)}</span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs bm-text2">
          <span>Progress</span>
          <span className="bm-text">{progress}%</span>
        </div>
        <ProgressBar value={progress} />
        {typeof startupScore === "number" ? (
          <p className="text-xs bm-text2">Startup score · {startupScore}/100</p>
        ) : null}
        <p className="text-xs bm-text2">
          {tasksCompleted} of {tasksTotal} tasks completed
        </p>
      </div>

      <div className="mt-auto space-y-2">
        <Button
          type="button"
          onClick={() => {
            setActiveProjectId(id);
            router.push(`/projects/${id}`);
          }}
          className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 bm-text"
        >
          Open Project
          <ArrowUpRight className="ml-2 h-4 w-4" />
        </Button>
      {onDelete ? (
          <button
            type="button"
            onClick={() => onDelete(id)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-rose-400/30 bg-[var(--bm-red-dim)]/10 px-4 py-2 text-sm text-[var(--bm-red)] transition duration-200 hover:scale-105 hover:bg-[var(--bm-red-dim)]/20 hover:shadow-lg"
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
