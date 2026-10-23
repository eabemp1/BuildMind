/**
 * lib/autoSignals.ts - real-world outcomes read from connected apps instead of self-report.
 *
 * Only signals BuildMind can verify itself are captured. Today that is Stripe: a successful payment
 * created after the recommendation was shown. Replies, Reddit comments and landing-page visits have no
 * connected source yet, so the founder still reports those on the Reflect form (SignalPicker).
 *
 * Rules:
 *  - What BuildMind observed beats what the founder typed (see lib/signalResolve.ts).
 *  - Read-only. Nothing is sent to anyone and nothing is changed in the connected app.
 *  - Never throws. Any failure returns null and the loop falls back to the founder's words.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/integrations/crypto";
import { countPaymentsSince, fetchStripeChargesSince, type StripeCharge } from "@/lib/integrations/stripe";
import type { OutcomeSignal } from "@/lib/outcomeSignal";
import { observedSince } from "@/lib/signalLinks";
import { strongestObserved, type ObservedSignal } from "@/lib/signalResolve";

export interface AutoSignal {
  signal: OutcomeSignal;
  source: "stripe";
  /** One honest line for the UI. */
  note: string;
}

/** Pure: turn a charge list into a payment signal, or null when there were none. */
export function paymentSignalFromCharges(charges: StripeCharge[], sinceMs: number, truncated = false): AutoSignal | null {
  const n = countPaymentsSince(charges, sinceMs);
  if (n < 1) return null;
  const count = Math.min(9999, n);
  return {
    signal: { kind: "payment", count },
    source: "stripe",
    note: `Stripe shows ${count}${truncated ? "+" : ""} payment${count === 1 ? "" : "s"} since this task was shown.`,
  };
}

/** Looks for a payment after `sinceIso` in the founder's connected Stripe account. */
export async function detectPaymentSignal(admin: SupabaseClient, userId: string, sinceIso: string | null | undefined): Promise<AutoSignal | null> {
  try {
    const sinceMs = Date.parse(sinceIso ?? "");
    if (!userId || !Number.isFinite(sinceMs)) return null;
    const { data } = await admin.from("integrations").select("access_token").eq("user_id", userId).eq("provider", "stripe").maybeSingle();
    const token = data?.access_token ? decryptSecret(data.access_token as string) : null;
    if (!token) return null;
    const res = await fetchStripeChargesSince(token, sinceMs);
    if (!res) return null;
    return paymentSignalFromCharges(res.charges, sinceMs, res.truncated);
  } catch {
    return null;
  }
}

/** Everything BuildMind itself observed since a moment: Stripe payments, tracked-link visits, hosted-page signups. */
export async function detectObservedSignal(admin: SupabaseClient, userId: string, sinceIso: string | null | undefined): Promise<ObservedSignal | null> {
  try {
    if (!sinceIso || !Number.isFinite(Date.parse(sinceIso))) return null;
    const [pay, seen] = await Promise.all([detectPaymentSignal(admin, userId, sinceIso), observedSince(admin, userId, sinceIso)]);
    const all: ObservedSignal[] = [...seen];
    if (pay) all.push({ kind: "payment", count: pay.signal.count, source: "stripe" });
    return strongestObserved(all);
  } catch {
    return null;
  }
}
