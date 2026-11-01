/**
 * lib/today/lesson.ts — one plain sentence about why this kind of work matters, for founders who are new to
 * building a startup. Shown after the task's own reason for a founder's first week or so, never later,
 * so it teaches without lecturing. Pure.
 */

const LESSON: Record<string, string> = {
  interview: "Five real conversations teach you more than a month of guessing.",
  outreach: "Nobody can want your product until someone has told them it exists.",
  follow_up: "Most replies come after the second message, not the first.",
  build: "Build the smallest version that tests the idea, not the finished one.",
  publish: "Showing it publicly, even roughly, tells you more than polishing it in private.",
  pricing: "Asking someone to pay is the clearest test that the problem is real.",
  analyze: "One clear question answered from what you already have beats a new pile of data.",
  unblock: "A tiny first step is often enough to make the stuck thing move.",
  reset: "A small win today is worth more than a big plan you don't start.",
};

/** Days an account counts as new, and how many finished tasks end that. */
export const NEW_FOUNDER_DAYS = 14;
export const NEW_FOUNDER_TASKS = 6;

export function lessonFor(missionKind: string | null | undefined, accountAgeDays: number, tasksCompleted: number): string | null {
  if (!missionKind || accountAgeDays >= NEW_FOUNDER_DAYS || tasksCompleted >= NEW_FOUNDER_TASKS) return null;
  return LESSON[missionKind] ?? null;
}
