/**
 * lib/server/breakPredictions.ts — persistence for the Break My Startup
 * prediction track record. Scoring lives in lib/breakCalibration.ts (pure).
 * Everything here is best-effort: a failure never blocks an analysis.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  summarizeTrackRecord, type PredictedTest, type TestStatus, type TrackRecord,
} from "@/lib/breakCalibration";

const HISTORY_ROWS = 60;
const STATUSES: TestStatus[] = ["supported", "refuted", "inconclusive", "open"];

export function isTestStatus(v: unknown): v is TestStatus {
  return typeof v === "string" && (STATUSES as string[]).includes(v);
}

async function loadAllTests(supabase: SupabaseClient, userId: string): Promise<PredictedTest[]> {
  const { data, error } = await supabase
    .from("break_predictions")
    .select("tests")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_ROWS);
  if (error || !data) return [];
  return data.flatMap((r) => (Array.isArray(r.tests) ? (r.tests as PredictedTest[]) : []));
}

/** The founder's track record across their saved analyses. Null if it cannot be read. */
export async function loadTrackRecord(supabase: SupabaseClient, userId: string): Promise<TrackRecord | null> {
  try {
    return summarizeTrackRecord(await loadAllTests(supabase, userId));
  } catch {
    return null;
  }
}

/** Saves this analysis's predictions. Returns the row id, or null if nothing was saved. */
export async function savePrediction(
  supabase: SupabaseClient,
  args: { userId: string; projectId?: string | null; tests: PredictedTest[] },
): Promise<string | null> {
  if (args.tests.length === 0) return null;
  try {
    const { data, error } = await supabase
      .from("break_predictions")
      .insert({ user_id: args.userId, project_id: args.projectId || null, tests: args.tests })
      .select("id")
      .single();
    if (error || !data) return null;
    return String(data.id);
  } catch {
    return null;
  }
}

/** Records what happened for one test. Returns the refreshed track record, or null on failure. */
export async function resolveTest(
  supabase: SupabaseClient,
  args: { userId: string; predictionId: string; testId: string; status: TestStatus; note?: string },
): Promise<TrackRecord | null> {
  try {
    const { data, error } = await supabase
      .from("break_predictions")
      .select("tests")
      .eq("id", args.predictionId)
      .eq("user_id", args.userId)
      .single();
    if (error || !data || !Array.isArray(data.tests)) return null;
    const tests = data.tests as PredictedTest[];
    let found = false;
    const next = tests.map((t) => {
      if (t.id !== args.testId) return t;
      found = true;
      return {
        ...t,
        status: args.status,
        note: args.note?.slice(0, 300) || undefined,
        resolvedAt: args.status === "open" ? undefined : new Date().toISOString(),
      };
    });
    if (!found) return null;
    const { error: upErr } = await supabase
      .from("break_predictions")
      .update({ tests: next })
      .eq("id", args.predictionId)
      .eq("user_id", args.userId);
    if (upErr) return null;
    return summarizeTrackRecord(await loadAllTests(supabase, args.userId));
  } catch {
    return null;
  }
}
