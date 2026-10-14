/**
 * lib/server/trialGuard.ts — one free trial per real person.
 *
 * Every free trial costs real AI money, so "make another account" is the
 * first thing a trial farmer does. Defences, cheapest first:
 *   1. The email must be verified (OAuth providers and confirmed signups).
 *   2. Throwaway-mail domains get no trial.
 *   3. Emails are normalised (gmail dots, +tags, googlemail) so
 *      a.b+x@gmail.com and ab@gmail.com are the SAME person.
 *   4. trial_claims has a unique key on the normalised email, so a second
 *      account for the same person cannot claim a second trial, even
 *      under concurrent requests.
 *
 * Fail-open on infrastructure errors (table not migrated yet): a missing
 * table must never lock out a legitimate new signup.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com", "10minutemail.com",
  "10minutemail.net", "tempmail.com", "temp-mail.org", "temp-mail.io", "throwawaymail.com", "yopmail.com",
  "yopmail.net", "trashmail.com", "getnada.com", "nada.email", "maildrop.cc", "dispostable.com",
  "fakeinbox.com", "mintemail.com", "mohmal.com", "emailondeck.com", "tempinbox.com", "burnermail.io",
  "spamgourmet.com", "mailnesia.com", "mytemp.email", "tempr.email", "discard.email", "moakt.com",
  "inboxkitten.com", "tmpmail.org", "tmpmail.net", "fakemail.net", "mail.tm", "dropmail.me",
]);

export function normalizeEmail(email: string): string {
  const e = String(email ?? "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

export function isDisposableEmail(email: string): boolean {
  const domain = String(email ?? "").toLowerCase().split("@")[1] ?? "";
  return DISPOSABLE.has(domain);
}

export type TrialDecision =
  | { action: "grant" }
  | { action: "deny"; reason: "disposable_email" | "trial_already_used" }
  | { action: "wait"; reason: "email_unverified" };

type UserForTrial = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
};

/** Pure decision part, kept separate so it is unit-testable. */
export function preflightTrial(user: UserForTrial): TrialDecision | null {
  if (!user.email) return { action: "wait", reason: "email_unverified" };
  if (!user.email_confirmed_at && !user.confirmed_at) return { action: "wait", reason: "email_unverified" };
  if (isDisposableEmail(user.email)) return { action: "deny", reason: "disposable_email" };
  return null;
}

/**
 * Decide whether this user may start a trial, and claim the slot atomically
 * when they may. Call immediately before creating the trial row.
 */
export async function claimTrial(admin: SupabaseClient, user: UserForTrial): Promise<TrialDecision> {
  const pre = preflightTrial(user);
  if (pre) return pre;

  const key = normalizeEmail(user.email as string);
  try {
    const { error } = await admin.from("trial_claims").insert({ normalized_email: key, user_id: user.id });
    if (!error) return { action: "grant" };

    if ((error as { code?: string }).code === "23505") {
      const { data } = await admin.from("trial_claims").select("user_id").eq("normalized_email", key).maybeSingle();
      // Same user asking again (idempotent) is fine; a different account is not.
      return data?.user_id === user.id ? { action: "grant" } : { action: "deny", reason: "trial_already_used" };
    }
    console.error("[trial-guard] claim failed, allowing trial:", error.message);
    return { action: "grant" };
  } catch (err) {
    console.error("[trial-guard] claim threw, allowing trial:", err);
    return { action: "grant" };
  }
}

/** Row values that mark a trial as already used (no AI allowance, trial paywall). */
export function spentTrialRow(userId: string, now = new Date()) {
  const iso = now.toISOString();
  return { user_id: userId, trial_started_at: iso, trial_ends_at: iso, trial_expired: true };
}
