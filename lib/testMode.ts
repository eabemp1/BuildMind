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
