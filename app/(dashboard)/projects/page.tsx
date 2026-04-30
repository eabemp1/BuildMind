"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { z } from "zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { computeStartupScore } from "@/lib/buildmind";
import { getActiveProjectId, setActiveProjectId } from "@/lib/api";
import {
  useCreateProjectMutation,
  useDeleteProjectMutation,
  useProjectSummariesQuery,
} from "@/lib/queries";
import { projectCreateSchema } from "@/lib/validation";
import { getLimits } from "@/lib/plan";
import { usePlan } from "@/lib/usePlan";
import { useLimitModal } from "@/components/LimitModal";
import {
  Plus, Trash2, ChevronRight, Check, X, ArrowRight, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

const STAGE_BADGE_VARIANT: Record<string, "neutral" | "info" | "warning" | "success" | "gradient"> = {
  Idea: "neutral",
  Validation: "info",
  MVP: "warning",
  Launch: "success",
  Growth: "gradient",
  Revenue: "success",
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

// ── Score ring ────────────────────────────────────────────────────────────────
function MiniRing({ score, size = 44 }: { score: number; size?: number }) {
  const r = (size - 5) / 2;
  const circ = 2 * Math.PI * r;
  const color = score >= 60 ? "var(--bm-green)" : score >= 30 ? "var(--bm-amber)" : "var(--bm-text3)";
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={4.5} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={4.5}
          strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (score / 100) * circ }}
          transition={{ duration: 0.9, ease: "easeOut", delay: 0.2 }}
          style={{ filter: `drop-shadow(0 0 3px ${color}60)` }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 800, color, lineHeight: 1 }}>{score}</span>
      </div>
    </div>
  );
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

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="p-6 text-center flex flex-col items-center gap-3">
      <div className="text-base font-semibold text-[var(--bm-text)]">{title}</div>
      <div className="text-sm text-[var(--bm-text3)] max-w-md">{description}</div>
      {action ? <div className="mt-2">{action}</div> : null}
    </Card>
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
      projectCreateSchema.parse({ title, problem, startup_stage: stage });
    } catch (e: any) {
      setError(e.errors?.[0]?.message ?? "Invalid input");
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
        className="w-full max-w-md rounded-2xl p-7 flex flex-col gap-5"
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

        <div className="flex gap-3">
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
  const deleteMut = useDeleteProjectMutation();

  const [activeId, setActiveId] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const limits = getLimits(plan);

  useEffect(() => {
    const id = getActiveProjectId();
    if (id) setActiveId(id);
  }, []);

  async function handleCreate(data: { title: string; problem: string; stage: StartupStage }) {
    if (summaries.length >= limits.maxProjects) {
      showLimitModal("projects");
      return;
    }
    try {
      await createMut.mutateAsync({
        project_name: data.title.trim(),
        idea_description: data.problem.trim(),
        target_users: "",
        problem: data.problem.trim(),
        startup_stage: data.stage,
      });
      setShowCreate(false);
    } catch {
      /* errors handled in modal */
    }
  }

  async function handleDelete(id: string) {
    await deleteMut.mutateAsync(id);
    if (activeId === id) setActiveId("");
    setDeleteConfirm(null);
  }

  async function handleSetActive(id: string) {
    await setActiveProjectId(id);
    setActiveId(id);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between gap-4 flex-wrap"
      >
        <div>
          <h1 className="text-3xl font-bold text-[var(--bm-text)] tracking-tight">Projects</h1>
          <p className="text-sm text-[var(--bm-text3)] mt-1">
            Build and manage all your startup ideas in one place.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{
              background: "var(--bm-bg3)",
              border: "1px solid var(--bm-border)",
              color: "var(--bm-text3)",
            }}
          >
            {summaries.length}/{limits.maxProjects === Infinity ? "∞" : limits.maxProjects} projects
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={14} />
            New Project
          </Button>
        </div>
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
          title="No projects yet"
          description="Start your first project and BuildMind will break it into an executable roadmap."
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
          {summaries.map((s, i) => {
            const score = computeStartupScore(s);
            const stageNorm = normalizeStage(s.startup_stage ?? "");
            const stageVariant = STAGE_BADGE_VARIANT[stageNorm] ?? "neutral";
            const isActive = s.id === activeId;
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
                <Card
                  className="overflow-hidden"
                  style={
                    isActive
                      ? {
                          borderColor: "var(--bm-accent-bd)",
                          boxShadow: "0 0 24px rgba(92,200,138,0.06)",
                        }
                      : undefined
                  }
                >
                  <div className="p-5">
                    <div className="flex items-start gap-4">
                      {/* Score ring */}
                      <MiniRing score={score} />

                      {/* Info */}
                      <div className="flex-1 min-w-0 flex flex-col gap-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-[var(--bm-text)]">
                            {s.title}
                          </span>
                          <Badge variant={stageVariant} size="sm">{stageNorm}</Badge>
                          {isActive && (
                            <Badge variant="success" size="sm" dot>Active</Badge>
                          )}
                        </div>

                        {(s as any).problem && (
                          <p className="text-xs text-[var(--bm-text3)] leading-relaxed line-clamp-2">
                            {(s as any).problem}
                          </p>
                        )}

                        <ProgressBar value={s.tasksCompleted ?? 0} max={s.tasksTotal ?? 0} i={i} />

                        <div className="flex items-center gap-3 text-xs text-[var(--bm-text3)]">
                          <span>{s.tasksCompleted ?? 0}/{s.tasksTotal ?? 0} tasks · {completion}%</span>
                          {s.lastActivity && (
                            <span className="flex items-center gap-1">
                              <Clock size={10} />
                              {new Date(s.lastActivity).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0 mt-0.5">
                        {!isActive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSetActive(s.id)}
                            title="Set as active"
                          >
                            <Check size={12} />
                          </Button>
                        )}
                        <Link href={`/projects/${s.id}`}>
                          <Button variant="ghost" size="sm">
                            View <ChevronRight size={12} />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirm(s.id)}
                          className="text-[var(--bm-red)] hover:bg-[rgba(224,85,85,0.08)]"
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Delete confirm */}
                  <AnimatePresence>
                    {deleteConfirm === s.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        style={{ overflow: "hidden", borderTop: "1px solid var(--bm-border)" }}
                      >
                        <div
                          className="flex items-center justify-between gap-3 px-5 py-3"
                          style={{ background: "rgba(224,85,85,0.04)" }}
                        >
                          <span className="text-xs" style={{ color: "var(--bm-red)" }}>
                            Delete "{s.title}"? This cannot be undone.
                          </span>
                          <div className="flex gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setDeleteConfirm(null)}
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              loading={deleteMut.isPending}
                              onClick={() => handleDelete(s.id)}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            );
          })}

          {/* Add more nudge */}
          {summaries.length < (limits.maxProjects === Infinity ? 999 : limits.maxProjects) && (
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
