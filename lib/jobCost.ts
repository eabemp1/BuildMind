/**
 * lib/jobCost.ts: what one heavy job used. Wrap the job in withJobCost(); every model call made inside it
 * (lib/ai-providers.ts calls noteModelCall) is added to one tally, saved as one row in job_costs.
 * Token counts are estimates (characters / 4). Saving never blocks or fails the job.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface JobTally { userId?: string; calls: number; inTokens: number; outTokens: number; providers: Set<string>; ms: number }
const store = new AsyncLocalStorage<JobTally>();

export function noteModelCall(c: { provider: string; ms: number; inTokens: number; outTokens: number }): void {
  const t = store.getStore();
  if (!t) return;
  t.calls += 1; t.inTokens += c.inTokens; t.outTokens += c.outTokens; t.ms += c.ms; t.providers.add(c.provider);
}

/** Called by the route once it knows who the user is. */
export function setJobUser(userId: string): void { const t = store.getStore(); if (t) t.userId = userId; }

export function emptyTally(): JobTally { return { calls: 0, inTokens: 0, outTokens: 0, providers: new Set(), ms: 0 }; }

export function tallyRow(userId: string, kind: string, jobId: string | null, t: JobTally) {
  return { user_id: userId, kind, job_id: jobId, calls: t.calls, approx_in_tokens: t.inTokens, approx_out_tokens: t.outTokens, providers: [...t.providers], ms: t.ms };
}

/** Run a heavy route handler inside a tally. The handler calls setJobUser() after it has checked who is calling. */
export async function withJobCost<T>(kind: string, fn: () => Promise<T>, jobId?: () => string | null): Promise<T> {
  const tally = emptyTally();
  try {
    return await store.run(tally, fn);
  } finally {
    if (tally.userId && tally.calls > 0) {
      try {
        const { createAdminClient } = await import("@/lib/supabase/admin");
        await createAdminClient().from("job_costs").insert(tallyRow(tally.userId, kind, jobId?.() ?? null, tally));
      } catch { /* table may not exist yet */ }
    }
  }
}
