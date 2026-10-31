/**
 * lib/today/crossLinks.ts — when Today may point a founder at Break My Startup or the Agent workspace.
 *
 * Deliberately sparse so Today stays about the task: one suggestion a day at most, each kind once (the re-run
 * offer once every two weeks), never before the founder has finished something, and only on the calm finish
 * screen after a task. Pure, so the rules are easy to test.
 */

export type CrossLinkId = "break" | "break_blocked" | "break_rerun" | "validate";

export interface CrossLink { id: CrossLinkId; text: string; cta: string; href: string }

export interface CrossLinkInput {
  /** Tasks the founder has finished, including the one just done. */
  tasksCompleted: number;
  outcome: "completed" | "partial" | "learned" | "blocked" | null;
  /** The planner's stage band, for the validation check. */
  band: string;
  /** Days since the last Break My Startup analysis, or null if they have never run one. */
  breakAgeDays: number | null;
  /** They have already run an Agent workspace mission. */
  hasAgentRun: boolean;
  startup: string;
  /** id -> YYYY-MM-DD the suggestion was last shown, kept on the device. */
  seen: Record<string, string>;
  today: string;
}

const RERUN_AFTER_DAYS = 7;
const RERUN_REPEAT_DAYS = 14;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function pickCrossLink(i: CrossLinkInput): CrossLink | null {
  if (i.tasksCompleted < 1) return null;
  if (Object.values(i.seen).some((d) => d === i.today)) return null;
  const name = i.startup.trim() || "your startup";
  const unseen = (id: CrossLinkId) => !i.seen[id];

  if (i.breakAgeDays === null) {
    if (i.outcome === "blocked" && unseen("break_blocked")) {
      return { id: "break_blocked", text: "Blocked often means one risk is bigger than the others. A teardown shows which one.", cta: "Break my startup", href: "/break" };
    }
    if (unseen("break")) {
      return { id: "break", text: `You finished a step. See what could stop ${name}, in about 2 minutes.`, cta: "Break my startup", href: "/break" };
    }
  } else if (i.breakAgeDays >= RERUN_AFTER_DAYS) {
    const last = i.seen.break_rerun;
    if (!last || daysBetween(last, i.today) >= RERUN_REPEAT_DAYS) {
      return { id: "break_rerun", text: `It has been ${i.breakAgeDays} days since your last teardown. Run it again to see what changed.`, cta: "Run it again", href: "/break" };
    }
  }

  if (!i.hasAgentRun && (i.band === "idea" || i.band === "validation") && i.tasksCompleted >= 2 && unseen("validate")) {
    return { id: "validate", text: "Not sure people want it? Send the validation agent to look for real evidence.", cta: "Run a validation check", href: "/agents?agent=validation" };
  }
  return null;
}
