/**
 * lib/signalResolve.ts - decide which outcome signal a reflection is scored on.
 *
 * Inputs: what the founder claimed (typed), whether their proof passed checks, and whatever BuildMind
 * observed itself (Stripe payments, tracked-link visits, hosted-page signups). Reality outranks claims:
 *
 *   1. Something BuildMind observed beats a typed claim of the same or lower strength, even when the
 *      founder claimed "nothing" (they may not know a visitor or a payment arrived).
 *   2. A stronger claim backed by proof beats a weaker observation.
 *   3. Otherwise the claim stands at the trust it earned: proof, or self (unverified, not counted).
 *
 * Pure.
 */

import type { OutcomeSignal, SignalKind, SignalTrust } from "@/lib/outcomeSignal";

/** Higher = stronger evidence that the advice worked. "none" is 0. */
const RANK: Record<SignalKind, number> = { none: 0, other: 1, visit: 2, reply: 3, signup: 4, conversation: 5, call: 6, payment: 7 };

export interface ObservedSignal {
  kind: Exclude<SignalKind, "none">;
  count: number;
  /** Where BuildMind saw it. */
  source: "stripe" | "link" | "page" | "confirm" | "reddit";
  /** Defaults to "verified". A person's confirmation or a Reddit count can involve friends or alt accounts, so those are "proof". */
  trust?: "verified" | "proof";
}

export interface Resolved {
  signal: OutcomeSignal;
  source: "founder" | "auto";
  /** Set when an observation replaced or overrode the founder's claim. */
  note?: string;
}

/** The strongest thing BuildMind observed, or null. */
export function strongestObserved(list: ObservedSignal[]): ObservedSignal | null {
  const real = list.filter((o) => o && o.count >= 1);
  if (!real.length) return null;
  return [...real].sort((a, b) => RANK[b.kind] - RANK[a.kind] || b.count - a.count)[0];
}

export function observedNote(o: ObservedSignal): string {
  const what = o.kind === "payment" ? `payment${o.count === 1 ? "" : "s"}` : o.kind === "signup" ? `signup${o.count === 1 ? "" : "s"}` : `visitor${o.count === 1 ? "" : "s"}`;
  if (o.source === "confirm") return `${o.count} ${o.kind}${o.count === 1 ? " was" : "s were"} confirmed by the other person since this task was shown.`;
  if (o.source === "reddit") return `Your Reddit post shows ${o.count} other ${o.count === 1 ? "person" : "people"} commenting.`;
  const where = o.source === "stripe" ? "Stripe shows" : o.source === "page" ? "Your hosted page recorded" : "Your tracked link recorded";
  return `${where} ${o.count} ${what} since this task was shown.`;
}

export function resolveSignal(input: {
  claimed: OutcomeSignal | null;
  proofOk: boolean;
  observed: ObservedSignal | null;
}): Resolved | null {
  const { claimed, proofOk, observed } = input;
  const claimedTrust: SignalTrust = claimed && claimed.kind !== "none" ? (proofOk ? "proof" : "self") : "self";

  if (observed) {
    const claimRank = claimed ? RANK[claimed.kind] : 0;
    const claimBacked = claimed && claimed.kind !== "none" && proofOk;
    // A claim only outranks an observation when it is both stronger and backed by proof.
    if (!(claimBacked && claimRank > RANK[observed.kind])) {
      return {
        signal: { kind: observed.kind, count: observed.count, trust: observed.trust ?? "verified" },
        source: "auto",
        note: observedNote(observed),
      };
    }
  }
  if (!claimed) return null;
  return { signal: { ...claimed, trust: claimedTrust }, source: "founder" };
}
