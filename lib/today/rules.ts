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

// Debugging someone else's platform (a banned Discord account, a DNS or SSL fault) is not work BuildMind can help with,
// and it is the kind of task a founder gets stuck on for days. Social and community platforms, plus hosting and domain plumbing.
export const PLATFORM_DEBUG_RE = /\b(?:debug|troubleshoot|diagnos\w*|investigate|resolve|fix|work\s+out\s+why|figure\s+out\s+why)\b[^.]{0,60}\b(?:discord|slack|reddit|linkedin|whatsapp|twitter|telegram|facebook|instagram|tiktok|youtube|product\s+hunt|hacker\s+news|dns|ssl|domain|hosting|cloudflare|godaddy|namecheap|vercel|netlify)\b[^.]{0,40}\b(?:issues?|errors?|bugs?|problems?|not\s+working|won'?t|can'?t|fail(?:s|ed|ing)?|banned|suspended|rejected|verification|access)\b/i;

export type GuardRule = "template_leak" | "open_ended_search" | "contradicts_fact" | "repeats_stalled_task" | "platform_debugging";

/** Rules a task breaks. Empty = clean. `draft` is checked for template leaks only. */
export function guardRules(task: string, ledger?: Ledger, draft?: string, stalled?: Array<Pick<TaskCluster, "action" | "mode">>): GuardRule[] {
  const out: GuardRule[] = [];
  const t = task ?? "";
  if (TEMPLATE_LEAK_RE.test(t) || TEMPLATE_LEAK_RE.test(draft ?? "")) out.push("template_leak");
  if (OPEN_SEARCH_RE.test(t) && !NAMED_TARGET_RE.test(t)) out.push("open_ended_search");
  if (PLATFORM_DEBUG_RE.test(t)) out.push("platform_debugging");
  if (ledger && findContradictions(t, ledger).length > 0) out.push("contradicts_fact");
  // A task that has sat on Today for days comes back only in a changed form (smaller, clearer, unblocked or a decision).
  if (stalled?.length && repeatsStalledTask(t, stalled)) out.push("repeats_stalled_task");
  return out;
}
