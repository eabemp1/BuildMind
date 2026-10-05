/**
 * lib/milestoneScope.ts
 *
 * Which milestones and tasks are actually "in play" for a project's current
 * stage. A project on Launch whose Growth and Revenue milestones have not been
 * started is not "stalled on Growth for 61 days"; those milestones are
 * upcoming. And tasks left over from an earlier stage are superseded, not
 * "delayed". Both mistakes showed up in a real intelligence export.
 */
import { STAGE_ORDER, normalizeStage } from "@/lib/stages";

type Row = Record<string, any>;

const PLACEHOLDER = new Set(["idea", "validation", "mvp", "launch", "growth", "revenue"]);

/** Stage index of a milestone, or null when it has no stage signal. */
export function milestoneStageIndex(m: Row): number | null {
  const raw = typeof m.stage === "string" && m.stage.trim() ? m.stage : null;
  if (raw) return STAGE_ORDER.indexOf(normalizeStage(raw));
  const title = String(m.title ?? "").trim().toLowerCase();
  if (PLACEHOLDER.has(title)) return STAGE_ORDER.indexOf(normalizeStage(title));
  return null;
}

export type MilestonePhase = "past" | "current" | "upcoming";

export function milestonePhase(m: Row, currentStage: string): MilestonePhase {
  const idx = milestoneStageIndex(m);
  if (idx === null) return "current"; // no signal: assume it is in play
  const cur = STAGE_ORDER.indexOf(normalizeStage(currentStage));
  return idx < cur ? "past" : idx > cur ? "upcoming" : "current";
}

const OPEN = (m: Row) => m.status !== "completed" && m.status !== "abandoned";

export function splitMilestones(milestones: Row[], currentStage: string) {
  const open = milestones.filter(OPEN);
  return {
    inPlay: open.filter((m) => milestonePhase(m, currentStage) !== "upcoming"),
    upcoming: open.filter((m) => milestonePhase(m, currentStage) === "upcoming"),
  };
}

/** Tasks that still matter now: not completed, and their milestone is the current stage (or unscoped). */
export function tasksInPlay(tasks: Row[], milestones: Row[], currentStage: string): Row[] {
  const byId = new Map(milestones.map((m) => [String(m.id), m]));
  return tasks.filter((t) => {
    if (t.is_completed || t.status === "completed") return false;
    const m = t.milestone_id ? byId.get(String(t.milestone_id)) : undefined;
    return !m || milestonePhase(m, currentStage) === "current";
  });
}
