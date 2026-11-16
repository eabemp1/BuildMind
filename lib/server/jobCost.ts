/**
 * lib/server/jobCost.ts: server only. Wrap a heavy route handler in withJobCost(); every model call made inside it is
 * added to one tally and saved as one row in job_costs. Saving never blocks or fails the job.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { emptyTally, tallyRow, STORE_KEY, type JobTally } from "@/lib/jobCost";

const store = new AsyncLocalStorage<JobTally>();
(globalThis as unknown as Record<string, unknown>)[STORE_KEY] = store;

/** Called by the route once it knows who the user is. */
export function setJobUser(userId: string): void { const t = store.getStore(); if (t) t.userId = userId; }

export async function withJobCost<T>(kind: string, fn: () => Promise<T>, jobId?: () => string | null): Promise<T> {
  const tally = emptyTally();
  (globalThis as unknown as Record<string, unknown>)[STORE_KEY] = store;
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
