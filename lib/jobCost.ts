/**
 * lib/jobCost.ts (safe to import anywhere, including code that reaches the browser bundle).
 * noteModelCall adds one model call to the job tally set up by lib/server/jobCost.ts. Outside a job it does nothing.
 * Token counts are estimates (characters / 4).
 */
import { estimateUsd } from "@/lib/modelPrices";

export interface JobTally { userId?: string; calls: number; inTokens: number; outTokens: number; providers: Set<string>; ms: number; usd: number; unpriced: number }
export const STORE_KEY = "__bmJobStore";
type Store = { getStore(): JobTally | undefined };

export function currentTally(): JobTally | undefined {
  return ((globalThis as unknown as Record<string, Store | undefined>)[STORE_KEY])?.getStore();
}

export function noteModelCall(c: { provider: string; ms: number; inTokens: number; outTokens: number }): void {
  const t = currentTally();
  if (!t) return;
  t.calls += 1; t.inTokens += c.inTokens; t.outTokens += c.outTokens; t.ms += c.ms; t.providers.add(c.provider);
  const usd = estimateUsd(c.provider, c.inTokens, c.outTokens);
  if (usd === null) t.unpriced += 1; else t.usd += usd;
}

export function emptyTally(): JobTally { return { calls: 0, inTokens: 0, outTokens: 0, providers: new Set(), ms: 0, usd: 0, unpriced: 0 }; }

export function tallyRow(userId: string, kind: string, jobId: string | null, t: JobTally) {
  return { user_id: userId, kind, job_id: jobId, calls: t.calls, approx_in_tokens: t.inTokens, approx_out_tokens: t.outTokens, providers: [...t.providers], ms: t.ms };
}

/** The same row plus the dollar columns (they exist once 20261116020000_job_costs_usd.sql has been run). */
export function tallyRowWithUsd(userId: string, kind: string, jobId: string | null, t: JobTally) {
  return { ...tallyRow(userId, kind, jobId, t), approx_usd: Math.round(t.usd * 1e6) / 1e6, unpriced_calls: t.unpriced };
}
