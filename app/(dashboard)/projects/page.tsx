"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { getActiveProjectId, setActiveProjectId } from "@/lib/api";
import {
  useDeleteProjectMutation,
  useProjectSummariesQuery,
  useFounderStandingBatchQuery,
} from "@/lib/queries";
import { getLimits } from "@/lib/plan";
import { usePlan } from "@/lib/usePlan";
import { useLimitModal } from "@/components/LimitModal";
import {
  Plus, Trash2, ArrowRight, Check, FolderKanban, Loader2, MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OpenBesideButton } from "@/components/layout/OpenBesideButton";
import { VisualBoard } from "@/components/visuals/VisualBoard";
import { nextStepFor } from "@/lib/projects/nextStep";
import { buildPortfolioVisual } from "@/lib/visuals/portfolioVisual";

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
//    at risk, stalled, or completed"). "Completed" stays a local,
//    presentational check (task-completion state). The stalled/at-risk/
//    healthy verdict itself now comes from useFounderStandingBatchQuery
//    (lib/queries.ts), the same engagement signal Execution and the
//    co-founder mascot read — this list used to recompute that from
//    lastActivity/score locally, which is exactly the kind of duplicate
//    verdict this whole redesign has been removing. ──────────────────────
type ProjectHealth = "completed" | "healthy" | "at-risk" | "stalled";

const HEALTH_META: Record<ProjectHealth, { label: string; variant: "success" | "warning" | "danger" | "neutral"; dot: string }> = {
  completed: { label: "Completed", variant: "success", dot: "var(--bm-green)" },
  healthy:   { label: "Healthy",   variant: "success", dot: "var(--bm-green)" },
  "at-risk": { label: "At risk",   variant: "warning", dot: "var(--bm-amber)" },
  stalled:   { label: "Stalled",   variant: "danger",  dot: "var(--bm-red)" },
};

// FIX (checklist item): deriveProjectHealth's recency branch used to
// recompute engagement itself (days-since-activity thresholds) — a
// second, locally-owned copy of exactly what standing.engagement (see
// lib/server/founderStanding.ts) already provides. "completed" is kept
// as its own local, presentational check — task-completion state isn't
// part of engagement and doesn't belong in the shared signal — but the
// stalled/at-risk/healthy branch now takes engagement directly rather
// than recomputing it, so this list can't disagree with Execution or the
// mascot about the same project's engagement again.
function deriveProjectHealth(
  s: { tasksCompleted?: number | null; tasksTotal?: number | null },
  engagement: "healthy" | "at-risk" | "stalled" | undefined,
): ProjectHealth {
  const completed = s.tasksTotal && s.tasksTotal > 0 && s.tasksCompleted === s.tasksTotal;
  if (completed) return "completed";
  return engagement ?? "healthy"; // "healthy" only as a pre-load fallback, never a real verdict
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full rounded-full" style={{ background: "var(--bm-bg4)" }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--grad-primary)", transition: "width 0.5s ease" }} />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-center">
      <Loader2 size={22} className="animate-spin text-[var(--bm-accent)]" />
      <p className="text-[13px] font-semibold text-[var(--bm-text2)]">Loading your projects…</p>
    </div>
  );
}

export default function ProjectsPage() {
  const { plan } = usePlan();
  const { showLimitModal } = useLimitModal();
  const { data: summaries = [], isLoading } = useProjectSummariesQuery();
  const deleteMut = useDeleteProjectMutation();

  const [activeId, setActiveId] = useState<string>("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [showPortfolio, setShowPortfolio] = useState(false);

  const limits = getLimits(plan);
  const hasUnlimitedProjects = limits.maxProjects === -1 || limits.maxProjects === Infinity;
  const canCreateProject = hasUnlimitedProjects || summaries.length < limits.maxProjects;

  useEffect(() => {
    const id = getActiveProjectId();
    if (id) setActiveId(id);
  }, []);

  async function handleDelete(id: string) {
    await deleteMut.mutateAsync(id);
    if (activeId === id) setActiveId("");
    setDeleteConfirm(null);
  }

  async function handleSetActive(id: string) {
    await setActiveProjectId(id);
    setActiveId(id);
    setMenuOpen(null);
  }

  const stagesPresent = useMemo(() => {
    const set = new Set<string>();
    summaries.forEach((s) => set.add(normalizeStage(s.startup_stage ?? "")));
    return STAGE_OPTIONS.filter((st) => set.has(st));
  }, [summaries]);

  const filteredSummaries = useMemo(() => {
    const list = stageFilter === "all" ? summaries : summaries.filter((s) => normalizeStage(s.startup_stage ?? "") === stageFilter);
    // Active project first, so the one you are working on is always at the top.
    return [...list].sort((a, b) => Number(b.id === activeId) - Number(a.id === activeId));
  }, [summaries, stageFilter, activeId]);

  const standingByProject = useFounderStandingBatchQuery(summaries.map((s) => s.id));
  const portfolio = useMemo(() => buildPortfolioVisual(summaries.map((s) => ({
    name: s.name ?? s.title ?? "Untitled", stage: normalizeStage(s.startup_stage ?? ""),
    tasksTotal: s.tasksTotal ?? 0, tasksCompleted: s.tasksCompleted ?? 0,
    stagePct: (s.stageMilestonesTotal ?? 0) > 0 ? (s.stageProgressPercent ?? 0) : null,
    health: deriveProjectHealth(s, standingByProject[s.id]?.engagement),
  })), summaries.find((s) => s.id === activeId)?.name ?? undefined), [summaries, standingByProject, activeId]);

  const createHref = canCreateProject ? "/projects/new" : undefined;
  function handleCreateClick(e: React.MouseEvent) {
    if (!canCreateProject) {
      e.preventDefault();
      showLimitModal("projects");
    }
  }

  return (
    <div className="mx-auto max-w-[760px] px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Your projects"
        subtitle={summaries.length > 0
          ? `${summaries.length} ${summaries.length === 1 ? "project" : "projects"}${hasUnlimitedProjects ? "" : ` of ${limits.maxProjects} on your plan`}. Open one to see what to do next.`
          : "Each project holds one startup idea and the steps to test it."}
        action={
          <Link href={createHref ?? "#"} onClick={handleCreateClick} className="block w-full sm:w-auto">
            <Button size="sm" disabled={!canCreateProject} className="w-full sm:w-auto">
              <Plus size={14} />
              New project
            </Button>
          </Link>
        }
      />

      {!isLoading && !hasUnlimitedProjects && !canCreateProject && (
        <div className="mt-5 rounded-[var(--r-lg)] p-4" style={{ background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)" }}>
          <p className="text-[13px] font-semibold text-[var(--bm-text)]">
            You have used all {limits.maxProjects} projects on your plan
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--bm-text3)]">Upgrade to add more projects.</p>
          <Button size="sm" className="mt-3" onClick={() => showLimitModal("projects")}>Upgrade plan</Button>
        </div>
      )}

      {isLoading && <LoadingState />}

      {!isLoading && summaries.length === 0 && (
        <div className="mt-6">
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            body="Describe your idea and BuildMind will give you the first steps to test it."
            action={
              <Link href={createHref ?? "#"} onClick={handleCreateClick}>
                <Button disabled={!canCreateProject}><Plus size={14} />Create your first project</Button>
              </Link>
            }
          />
        </div>
      )}

      {!isLoading && summaries.length > 0 && (
        <>
          {stagesPresent.length > 1 && (
            <div className="-mx-4 mt-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <Tabs value={stageFilter} onValueChange={setStageFilter} variant="pill">
                <TabsList className="flex-nowrap">
                  <TabsTrigger value="all">All</TabsTrigger>
                  {stagesPresent.map((st) => <TabsTrigger key={st} value={st}>{st}</TabsTrigger>)}
                </TabsList>
              </Tabs>
            </div>
          )}

          <ul className="mt-5 flex flex-col gap-3">
            {filteredSummaries.map((s) => {
              const name = s.name ?? s.title ?? "Untitled project";
              const stageNorm = normalizeStage(s.startup_stage ?? "");
              const isActive = s.id === activeId;
              const done = s.tasksCompleted ?? 0;
              const total = s.tasksTotal ?? 0;
              const health = deriveProjectHealth(s, standingByProject[s.id]?.engagement);
              const healthMeta = HEALTH_META[health];
              const next = nextStepFor(s);
              const confirming = deleteConfirm === s.id;

              return (
                <li key={s.id}>
                  <Card className="overflow-hidden" style={isActive ? { borderColor: "var(--bm-accent-bd)" } : undefined}>
                    <div className="p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="break-words text-[16px] font-semibold leading-snug text-[var(--bm-text)]">{name}</h2>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <Badge variant={STAGE_BADGE_VARIANT[stageNorm] ?? "neutral"} size="sm">{stageNorm}</Badge>
                            <Badge variant={healthMeta.variant} size="sm" dot>{healthMeta.label}</Badge>
                            {isActive && <Badge variant="success" size="sm">Current</Badge>}
                          </div>
                        </div>
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            aria-label={`More options for ${name}`}
                            aria-expanded={menuOpen === s.id}
                            onClick={() => setMenuOpen(menuOpen === s.id ? null : s.id)}
                            className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--bm-text3)] hover:bg-[var(--bm-bg3)]"
                          >
                            <MoreHorizontal size={18} />
                          </button>
                          {menuOpen === s.id && (
                            <div className="absolute right-0 top-11 z-20 w-48 overflow-hidden rounded-[10px] border border-[var(--bm-border)] bg-[var(--bm-bg2)] py-1 shadow-lg">
                              {!isActive && (
                                <button type="button" onClick={() => void handleSetActive(s.id)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] text-[var(--bm-text2)] hover:bg-[var(--bm-bg3)]">
                                  <Check size={14} /> Make this the current project
                                </button>
                              )}
                              <button type="button" onClick={() => { setMenuOpen(null); setDeleteConfirm(s.id); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] text-[var(--bm-red)] hover:bg-[rgba(224,85,85,0.08)]">
                                <Trash2 size={14} /> Delete project
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 rounded-[10px] p-3.5" style={{ background: "var(--bm-bg3)" }}>
                        <p className="text-[12px] font-medium text-[var(--bm-text3)]">
                          {next.kind === "task" ? "Next step" : next.kind === "done" ? "All done" : "Get started"}
                        </p>
                        <p className="mt-1 break-words text-[14px] leading-relaxed text-[var(--bm-text)] line-clamp-3">{next.text}</p>
                      </div>

                      <div className="mt-4 flex items-center gap-3">
                        <div className="flex-1"><ProgressBar value={done} max={total} /></div>
                        <span className="shrink-0 text-[12px] text-[var(--bm-text3)]">
                          {total > 0 ? `${done} of ${total} tasks done` : "No tasks yet"}
                        </span>
                      </div>

                      <Link href={`/projects/${s.id}`} className="mt-4 block">
                        <Button className="w-full sm:w-auto">
                          Open project <ArrowRight size={14} />
                        </Button>
                      </Link>
                    </div>

                    <AnimatePresence>
                      {confirming && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden", borderTop: "1px solid var(--bm-border)" }}>
                          <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" style={{ background: "rgba(224,85,85,0.04)" }}>
                            <span className="text-[13px]" style={{ color: "var(--bm-red)" }}>Delete &quot;{name}&quot;? This cannot be undone.</span>
                            <div className="flex w-full gap-2 sm:w-auto">
                              <Button variant="secondary" size="sm" className="flex-1 sm:flex-none" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                              <Button variant="danger" size="sm" className="flex-1 sm:flex-none" loading={deleteMut.isPending} onClick={() => void handleDelete(s.id)}>Delete</Button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                </li>
              );
            })}
          </ul>

          {filteredSummaries.length === 0 && (
            <p className="py-8 text-center text-[13px] text-[var(--bm-text3)]">No {stageFilter} projects.</p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowPortfolio((v) => !v)}
              aria-expanded={showPortfolio}
              className="rounded-[10px] border border-[var(--bm-border2)] bg-transparent px-3.5 py-2.5 text-[13px] font-medium text-[var(--bm-text2)] hover:bg-[var(--bm-bg3)]"
            >
              {showPortfolio ? "Hide" : "Show"} progress chart
            </button>
            {showPortfolio && <OpenBesideButton label="Discuss beside" request={{ kind: "coach", title: "Coach", prompt: "Chart my progress" }} />}
          </div>
          {showPortfolio && <div className="mt-3"><VisualBoard spec={portfolio} showHeader={false} /></div>}
        </>
      )}
    </div>
  );
}
