/**
 * lib/admin/founderStatus.ts — one plain line saying whether a new founder is in danger of leaving. Pure.
 * Counted from what happened (tasks finished, days they showed up), never guessed.
 */
export interface FounderActivity { daysSince: number; finished: number; activeDays: number; lastSeenDays: number | null }
export type RiskLevel = "ok" | "watch" | "risk";

export function founderStatus(a: FounderActivity): { level: RiskLevel; text: string } {
  if (a.finished > 0 && a.lastSeenDays !== null && a.lastSeenDays <= 1) return { level: "ok", text: "Finished a task and is still active" };
  if (a.finished > 0) return { level: "watch", text: `Finished a task, but not seen for ${a.lastSeenDays ?? a.daysSince} days` };
  if (a.daysSince <= 0) return { level: "ok", text: "Joined today, nothing to judge yet" };
  if (a.daysSince >= 2) return { level: "risk", text: `Day ${a.daysSince} and nothing finished yet` };
  return { level: "watch", text: "Day 1 and nothing finished yet" };
}
