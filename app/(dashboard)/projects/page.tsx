"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  useCreateProjectMutation,
  useProjectSummariesQuery,
} from "@/lib/queries";
import { projectCreateSchema } from "@/lib/validation";
import { getLimits } from "@/lib/plan";
import { usePlan } from "@/lib/usePlan";
import { useLimitModal } from "@/components/LimitModal";
import {
  Plus, X, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";

// ── Types ────────────────────────────────────────────────────────────────────
const STAGE_OPTIONS = ["Idea", "Validation", "MVP", "Launch", "Growth", "Revenue"] as const;
type StartupStage = typeof STAGE_OPTIONS[number];

const STAGE_COLORS: Record<string, string> = {
  Idea: "var(--bm-text3)",
  Validation: "var(--bm-blue)",
  Prototype: "var(--bm-amber)",
  MVP: "var(--bm-amber)",
  Launch: "var(--bm-green)",
  Growth: "var(--bm-accent)",
  Revenue: "var(--bm-green)",
};

function normalizeStage(input: string): StartupStage {
  const v = String(input || "").trim().toLowerCase();
  if (v.includes("valid")) return "Validation";
  if (v.includes("mvp") || v.includes("proto")) return "MVP";
  if (v.includes("launch")) return "Launch";
  if (v.includes("growth")) return "Growth";
  if (v.includes("revenue")) return "Revenue";
  return "Idea";
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({
  value, max, i = 0,
}: { value: number; max: number; i?: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full h-1.5 rounded-full" style={{ background: "var(--bm-bg4)" }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: "var(--grad-primary)" }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.75, ease: "easeOut", delay: 0.25 + i * 0.05 }}
      />
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="h-16 rounded-xl bg-[var(--bm-bg3)] animate-pulse" />
  );
}

// ── Create Modal ──────────────────────────────────────────────────────────────
function CreateModal({
  onClose,
  onCreate,
  isPending,
}: {
  onClose: () => void;
  onCreate: (data: { title: string; problem: string; stage: StartupStage }) => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState("");
  const [stage, setStage] = useState<StartupStage>("Idea");
  const [error, setError] = useState("");

  function handleSubmit() {
    setError("");
    if (!title.trim()) { setError("Project name is required."); return; }
    try {
      projectCreateSchema.parse({
        projectName: title.trim(),
        ideaDescription: problem.trim(),
        targetUsers: "Founders",
      });
    } catch (e: unknown) {
      const msg = (e as { errors?: { message: string }[] })?.errors?.[0]?.message;
      setError(msg ?? "Invalid input");
      return;
    }
    onCreate({ title, problem, stage });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-md rounded-2xl p-5 sm:p-7 flex flex-col gap-5"
        style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border2)" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-[var(--bm-text)] tracking-tight">New Project</h2>
            <p className="text-sm text-[var(--bm-text3)] mt-1">Start with a clear problem statement.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--bm-text3)] hover:bg-[var(--bm-bg3)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <Input
            label="Project Name"
            placeholder="e.g. BuildMind, TaskFlow AI…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />

          <Textarea
            label="Problem You're Solving"
            placeholder="Who has this problem? What happens when they can't solve it?"
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            rows={3}
          />

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-[var(--bm-text2)] uppercase tracking-widest">
              Current Stage
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

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button fullWidth onClick={handleSubmit} loading={isPending} disabled={!title.trim()}>
            Create Project <ArrowRight size={13} />
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ProjectsPage() {
  const router = useRouter();
  const { plan } = usePlan();
  const { showLimitModal } = useLimitModal();
  const { data: summaries = [], isLoading } = useProjectSummariesQuery();
  const createMut = useCreateProjectMutation();

  const [showCreate, setShowCreate] = useState(false);

  const limits = getLimits(plan);
  const hasUnlimitedProjects = limits.maxProjects === -1 || limits.maxProjects === Infinity;
  const canCreateProject = hasUnlimitedProjects || summaries.length < limits.maxProjects;

  async function handleCreate(data: { title: string; problem: string; stage: StartupStage }) {
    if (!canCreateProject) {
      showLimitModal("projects");
      return;
    }
    try {
      await createMut.mutateAsync({
        project_name: data.title.trim(),
        idea_description: data.problem.trim(),
        target_users: "Founders",
        problem: data.problem.trim(),
        startup_stage: data.stage,
      });
      setShowCreate(false);
    } catch {
      /* errors handled in modal */
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <PageHeader
          title="Projects"
          subtitle="Build and manage all your startup ideas in one place."
          action={
            <>
              <div className="rounded-lg border border-[var(--bm-border)] bg-[var(--bm-bg3)] px-3 py-1.5 text-xs text-[var(--bm-text3)]">
                {summaries.length}/{hasUnlimitedProjects ? "∞" : limits.maxProjects} projects
              </div>
              <Button onClick={() => setShowCreate(true)}>
                <Plus size={14} />
                New Project
              </Button>
            </>
          }
        />
      </motion.div>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => <SkeletonRow key={i} />)}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && summaries.length === 0 && (
        <EmptyState
          icon={Plus}
          title="No projects yet"
          body="Start your first project and BuildMind will break it into an executable roadmap."
          action={
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={14} />
              New Project
            </Button>
          }
        />
      )}

      {/* Project list */}
      {!isLoading && summaries.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionHeader label="Active portfolio" />
          {summaries.map((s, i) => {
            const stageNorm = normalizeStage(s.startup_stage ?? "");
            const completion = s.tasksTotal > 0
              ? Math.round((s.tasksCompleted / s.tasksTotal) * 100)
              : 0;

            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                <Card className="flex flex-col gap-3 px-[22px] py-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="m-0 mb-1 truncate text-[16px] font-bold tracking-tight text-[var(--bm-text)]">
                        {s.title}
                      </h3>
                      <span className="text-[11px] font-semibold text-[var(--bm-text3)]">
                        {stageNorm} stage
                      </span>
                    </div>
                  </div>

                  <ProgressBar value={s.tasksCompleted ?? 0} max={s.tasksTotal ?? 0} i={i} />

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] text-[var(--bm-text4)]">
                      {completion}% complete
                    </span>
                    <Link href={`/projects/${s.id}`} className="flex items-center gap-1 text-[12px] font-semibold text-[var(--bm-accent)] no-underline">
                      View <ArrowRight size={11} />
                    </Link>
                  </div>
                </Card>
              </motion.div>
            );
          })}

          {/* Add more nudge */}
          {canCreateProject && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              onClick={() => setShowCreate(true)}
              className="w-full py-5 rounded-xl text-sm flex items-center justify-center gap-2 transition-all duration-150"
              style={{
                border: "2px dashed var(--bm-border)",
                background: "transparent",
                color: "var(--bm-text3)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--bm-accent-bd)";
                e.currentTarget.style.color = "var(--bm-accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--bm-border)";
                e.currentTarget.style.color = "var(--bm-text3)";
              }}
            >
              <Plus size={14} /> Start a new project
            </motion.button>
          )}
        </div>
      )}

      {/* Create modal */}
      <AnimatePresence>
        {showCreate && (
          <CreateModal
            onClose={() => setShowCreate(false)}
            onCreate={handleCreate}
            isPending={createMut.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
