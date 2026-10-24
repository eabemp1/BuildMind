/**
 * lib/today/rules.ts — the deterministic guard rules for a generated Today task.
 *
 * One list, used by the live routes (via assessTaskQuality), by the replay tool
 * and by the tests, so a rule can never behave differently in production than
 * in the regression suite. Models forget rules; regexes and set lookups don't.
 */

import { findContradictions, type Ledger } from "@/lib/today/facts";
import { repeatsStalledTask, type TaskCluster } from "@/lib/recommendationRecovery";

// Template text that leaked into a task instead of a real value.
export const TEMPLATE_LEAK_RE = /\bnot specified(?: yet)?\b|\bno confirmed evidence\b|\bundefined\b|\bnull\b|\bn\/a\b|\btbd\b|\blorem\b|\(\s*(?:myself|me|yourself)\s*\)|\bthe founder\b|\bplaceholder\b/i;
// "Find/identify a community/group/platform" with no named place is an unfinishable search.
export const OPEN_SEARCH_RE = /\b(?:find|locate|identify|discover|look\s+for|search\s+for|scout)\b[^.]{0,60}\b(?:communit(?:y|ies)|groups?|platforms?|channels?|forums?|workspaces?)\b/i;
export const NAMED_TARGET_RE = /\br\/\w+|#\w{3,}|https?:\/\/|\bwww\.|"[^"]{3,}"|\b(?:indie\s+hackers|product\s+hunt|hacker\s+news|y\s*combinator|startup\s+school|betalist|techcabal|nairobi|lagos)\b|\b[A-Z][a-z]+\s+(?:Founders?|Startups?|Hackers?|Builders?|Makers?)\b/;

export type GuardRule = "template_leak" | "open_ended_search" | "contradicts_fact" | "repeats_stalled_task";

/** Rules a task breaks. Empty = clean. `draft` is checked for template leaks only. */
export function guardRules(task: string, ledger?: Ledger, draft?: string, stalled?: Array<Pick<TaskCluster, "action" | "mode">>): GuardRule[] {
  const out: GuardRule[] = [];
  const t = task ?? "";
  if (TEMPLATE_LEAK_RE.test(t) || TEMPLATE_LEAK_RE.test(draft ?? "")) out.push("template_leak");
  if (OPEN_SEARCH_RE.test(t) && !NAMED_TARGET_RE.test(t)) out.push("open_ended_search");
  if (ledger && findContradictions(t, ledger).length > 0) out.push("contradicts_fact");
  // A task that has sat on Today for days comes back only in a changed form (smaller, clearer, unblocked or a decision).
  if (stalled?.length && repeatsStalledTask(t, stalled)) out.push("repeats_stalled_task");
  return out;
}
