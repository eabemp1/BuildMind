/**
 * lib/recommendationRecovery.ts — notices when the same task keeps coming back and decides how to recover.
 *
 * Why it exists: the task history handed to the generator collapses repeats into one entry
 * (distinctByAction). That is right for counting rejections, but it hid the real problem: a
 * task shown on 20 different days looked like one task shown once. In a real export one task
 * came back on 20+ days with every row still "pending".
 *
 * Rules this module follows (all deterministic, no model):
 *  - Showing a task and getting no answer is NOT rejection or avoidance. "pending" and the
 *    legacy sweep value "ignored" are "no signal", not evidence the founder disliked it.
 *  - Real signals are: completed / learned (resolved), partial (progress), blocked, a swap
 *    (overridden / replaced), and an explicit skip.
 *  - Recovery keeps the underlying goal. It changes the size, clarity, route or decision, never
 *    drops the goal because the task was hard.
 *
 * Pure, no I/O, client-safe.
 */

import { overlap } from "@/lib/today/facts";
import { normalizeActionKey } from "@/lib/recommendationRows";

export interface ShownTask {
  action: string;
  /** ISO timestamp the task was shown. */
  shownAt: string;
  outcome?: string | null;
  blockedAt?: string | null;
  blockedReason?: string | null;
  skippedAt?: string | null;
  replacedBy?: string | null;
}

export type RecoveryMode = "continue" | "shrink" | "clarify" | "unblock" | "alternative" | "reconsider";

export interface TaskCluster {
  action: string;
  key: string;
  daysShown: number;
  timesShown: number;
  firstShown: string;
  lastShown: string;
  outcomes: Record<string, number>;
  resolved: boolean;
  progressed: boolean;
  blocked: boolean;
  blocker: string | null;
  swaps: number;
  skips: number;
  mode: RecoveryMode | null;
  /** Plain-language reason, safe to show the founder. */
  reason: string | null;
}

export interface RecoveryAssessment {
  clusters: TaskCluster[];
  /** Clusters that need a different approach today, most days first. */
  stalled: TaskCluster[];
  top: TaskCluster | null;
}

const SAME_TASK_OVERLAP = 0.7;
export const STALL_AFTER_DAYS = 3;
export const RECONSIDER_AFTER_DAYS = 8;
const RESOLVED = new Set(["completed", "learned"]);
const NO_SIGNAL = new Set(["pending", "ignored", ""]);

function day(iso: string): string { return String(iso ?? "").slice(0, 10); }

/** Groups repeats of the same task, however slightly reworded. Oldest first within a cluster. */
export function clusterShown(rows: ShownTask[]): ShownTask[][] {
  const sorted = rows.filter((r) => r.action && day(r.shownAt)).sort((a, b) => a.shownAt.localeCompare(b.shownAt));
  const clusters: ShownTask[][] = [];
  for (const r of sorted) {
    const key = normalizeActionKey(r.action);
    const hit = clusters.find((c) => normalizeActionKey(c[0].action) === key || overlap(c[0].action, r.action) >= SAME_TASK_OVERLAP);
    if (hit) hit.push(r); else clusters.push([r]);
  }
  return clusters;
}

function decide(c: Omit<TaskCluster, "mode" | "reason">): { mode: RecoveryMode | null; reason: string | null } {
  if (c.resolved) return { mode: null, reason: null };
  // Still moving: partial progress in the last stretch is a legitimate multi-day task.
  if (c.progressed && c.daysShown < RECONSIDER_AFTER_DAYS && !c.blocked) {
    return { mode: "continue", reason: `You made progress on this, so it can continue.` };
  }
  if (c.daysShown < STALL_AFTER_DAYS && !c.blocked && c.swaps < 2) return { mode: null, reason: null };
  if (c.blocked) {
    return { mode: "unblock", reason: c.blocker ? `You said something is in the way: ${c.blocker}. Clear that first.` : `You marked this as blocked. Clear what is in the way first.` };
  }
  if (c.swaps >= 2 || c.skips >= 2) {
    return { mode: "reconsider", reason: `You have swapped or skipped this ${c.swaps + c.skips} times. It may not be the right move for the goal anymore.` };
  }
  if (c.daysShown >= RECONSIDER_AFTER_DAYS) {
    return { mode: "reconsider", reason: `This has been on Today for ${c.daysShown} days without moving. Decide whether it still matters, instead of seeing it again.` };
  }
  if (c.daysShown >= 5) {
    return { mode: "clarify", reason: `This has been on Today for ${c.daysShown} days. The wording may be too vague to start, so it is being made concrete.` };
  }
  return { mode: "shrink", reason: `This has been on Today for ${c.daysShown} days. A smaller first step is being tried.` };
}

export function assessRecovery(rows: ShownTask[]): RecoveryAssessment {
  const clusters: TaskCluster[] = clusterShown(rows).map((rs) => {
    const outcomes: Record<string, number> = {};
    for (const r of rs) { const o = String(r.outcome ?? "pending").toLowerCase(); outcomes[o] = (outcomes[o] ?? 0) + 1; }
    const days = new Set(rs.map((r) => day(r.shownAt)));
    const blockedRow = [...rs].reverse().find((r) => r.blockedAt || r.outcome === "blocked");
    const base = {
      action: rs[rs.length - 1].action,
      key: normalizeActionKey(rs[0].action),
      daysShown: days.size,
      timesShown: rs.length,
      firstShown: rs[0].shownAt,
      lastShown: rs[rs.length - 1].shownAt,
      outcomes,
      resolved: rs.some((r) => RESOLVED.has(String(r.outcome ?? "").toLowerCase())),
      progressed: rs.some((r) => String(r.outcome ?? "").toLowerCase() === "partial"),
      blocked: Boolean(blockedRow),
      blocker: blockedRow?.blockedReason?.trim() || null,
      swaps: rs.filter((r) => r.outcome === "overridden" || r.replacedBy).length,
      skips: rs.filter((r) => r.skippedAt).length,
    };
    return { ...base, ...decide(base) };
  });
  const stalled = clusters.filter((c) => c.mode && c.mode !== "continue").sort((a, b) => b.daysShown - a.daysShown);
  return { clusters, stalled, top: stalled[0] ?? null };
}

/** True when the cluster only sat unanswered (no real signal at all). */
export function isSilent(c: TaskCluster): boolean {
  return Object.keys(c.outcomes).every((o) => NO_SIGNAL.has(o));
}

const MODE_INSTRUCTION: Record<Exclude<RecoveryMode, "continue">, string> = {
  shrink: "Give the SAME goal as a much smaller first step: one concrete action of 15 minutes or less that produces something visible. Do not repeat the original wording.",
  clarify: "The original wording did not get started. Rewrite the same goal so it names exactly who, where and what to produce, with the first physical action stated. Do not repeat the original wording.",
  unblock: "Do not repeat the task. Today's task is to remove the blocker named below, so the original task becomes possible. Keep the original goal.",
  alternative: "Pursue the SAME goal through a different route (a different channel, person or method). Do not repeat the original approach.",
  reconsider: "Do not repeat the task. Today's task is a short decision: does this goal still matter? Keep it (and name the smallest next step), reshape it, or drop it, and write the decision down.",
};

/** Prompt block for the generator. Empty when nothing is stalled. */
export function recoveryPromptBlock(a: RecoveryAssessment): string {
  const t = a.top;
  if (!t || !t.mode || t.mode === "continue") return "";
  const lines = [
    `REPEAT RECOVERY (binding): "${t.action}" has been shown on ${t.daysShown} different days without being completed.`,
    isSilent(t)
      ? "It was never answered. That is NOT evidence the founder rejected or avoids it, so do not blame or lecture. It only means the task as written did not get started."
      : "The founder has given signals about it (swaps, skips or a blocker). Use them.",
    `Approach: ${MODE_INSTRUCTION[t.mode as Exclude<RecoveryMode, "continue">]}`,
    t.blocker ? `Blocker named by the founder: "${t.blocker}"` : "",
    "Keep the underlying goal. Change only the size, clarity, route or decision. Never show the original task again as-is.",
  ];
  return lines.filter(Boolean).join("\n");
}

const RECOVERY_MARKERS = /\b(first|only|just|smallest|instead|unblock|clarify|decide|decision|whether|keep or drop|reshape|drop it|15[\s-]?min|10[\s-]?min|5[\s-]?min|20[\s-]?min)\b|\b(?:\d|1[0-5])\s*(?:min|minutes)\b/i;

/**
 * Guard: a task that restates a stalled one with no change of size, clarity, route or decision.
 * Returns the stalled cluster it repeats, or null.
 */
export function repeatsStalledTask(task: string, stalled: Array<Pick<TaskCluster, "action" | "mode">>): Pick<TaskCluster, "action" | "mode"> | null {
  for (const s of stalled) {
    if (!s.mode || s.mode === "continue") continue;
    if (overlap(task, s.action) < SAME_TASK_OVERLAP) continue;
    if (normalizeActionKey(task) === normalizeActionKey(s.action)) return s;
    // A reworded repeat still passes only if it visibly changes the approach.
    if (s.mode === "reconsider" || s.mode === "alternative") return s;
    if (!RECOVERY_MARKERS.test(task)) return s;
  }
  return null;
}

/** Row shape of reflexion_learning_log used to build history. */
export interface LogRow {
  action_shown?: string | null;
  created_at: string;
  outcome?: string | null;
  blocked_at?: string | null;
  blocked_reason?: string | null;
  skipped_at?: string | null;
  replaced_by?: string | null;
}

export function shownFromLog(rows: LogRow[]): ShownTask[] {
  return rows.filter((r) => r.action_shown).map((r) => ({
    action: String(r.action_shown),
    shownAt: r.created_at,
    outcome: r.outcome ?? null,
    blockedAt: r.blocked_at ?? null,
    blockedReason: r.blocked_reason ?? null,
    skippedAt: r.skipped_at ?? null,
    replacedBy: r.replaced_by ?? null,
  }));
}
