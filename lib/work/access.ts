/**
 * lib/work/access.ts — what the free plan gets in Work and Conversations, and where Builder starts. Pure.
 *
 * Principle: nothing the free plan already had is taken away, and the daily loop stays free. Free keeps every short
 * message kind, the whole conversations tracker with drafts, the library and refining. What Builder adds is volume on
 * the heavier outputs: long documents (pitch outline, application, one-page spec, FAQ and the like) and pulling points
 * out of conversation notes. Free still gets a real taste of both. The 14-day trial counts as Builder, so a new
 * founder meets none of these limits in their first two weeks.
 */
import type { Plan } from "@/lib/plan";

export const FREE_DOCS_PER_MONTH = 2;
export const FREE_INSIGHTS_TOTAL = 3;

export interface Access { allowed: boolean; message?: string }

export function docAccess(plan: Plan, docsThisMonth: number): Access {
  if (plan === "builder" || docsThisMonth < FREE_DOCS_PER_MONTH) return { allowed: true };
  return { allowed: false, message: `You have used your ${FREE_DOCS_PER_MONTH} free long documents this month. Short messages, drafts and your tracker stay free. Builder gives you as many long documents as you need.` };
}

export function insightAccess(plan: Plan, used: number): Access {
  if (plan === "builder" || used < FREE_INSIGHTS_TOTAL) return { allowed: true };
  return { allowed: false, message: `You have used your ${FREE_INSIGHTS_TOTAL} free note readings. Your notes are still saved and you can keep logging conversations. Builder pulls out what matters from every conversation.` };
}

/** Free founders see what is left, so a limit is never a surprise. */
export function remainingFree(plan: Plan, used: number, total: number): number | null {
  return plan === "builder" ? null : Math.max(0, total - used);
}
