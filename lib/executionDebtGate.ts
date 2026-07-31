/**
 * lib/executionDebtGate.ts
 *
 * Both live today-action routes (app/api/ai/today-action/route.ts and
 * stream/route.ts) compute execution debt and suppress task generation the
 * same way — see route.ts:563-577 and stream/route.ts:278-292, which were
 * byte-for-byte identical. This extracts that one check so a third caller
 * (the nightly morning-briefing cron) can reuse it instead of copy-pasting
 * a third slightly-different version.
 *
 * This does NOT touch the live routes — they keep their inline versions for
 * now. This only gives the nightly job the same safety check the live paths
 * already have.
 */
import { computeExecutionDebt, debtSuppressesTask, markDebtSurfaced, buildDebtPromptInjection, type ExecutionDebt } from "@/lib/executionDebt";

export interface ExecutionDebtCheckInput {
  avoidance_zones?: string[];
  override_reasons?: string[];
  tasks_overridden_this_week?: number;
  topics_mentioned_repeatedly?: string[];
  days_inactive?: number;
  memory_avoidance_zones?: string[];
  personality_tags?: string[];
  last_debt_surfaced?: Record<string, string> | null;
}

export interface ExecutionDebtCheckResult {
  suppressed: boolean;
  debt: ExecutionDebt;
  debtContext: string;
}

/**
 * Computes execution debt and, if it crosses the suppression threshold,
 * marks it as surfaced (same side effect the live routes perform) so the
 * cooldown logic in lib/executionDebt.ts works identically regardless of
 * which route triggered the surfacing.
 *
 * Callers decide what "suppressed" means for them — the live routes return
 * an intervention payload instead of a task; the nightly job should skip
 * caching a task for that day so the founder gets the live intervention
 * flow instead of a silently-generated task overnight.
 */
export async function checkExecutionDebtSuppression(
  userId: string,
  input: ExecutionDebtCheckInput,
): Promise<ExecutionDebtCheckResult> {
  const debt = computeExecutionDebt(
    {
      avoidance_zones: input.avoidance_zones ?? [],
      override_reasons: input.override_reasons ?? [],
      tasks_overridden_this_week: input.tasks_overridden_this_week ?? 0,
      topics_mentioned_repeatedly: input.topics_mentioned_repeatedly ?? [],
      days_inactive: input.days_inactive ?? 0,
    },
    {
      avoidance_zones: input.memory_avoidance_zones ?? [],
      decision_patterns: [],
      personality_tags: input.personality_tags ?? [],
      last_debt_surfaced: input.last_debt_surfaced ?? null,
    },
  );

  const suppressed = debtSuppressesTask(debt);
  if (suppressed) {
    await markDebtSurfaced(userId, debt);
  }

  return { suppressed, debt, debtContext: buildDebtPromptInjection(debt) };
}
