/**
 * lib/testMode.ts: the founder can mark their account as a test run.
 * Stored as one small value in user_behavior_state under "test_mode" ({ on: boolean }), so no migration.
 * When on, prompts are told nothing here is real evidence and must not be treated as such.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const TEST_MODE_KEY = "test_mode";

export function parseTestMode(v: unknown): { on: boolean } {
  return { on: !!v && typeof v === "object" && (v as { on?: unknown }).on === true };
}

export function testModeRule(on: boolean): string {
  return on
    ? "TEST MODE: the founder marked this account as a test run. Nothing here is real customer, revenue or market evidence. Do not draw conclusions about demand or traction from it, and say so if asked."
    : "";
}

export async function loadTestMode(admin: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data } = await admin.from("user_behavior_state").select("value").eq("user_id", userId).eq("key", TEST_MODE_KEY).maybeSingle();
    return parseTestMode(data?.value).on;
  } catch {
    return false;
  }
}

/** True when generated task text repeats test-scenario wording instead of giving the founder real work. */
export function echoesTestScenario(text: string): boolean {
  return /\b(?:severe\s+)?founder\s+avoidance\b|\b(?:qa|test)\s+(?:scenario|persona|script)\b|\bsimulated\s+founder\b|\btest(?:ing)?\s+(?:the\s+)?(?:app|buildmind|system|product\s+behaviou?r)\b|\bthis\s+is\s+a\s+test\b/i.test(text);
}

export const TEST_RUN_TAG = "[test run]";
/** Marks one saved event as made during a test run. Idempotent. */
export function markTestRun(text: string): string {
  const t = (text ?? "").trim();
  return t.startsWith(TEST_RUN_TAG) ? t : `${TEST_RUN_TAG} ${t}`.trim();
}
export const isTestRun = (text: string | null | undefined): boolean => (text ?? "").trim().startsWith(TEST_RUN_TAG);
