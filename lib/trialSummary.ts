/**
 * lib/trialSummary.ts: the plain facts a founder on a trial wants to read.
 * Every number comes from the same constants the server enforces, so this page cannot promise more than the app gives.
 */
import { PLAN_DAILY_LIMITS, PLAN_MONTHLY_LIMITS, CORE_DAILY_LIMITS, CORE_MONTHLY_LIMITS } from "@/lib/aiLimits";
import { PLAN_LIMITS } from "@/lib/plan";

export interface TrialSummary {
  included: string[];
  limits: string[];
  afterwards: string[];
}

export function trialSummary(): TrialSummary {
  return {
    included: [
      "Everything in Builder: daily task, reflections that shape the next task, Find Customers, Demand Check, the Work tools, and the coach.",
      "Unlimited projects and full history.",
    ],
    limits: [
      `Daily task generation: up to ${CORE_DAILY_LIMITS.trial} a day and ${CORE_MONTHLY_LIMITS.trial} over the trial.`,
      `Coach, searches and other AI tools share ${PLAN_DAILY_LIMITS.trial} uses a day and ${PLAN_MONTHLY_LIMITS.trial} over the trial. A Find Customers or Demand Check search uses one.`,
      "A paid Builder plan has higher limits.",
    ],
    afterwards: [
      "Nothing is charged unless you upgrade. No card is on file.",
      `Your data stays. You move to the Free plan: ${PLAN_LIMITS.free.actionsPerWeek} daily tasks a week, ${PLAN_DAILY_LIMITS.free} coach and AI uses a day, ${PLAN_LIMITS.free.maxProjects} project, and no Find Customers or Demand Check.`,
    ],
  };
}
