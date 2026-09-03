"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { computeStartupScore } from "@/lib/buildmind";
import { getActiveProjectId, setActiveProjectId } from "@/lib/api";
import {
  useDeleteProjectMutation,
  useProjectSummariesQuery,
} from "@/lib/queries";
import { getLimits } from "@/lib/plan";
import { usePlan } from "@/lib/usePlan";
import { useLimitModal } from "@/components/LimitModal";
import {
  Plus, Trash2, ChevronRight, Check, FolderKanban, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
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

// ── Project health (spec §15 — "make it obvious which projects are healthy,
//    at risk, stalled, or completed"). Derived entirely client-side from
//    fields already present on the project summary (lastActivity,
//    tasksCompleted/Total, computed score) — no backend/API change, no new
//    intelligence logic, just a presentational read of existing data. ──────
type ProjectHealth = "completed" | "healthy" | "at-risk" | "stalled";

const HEALTH_META: Record<ProjectHealth, { label: string; variant: "success" | "warning" | "danger" | "neutral"; dot: string }> = {
  completed: { label: "Completed", variant: "success", dot: "var(--bm-green)" },
  healthy:   { label: "Healthy",   variant: "success", dot: "var(--bm-green)" },
  "at-risk": { label: "At risk",   variant: "warning", dot: "var(--bm-amber)" },
  stalled:   { label: "Stalled",   variant: "danger",  dot: "var(--bm-red)" },
};

function deriveProjectHealth(s: { tasksCompleted?: number | null; tasksTotal?: number | null; lastActivity?: string | null }, score: number): ProjectHealth {
  const completed = s.tasksTotal && s.tasksTotal > 0 && s.tasksCompleted === s.tasksTotal;
  if (completed) return "completed";

  const daysSinceActivity = s.lastActivity
    ? Math.floor((Date.now() - new Date(s.lastActivity).getTime()) / 86_400_000)
    : Infinity;

  if (daysSinceActivity >= 7) return "stalled";
  if (daysSinceActivity >= 3 || score < 40) return "at-risk";
  return "healthy";
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

// ── Loading state — Figma shows a centered spinner + status copy here
//    rather than a skeleton list; matches that per-state arrangement. ──────
function LoadingState() {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center">
      <Loader2 size={22} className="animate-spin text-[var(--bm-accent)]" />
      <div>
        <p className="text-[13px] font-semibold text-[var(--bm-text2)]">Loading your projects…</p>
        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--bm-text4)]">
          Syncing project data
        </p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ProjectsPage() {
  const { plan } = usePlan();
  const { showLimitModal } = useLimitModal();
  const { data: summaries = [], isLoading } = useProjectSummariesQuery();
  const deleteMut = useDeleteProjectMutation();

  const [activeId, setActiveId] = useState<string>("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string>("all");
  // Fix #1: server-authoritative streak + xp so score is consistent across pages/devices
  const [serverStreak, setServerStreak] = useState(0);
  const [serverXP, setServerXP] = useState(0);

  const limits = getLimits(plan);
  const hasUnlimitedProjects = limits.maxProjects === -1 || limits.maxProjects === Infinity;
  const canCreateProject = hasUnlimitedProjects || summaries.length < limits.maxProjects;

  useEffect(() => {
    const id = getActiveProjectId();
    if (id) setActiveId(id);

    // Fix #1: Load streak from server (not localStorage) so score matches dashboard/today
    fetch("/api/founder-context/streak", { cache: "no-store" })
      .then(r => r.json())
      .then((d: { streak?: number }) => { if (typeof d.streak === "number") setServerStreak(d.streak); })
      .catch(() => {});

    // Fix #1: Load XP from server founder_context
    fetch("/api/founder-context", { cache: "no-store" })
      .then(r => r.json())
      .then((d: { xp?: number; data?: { xp?: number } }) => {
        const xp = d.xp ?? d.data?.xp ?? 0;
        if (typeof xp === "number") setServerXP(xp);
      })
      .catch(() => {});
  }, []);

  async function handleDelete(id: string) {
    await deleteMut.mutateAsync(id);
    if (activeId === id) setActiveId("");
    setDeleteConfirm(null);
  }

  async function handleSetActive(id: string) {
    await setActiveProjectId(id);
    setActiveId(id);
  }

  // Quick filters — only offer stages actually present in the founder's
  // projects, so "Growth" never shows up as a filter option for someone
  // with zero Growth-stage projects.
  const stagesPresent = useMemo(() => {
    const set = new Set<string>();
    summaries.forEach((s) => set.add(normalizeStage(s.startup_stage ?? "")));
    return STAGE_OPTIONS.filter((s) => set.has(s));
  }, [summaries]);

  const filteredSummaries = useMemo(() => {
    if (stageFilter === "all") return summaries;
    return summaries.filter((s) => normalizeStage(s.startup_stage ?? "") === stageFilter);
  }, [summaries, stageFilter]);

  const createHref = canCreateProject ? "/projects/new" : undefined;

  function handleCreateClick(e: React.MouseEvent) {
    if (!canCreateProject) {
      e.preventDefault();
      showLimitModal("projects");
    }
  }

  return (
    <div className="mx-auto max-w-[1120px] px-3 py-5 sm:px-6 sm:py-7">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <PageHeader
          eyebrow="Your contexts"
          title="Your Projects"
          subtitle="The hypotheses and workstreams BuildMind is tracking."
          action={
            <Link href={createHref ?? "#"} onClick={handleCreateClick}>
              <Button size="sm" disabled={!canCreateProject}>
                <Plus size={14} />
                Create project
              </Button>
            </Link>
          }
        />
      </motion.div>

      {/* Plan limit reached banner */}
      {!isLoading && !hasUnlimitedProjects && !canCreateProject && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.05 }}
          className="mt-5 rounded-[var(--r-lg)] border-l-2 p-4"
          style={{ borderLeftColor: "var(--bm-accent)", background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)" }}
        >
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--bm-accent)]">
            Free plan limit reached
          </p>
          <p className="mt-1.5 text-[13px] font-semibold text-[var(--bm-text)]">
            You&apos;ve reached your project limit ({summaries.length}/{limits.maxProjects})
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--bm-text3)]">
            Upgrade to add more projects and unlock advanced validation intelligence loops.
          </p>
          <div className="mt-3 flex items-center gap-4">
            <Button size="sm" onClick={() => showLimitModal("projects")}>
              Upgrade plan
            </Button>
            <a href="/upgrade" className="text-[12px] font-medium text-[var(--bm-text2)] hover:text-[var(--bm-text)]">
              Learn more
            </a>
          </div>
        </motion.div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_250px] lg:items-start">
        <main className="min-w-0">
          {/* Loading */}
          {isLoading && <LoadingState />}

          {/* Empty state */}
          {!isLoading && summaries.length === 0 && (
            <EmptyState
              icon={FolderKanban}
              title="No projects yet"
              body="Create your first project to give BuildMind context for better recommendations."
              action={
                <Link href={createHref ?? "#"} onClick={handleCreateClick}>
                  <Button disabled={!canCreateProject}>
                    <Plus size={14} />
                    Create your first project
                  </Button>
                </Link>
              }
            />
          )}

          {/* Project list */}
          {!isLoading && summaries.length > 0 && (
            <div className="flex flex-col gap-2">
          {filteredSummaries.map((s, i) => {
            const score = computeStartupScore({
              ...s,
              streak: serverStreak,
              xp: serverXP,
            });
            const stageNorm = normalizeStage(s.startup_stage ?? "");
            const stageVariant = STAGE_BADGE_VARIANT[stageNorm] ?? "neutral";
            const isActive = s.id === activeId;
            const completion = s.tasksTotal > 0
              ? Math.round((s.tasksCompleted / s.tasksTotal) * 100)
              : 0;
            const health = deriveProjectHealth(s, score);
            const healthMeta = HEALTH_META[health];
            const activeTasks = Math.max(0, (s.tasksTotal ?? 0) - (s.tasksCompleted ?? 0));

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
                          borderColor: "var(--bm-border2)",
                        }
                      : undefined
                  }
                >
                  <div className="p-4 sm:p-4.5">
                    <div className="flex gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-semibold text-[var(--bm-text)]">
                              {s.name ?? s.title}
                            </span>
                            <Badge variant={stageVariant} size="sm">{stageNorm}</Badge>
                            <Badge variant={healthMeta.variant} size="sm" dot>{healthMeta.label}</Badge>
                            {isActive ? <Badge variant="success" size="sm" dot>Active</Badge> : null}
                          </div>
                          <span className="shrink-0 font-mono text-[10px] text-[var(--bm-text4)]">
                            {activeTasks} active task{activeTasks === 1 ? "" : "s"}
                          </span>
                        </div>

                        {s.problem && (
                          <p className="mt-2 text-[11px] leading-relaxed text-[var(--bm-text3)] line-clamp-1">
                            Problem: {s.problem}
                          </p>
                        )}

                        {s.target_users && (
                          <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--bm-text4)] line-clamp-1">
                            Targets: <span className="normal-case tracking-normal text-[var(--bm-text3)]">{s.target_users}</span>
                          </p>
                        )}

                        <div className="mt-3 flex items-center gap-3">
                          <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--bm-text4)]">
                            Progress ({completion}%)
                          </span>
                          <div className="max-w-[110px] flex-1">
                            <ProgressBar value={s.tasksCompleted ?? 0} max={s.tasksTotal ?? 0} i={i} />
                          </div>
                          <span className="font-mono text-[9px] text-[var(--bm-text4)]">
                            {s.tasksCompleted ?? 0}/{s.tasksTotal ?? 0}
                          </span>
                        </div>

                        {/* Real, stage-scoped completion — separate from the
                            lifetime "Progress" line above on purpose. That
                            line covers every task across the whole project's
                            history; this one answers "am I done with THIS
                            stage" using the same lib/server/stageProgress.ts
                            numbers Today's stage-complete banner reads, so
                            the two surfaces never disagree. Only shown once
                            the current stage actually has milestones to count. */}
                        {(s.stageMilestonesTotal ?? 0) > 0 && (
                          <div className="mt-1.5 flex items-center gap-3">
                            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--bm-text4)]">
                              {stageNorm} stage ({s.stageProgressPercent ?? 0}%)
                            </span>
                            <div className="max-w-[110px] flex-1">
                              <div className="w-full h-1.5 rounded-full" style={{ background: "var(--bm-bg4)" }}>
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${s.stageProgressPercent ?? 0}%`,
                                    background: s.stageComplete ? "var(--bm-green)" : "var(--grad-primary)",
                                    transition: "width 0.5s ease",
                                  }}
                                />
                              </div>
                            </div>
                            <span className="font-mono text-[9px] text-[var(--bm-text4)]">
                              {s.stageMilestonesCompleted ?? 0}/{s.stageMilestonesTotal ?? 0}
                              {s.stageComplete ? " ✓" : ""}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 items-start gap-1">
                        {!isActive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSetActive(s.id)}
                            title="Set as active"
                            className="px-2"
                          >
                            <Check size={12} />
                          </Button>
                        )}
                        <Link href={`/projects/${s.id}`}>
                          <Button variant="ghost" size="sm" className="px-2" title={`Open ${s.name ?? s.title}`}>
                            <ChevronRight size={14} />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirm(s.id)}
                          className="border-transparent px-2 text-[var(--bm-text4)] hover:bg-[rgba(224,85,85,0.08)] hover:text-[var(--bm-red)]"
                          title={`Delete ${s.name ?? s.title}`}
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
                          className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
                          style={{ background: "rgba(224,85,85,0.04)" }}
                        >
                          <span className="text-xs" style={{ color: "var(--bm-red)" }}>
                            Delete "{s.title}"? This cannot be undone.
                          </span>
                          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
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

          {filteredSummaries.length === 0 && (
            <p className="py-8 text-center text-[12px] text-[var(--bm-text3)]">
              No {stageFilter === "all" ? "" : `${stageFilter} `}projects match this filter.
            </p>
          )}

          {/* Add more nudge */}
          {canCreateProject && (
            <Link href="/projects/new">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="w-full rounded-[var(--r-lg)] py-4 text-xs flex items-center justify-center gap-2 transition-all duration-150"
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
                <Plus size={14} /> Create another project
              </motion.div>
            </Link>
          )}
        </div>
          )}
        </main>

        <aside className="order-first flex flex-col gap-3 lg:order-none">
          <Card variant="data" className="p-4">
            <p className="font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-[var(--bm-text4)]">
              Project overview
            </p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] text-[var(--bm-text2)]">
                  {summaries.length} of {hasUnlimitedProjects ? "unlimited" : limits.maxProjects} projects used
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-[var(--bm-text4)]">
                  Your free plan allocation is fully visible here.
                </p>
              </div>
              <span className="font-mono text-[10px] text-[var(--bm-accent)]">{summaries.length}</span>
            </div>
            <div className="mt-3 h-[2px] overflow-hidden bg-[var(--bm-bg4)]">
              <div
                className="h-full bg-[var(--bm-accent)]"
                style={{ width: `${hasUnlimitedProjects ? 0 : Math.min(100, (summaries.length / limits.maxProjects) * 100)}%` }}
              />
            </div>
            {!hasUnlimitedProjects && !canCreateProject ? (
              <button
                onClick={() => showLimitModal("projects")}
                className="mt-3 bg-transparent p-0 text-[10px] font-medium text-[var(--bm-accent)] hover:underline"
              >
                Upgrade plan
              </button>
            ) : null}
          </Card>

          {/* Quick filters — only shown once there's more than one stage to filter between */}
          {summaries.length > 0 && stagesPresent.length > 1 && (
            <Card variant="data" className="p-4">
              <p className="font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-[var(--bm-text4)]">
                Quick filters
              </p>
              <Tabs value={stageFilter} onValueChange={setStageFilter} variant="pill" className="mt-3">
                <TabsList className="flex-wrap">
                  <TabsTrigger value="all">All</TabsTrigger>
                  {stagesPresent.map((s) => (
                    <TabsTrigger key={s} value={s}>{s}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
  }
