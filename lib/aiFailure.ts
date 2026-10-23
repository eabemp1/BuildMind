/**
 * lib/aiFailure.ts - say WHY the AI did not answer, in plain words.
 *
 * Before, every failure on Today looked the same ("temporarily unavailable"), whether the real cause was
 * a daily limit, the platform's AI capacity cap, an expired session, or a flaky connection. The right
 * next step is different for each, so the message is too. Only messages written by our own limit and
 * budget code are shown verbatim; anything else gets generic wording so internals never leak.
 */

export type AiFailureKind = "budget" | "limit" | "session" | "plan" | "offline" | "server" | "unknown";

export interface AiFailure {
  kind: AiFailureKind;
  title: string;
  detail: string;
  /** Trying again straight away can help. False for limits that need time or an upgrade. */
  retryable: boolean;
}

const BUDGET_RE = /AI capacity limit reached/i;
const LIMIT_RE = /(daily|monthly) AI limit reached/i;

export function classifyAiFailure(input: { status?: number | null; message?: string | null; offline?: boolean }): AiFailure {
  const msg = String(input.message ?? "");
  const status = input.status ?? 0;
  if (input.offline) {
    return { kind: "offline", title: "You appear to be offline", detail: "Reconnect and try again. Your data and progress are safe.", retryable: true };
  }
  if (BUDGET_RE.test(msg)) {
    return { kind: "budget", title: "AI is at capacity right now", detail: msg.slice(0, 240), retryable: false };
  }
  if (LIMIT_RE.test(msg)) {
    return { kind: "limit", title: "You have used your AI allowance", detail: msg.slice(0, 280), retryable: false };
  }
  if (status === 401) {
    return { kind: "session", title: "Your session expired", detail: "Sign in again to get today's recommendation.", retryable: false };
  }
  if (status === 402 || status === 403) {
    return { kind: "plan", title: "This needs a plan upgrade", detail: "Today's recommendation is not included in your current plan.", retryable: false };
  }
  if (status === 429) {
    return { kind: "limit", title: "Too many requests", detail: "Wait a minute, then try again.", retryable: true };
  }
  if (status >= 500) {
    return { kind: "server", title: "BuildMind hit a problem", detail: "This is on our side, not yours. Your data and progress are safe. Try again in a moment.", retryable: true };
  }
  return { kind: "unknown", title: "Intelligence temporarily unavailable", detail: "BuildMind couldn't generate today's recommendation. Your data and progress are safe.", retryable: true };
}
