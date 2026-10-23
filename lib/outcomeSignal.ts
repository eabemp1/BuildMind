/**
 * lib/outcomeSignal.ts - structured outcomes for the learning loop.
 *
 * The first accuracy score compared the words of a prediction with the words of a reflection. That is
 * a weak proxy: a founder who writes "got 2 replies" against a prediction that says "responses from
 * prospects" scored low. This module scores the thing that actually matters: did the task produce a
 * real-world signal (a reply, a signup, a booked call, a payment), or nothing?
 *
 * Pure and deterministic. No IO. Used by lib/learningLoop.ts, the reflect-action route and the Reflect
 * form (same list of kinds, so the form and the scorer can never disagree).
 */

export const SIGNAL_KINDS = ["none", "reply", "conversation", "signup", "call", "payment", "visit", "other"] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

/**
 * How much BuildMind can stand behind a signal.
 *  verified  BuildMind observed it itself (a Stripe payment, a tracked-link visit, a signup on a hosted page).
 *  proof     the founder attached evidence that passed checks (a link, or pasted reply text).
 *  self      the founder only said so. Saved, shown as "unverified", and never counted as a success.
 */
export type SignalTrust = "verified" | "proof" | "self";

export interface OutcomeSignal {
  kind: SignalKind;
  /** How many of that signal (2 replies, 3 signups). 0 for "none", >= 1 otherwise. */
  count: number;
  /** Absent means "self". */
  trust?: SignalTrust;
}

export const SIGNAL_LABELS: Record<SignalKind, string> = {
  none: "Nothing yet",
  reply: "A reply",
  conversation: "A real conversation",
  signup: "A signup",
  call: "A booked call",
  payment: "A payment",
  visit: "Visitors to a link",
  other: "Something else",
};

/** How strong each real-world signal is as evidence that the advice worked (0-1). */
const BASE: Record<Exclude<SignalKind, "none">, number> = {
  payment: 1.0,
  visit: 0.6,
  call: 0.95,
  conversation: 0.85,
  signup: 0.85,
  reply: 0.75,
  other: 0.6,
};

export const MAX_SIGNAL_COUNT = 9999;

/** Validate untrusted input. Returns null when there is nothing usable (so the caller falls back). */
export function parseOutcomeSignal(raw: unknown): OutcomeSignal | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { kind?: unknown; count?: unknown };
  if (typeof r.kind !== "string" || !(SIGNAL_KINDS as readonly string[]).includes(r.kind)) return null;
  const kind = r.kind as SignalKind;
  // Trust is decided by the server, never read from the request.
  if (kind === "none") return { kind, count: 0, trust: "self" };
  const n = Number(r.count);
  const count = Number.isFinite(n) ? Math.max(1, Math.min(MAX_SIGNAL_COUNT, Math.floor(n))) : 1;
  return { kind, count, trust: "self" };
}

/**
 * Score a structured outcome 0-1. `completed` is whether the founder did the task.
 *
 *  - Did it and got a signal: the signal's strength, a small bonus for volume (3+).
 *  - Did it and got nothing: low. The advice did not produce evidence (0.25).
 *  - Did not finish but a signal still came back: partial credit (60% of strength).
 *  - Did not finish and nothing came back: very low (0.1).
 *
 * The 0.5 bar used everywhere else ("matched") still applies: a completed task with any signal passes,
 * a completed task with nothing does not.
 */
export function scoreStructuredOutcome(completed: boolean, signal: OutcomeSignal): number {
  if (signal.kind === "none") return completed ? 0.25 : 0.1;
  // A claim BuildMind cannot back never reaches the 0.5 success bar, whatever number was typed.
  if (isUnproven(signal)) return UNPROVEN_SCORE;
  const base = BASE[signal.kind];
  // One or two visitors could be the founder's friends; a visit signal needs a small crowd to count.
  if (signal.kind === "visit" && signal.count < 3) return completed ? 0.4 : 0.2;
  const volume = signal.count >= 3 ? 0.05 : 0;
  let full = Math.min(1, base + volume);
  if (signal.trust === "proof") full = Math.min(full, PROOF_CAP);
  return Math.round((completed ? full : full * 0.6) * 1000) / 1000;
}

/** Score stored for an unbacked claim. Below the 0.5 bar on purpose. */
export const UNPROVEN_SCORE = 0.4;
/** Proof the founder supplied counts, but never as much as something BuildMind saw itself. */
export const PROOF_CAP = 0.85;

/** True for a real-signal claim that nothing backs. "none" is an honest admission, so it is never unproven. */
export function isUnproven(signal: OutcomeSignal | null | undefined): boolean {
  return Boolean(signal && signal.kind !== "none" && (signal.trust ?? "self") === "self");
}

export type ScoreBasis = "structured" | "text";

/** True when the structured signal says real evidence was produced. */
export function signalProducedEvidence(signal: OutcomeSignal | null | undefined): boolean {
  return Boolean(signal && signal.kind !== "none" && signal.count >= 1);
}

/** One honest line the UI can show next to a resolved recommendation. */
export function describeSignal(signal: OutcomeSignal): string {
  if (signal.kind === "none") return "Produced nothing yet";
  const label = SIGNAL_LABELS[signal.kind].toLowerCase().replace(/^an? /, "");
  const base = signal.count > 1 ? `Produced ${signal.count} x ${label}` : `Produced ${SIGNAL_LABELS[signal.kind].toLowerCase()}`;
  const trust = signal.trust === "verified" ? " (verified by BuildMind)" : signal.trust === "proof" ? " (with proof)" : " (unverified)";
  return base + trust;
}
