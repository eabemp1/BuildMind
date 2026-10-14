/**
 * lib/aiLimits.ts — the AI usage ceilings, in one dependency-free module.
 *
 * Lives here (not in app/api/ai/_utils.ts) so UI-facing code such as
 * lib/coachAppKnowledge.ts can read the real numbers without importing a
 * server route utility. _utils.ts re-exports these under the same names.
 *
 * "general" covers Coach, Break My Startup and other open-ended surfaces;
 * "core" is the separate, more generous allowance for the daily-action loop
 * (today-action, reflect-action, reflect-synthesis, reflexion-strike,
 * onboarding-insight) so the habit loop is never blocked by Coach usage.
 */

export const PLAN_MONTHLY_LIMITS: Record<string, number> = {
  free: 30,
  trial: 250,    // 14 days × ~18/day — enough to feel the product, not to farm it
  builder: 1500,
};

export const PLAN_DAILY_LIMITS: Record<string, number> = {
  free: 3,
  trial: 25,     // was 80 (full Builder). Trials cost money and convert on a taste, not a feast
  builder: 80,
};

export const CORE_MONTHLY_LIMITS: Record<string, number> = {
  free: 45,     // ~1.5/day headroom — generous, but still a real ceiling
  trial: 450,
  builder: 3000,
};

export const CORE_DAILY_LIMITS: Record<string, number> = {
  free: 6,      // realistically used 1-2x/day; this is slack, not a wall
  trial: 30,
  builder: 150,
};
