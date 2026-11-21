/**
 * lib/break/budget.ts: one time budget for a whole Break My Startup request, plus per-stage timings.
 * The route has 60s. The budget ends at 55s so the result can be built, saved and returned. Optional stages
 * (pivots, execution plan) are skipped when too little time is left, and the response says so instead of the
 * whole request timing out. Pure apart from the clock, which can be injected for tests.
 */
export interface Budget {
  /** Absolute epoch ms the request should be finished by. */
  deadline: number;
  /** Short id so one run can be found in the logs. */
  runId: string;
  remaining(): number;
  canRun(minMs: number): boolean;
  time<T>(name: string, fn: () => Promise<T>): Promise<T>;
  skip(name: string): void;
  summary(): { timings: Record<string, number>; skipped: string[]; elapsedMs: number; partial: boolean };
}

export function createBudget(totalMs = 55_000, now: () => number = Date.now): Budget {
  const start = now();
  const timings: Record<string, number> = {};
  const skipped: string[] = [];
  const b: Budget = {
    deadline: start + totalMs,
    runId: `bms_${start.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    remaining: () => Math.max(0, start + totalMs - now()),
    canRun: (minMs) => b.remaining() >= minMs,
    async time(name, fn) {
      const t0 = now();
      try { return await fn(); } finally { timings[name] = (timings[name] ?? 0) + (now() - t0); }
    },
    skip(name) { if (!skipped.includes(name)) skipped.push(name); },
    summary: () => ({ timings: { ...timings }, skipped: [...skipped], elapsedMs: now() - start, partial: skipped.length > 0 }),
  };
  return b;
}

/** The reflexion step gets at most its usual 26s, and never past the request budget minus time to build the answer. */
export function reflexionDeadline(budget: Budget, now: number = Date.now()): number {
  return Math.min(now + 26_000, budget.deadline - 6_000);
}

/** Fields added to the response, and one log line with timings. No prompts or user text are logged. */
export function traceFields(budget: Budget, extra: Record<string, unknown> = {}) {
  const t = budget.summary();
  console.info("[bms-trace]", JSON.stringify({ runId: budget.runId, ...t, ...extra }));
  return { run_id: budget.runId, partial: t.partial, skipped_stages: t.skipped, stage_timings_ms: t.timings };
}
