/** Pure helpers for the Patterns page AI analysis (kept out of the route file so they can be tested). */

export type InsightItem = {
  type: "warning" | "positive" | "insight";
  text: string;
  basis: string | null;
  evidence: string | null;
};

export type InsightInput = {
  avoidanceZones?: string[];
  strengths?: string[];
  completionByDay?: Record<string, { completed: number; total: number }>;
  avgConfidenceByOutcome?: Record<string, number>;
  topOverrideReason?: string;
  totalTasksCompleted?: number;
  totalTasksShown?: number;
  metacriticSignal?: string;
  stage?: string;
};

/** Plain-rule insights built only from the founder's real data. Used when the model gives nothing usable. */
export function deterministicInsights(input: InsightInput, evidenceMap: Record<string, string>): InsightItem[] {
  const out: InsightItem[] = [];
  const add = (type: InsightItem["type"], text: string, basis: string) => {
    if (Object.prototype.hasOwnProperty.call(evidenceMap, basis)) out.push({ type, text, basis, evidence: evidenceMap[basis] });
  };

  const zones = input.avoidanceZones ?? [];
  if (zones[0]) add("warning", `You keep steering around ${zones[0]}. Make it the first thing you do this week, before anything easier.`, "avoidance:0");

  const shown = input.totalTasksShown ?? 0;
  const done = input.totalTasksCompleted ?? 0;
  if (shown >= 3) {
    const rate = Math.round((done / shown) * 100);
    add(rate >= 60 ? "positive" : "warning",
      rate >= 60 ? `You finish ${rate}% of the tasks you are shown. Protect that rhythm.` : `You finish ${rate}% of the tasks you are shown. Shrink tomorrow's task until you can finish it.`,
      "execution_rate");
  }

  const days = Object.entries(input.completionByDay ?? {}).filter(([, v]) => v && v.total >= 2);
  if (days.length >= 2) {
    const rate = (v: { completed: number; total: number }) => v.completed / v.total;
    const sorted = [...days].sort((a, b) => rate(b[1]) - rate(a[1]));
    const best = sorted[0], worst = sorted[sorted.length - 1];
    if (rate(best[1]) > rate(worst[1])) {
      add("insight", `${best[0]} is your strongest day (${best[1].completed} of ${best[1].total} done). Put your hardest task there.`, `completion_day:${best[0]}`);
      if (rate(worst[1]) === 0) add("warning", `Nothing completed on ${worst[0]} out of ${worst[1].total} tasks. Plan lighter or skip that day on purpose.`, `completion_day:${worst[0]}`);
    }
  }

  if (input.topOverrideReason) add("insight", `When you override a task, the reason is usually "${input.topOverrideReason}". Fix that before the next task.`, "override_reason");
  if ((input.strengths ?? [])[0]) add("positive", `${input.strengths![0]} is a real strength. Lean on it when a task feels heavy.`, "strength:0");

  return out.slice(0, 4);
}

