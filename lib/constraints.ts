/**
 * lib/constraints.ts: the founder's real limits (time per day, money per month).
 * Stored as one small JSON value in user_behavior_state under "founder_constraints", so no migration.
 * Prompts get a binding line; with nothing set they get nothing, and nothing is assumed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Constraints {
  /** Minutes the founder can give to the business on a normal day. */
  minutesPerDay: number | null;
  /** Money for the business per month, in the founder's own currency. 0 means no spend at all. */
  monthlyBudget: number | null;
}

export const CONSTRAINTS_KEY = "founder_constraints";

const num = (v: unknown, max: number): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), max) : null;
};

/** Safe parse of whatever came from the client or the store. Null when nothing usable is set. */
export function parseConstraints(v: unknown): Constraints | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const c: Constraints = { minutesPerDay: num(o.minutesPerDay, 960), monthlyBudget: num(o.monthlyBudget, 10_000_000) };
  return c.minutesPerDay === null && c.monthlyBudget === null ? null : c;
}

/** A binding line for prompts. Empty when the founder has set nothing. */
export function constraintsRule(c: Constraints | null): string {
  if (!c) return "";
  const parts: string[] = [];
  if (c.minutesPerDay !== null) parts.push(`${c.minutesPerDay} minutes a day for the business. Every task must fit inside that, with the time stated honestly.`);
  if (c.monthlyBudget !== null) parts.push(c.monthlyBudget === 0
    ? "NO money to spend. Recommend free actions only: no ads, no paid tools, no paid samples."
    : `${c.monthlyBudget} a month to spend in total. Never recommend spending more than that, and prefer free actions first.`);
  return `FOUNDER'S OWN LIMITS (they set these; treat them as binding):\n${parts.map((p) => `- ${p}`).join("\n")}`;
}

export async function loadConstraints(admin: SupabaseClient, userId: string): Promise<Constraints | null> {
  try {
    const { data } = await admin.from("user_behavior_state").select("value").eq("user_id", userId).eq("key", CONSTRAINTS_KEY).maybeSingle();
    return parseConstraints(data?.value);
  } catch {
    return null;
  }
}
