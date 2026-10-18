/**
 * lib/today/swap.ts — importance-preserving task swaps.
 *
 * When a founder doesn't want today's task, the answer is never "something
 * easier". The swap must keep what the task was for, stay at least as
 * important, get smaller instead of softer, and still produce something
 * observable. All of that is decided here, deterministically; the model only
 * writes the wording inside the box this module draws.
 *
 *   shrink:      same kind of work, same goal, a 15–20 minute first slice
 *   alternative: a different task of equal or higher importance that also
 *                produces evidence (a person reached, a price shown, a thing live)
 */

import { MISSION_KINDS, kindOfTask, missionMeta, type Mission, type MissionKind } from "@/lib/todayMission";

export type SwapReason = "no_motivation" | "too_big" | "no_time" | "no_users" | "no_access" | "already_done" | "not_relevant";
export type SwapMode = "shrink" | "alternative";

export interface SwapRequest {
  rejected: string;
  reason: SwapReason | null;
  mode: SwapMode;
}

export interface SwapRecord {
  mode: SwapMode;
  reason: string | null;
  /** completed | partial | blocked | learned | null while still open. */
  outcome: string | null;
  created_at: string;
}

/** 3 = puts the startup in front of reality; 2 = visible progress; 1 = easy exit. */
export const IMPORTANCE: Record<MissionKind, 1 | 2 | 3> = {
  interview: 3, outreach: 3, follow_up: 3, pricing: 3,
  publish: 2, build: 2, unblock: 2,
  analyze: 1, reset: 1,
};

const FLOOR = 2;
const SHRINK_MINUTES: Partial<Record<SwapReason, number>> = { no_motivation: 20, no_time: 15, too_big: 15 };

export function isSwapReason(v: unknown): v is SwapReason {
  return ["no_motivation", "too_big", "no_time", "no_users", "no_access", "already_done", "not_relevant"].includes(String(v));
}
export function isSwapMode(v: unknown): v is SwapMode { return v === "shrink" || v === "alternative"; }

/** Reasons where a smaller version is the honest fix. Others need a different task. */
export function shrinkFits(reason: SwapReason | null): boolean {
  return reason === null || reason === "no_motivation" || reason === "too_big" || reason === "no_time";
}

const DONE = new Set(["completed", "learned"]);

/**
 * Two alternatives in a row that never got done means switching isn't
 * helping; the next swap shrinks the same task instead.
 */
export function chooseMode(requested: SwapMode, reason: SwapReason | null, history: SwapRecord[], now = Date.now()): SwapMode {
  if (!shrinkFits(reason)) return "alternative";
  if (requested === "shrink") return "shrink";
  const week = 7 * 86_400_000;
  const recentAlt = history
    .filter((h) => h.mode === "alternative" && now - Date.parse(h.created_at) < week)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, 2);
  const failed = recentAlt.length === 2 && recentAlt.every((h) => !DONE.has(h.outcome ?? "") && now - Date.parse(h.created_at) > 36 * 3_600_000);
  return failed ? "shrink" : "alternative";
}

const NEEDS_PEOPLE: MissionKind[] = ["interview", "outreach", "follow_up"];

/** Which kinds a replacement may be, given what was rejected and why. */
export function allowedKinds(rejectedKind: MissionKind | null, req: Pick<SwapRequest, "reason" | "mode">): MissionKind[] {
  const rejectedImportance = rejectedKind ? IMPORTANCE[rejectedKind] : FLOOR;
  const target = Math.max(FLOOR, rejectedImportance);
  if (req.mode === "shrink" && rejectedKind && IMPORTANCE[rejectedKind] >= FLOOR) return [rejectedKind];
  let kinds = MISSION_KINDS.filter((k) => IMPORTANCE[k] >= target && k !== rejectedKind);
  if (req.reason === "no_users" || req.reason === "no_access") kinds = kinds.filter((k) => !NEEDS_PEOPLE.includes(k));
  if (kinds.length === 0) kinds = MISSION_KINDS.filter((k) => IMPORTANCE[k] >= FLOOR && k !== rejectedKind);
  return kinds;
}

/** Re-plan the mission inside the swap rules. Same Mission shape, so everything downstream follows it. */
export function applySwap(mission: Mission, req: SwapRequest | null | undefined, history: SwapRecord[] = [], now = Date.now()): { mission: Mission; swap: (SwapRequest & { fromKind: MissionKind | null; changed: boolean }) | null } {
  if (!req || !req.rejected.trim()) return { mission, swap: null };
  const mode = chooseMode(req.mode, req.reason, history, now);
  const fromKind = kindOfTask(req.rejected);
  const allowed = allowedKinds(fromKind, { reason: req.reason, mode });

  let kind = mission.kind;
  if (!allowed.includes(kind)) {
    kind = [...allowed].sort((a, b) => (mission.scores[b] - mission.scores[a]) || (IMPORTANCE[b] - IMPORTANCE[a]))[0] ?? mission.kind;
  }
  const meta = missionMeta(kind);
  const cap = mode === "shrink" ? (req.reason ? SHRINK_MINUTES[req.reason] : undefined) ?? 20 : undefined;
  const minutes = cap ? Math.min(cap, meta.minutes) : Math.min(mission.minutes, meta.minutes);

  const why = mode === "shrink"
    ? `You didn't want the full task, so this is the same kind of work cut to ${minutes} minutes.`
    : `You swapped the last task, so this is a different task that matters just as much (${meta.label.toLowerCase()}).`;
  const next: Mission = {
    ...mission,
    kind,
    minutes,
    label: meta.label,
    requires: meta.requires,
    shape: meta.shape("their target users"),
    reasons: [why, ...mission.reasons.filter((r) => !/just rejected/i.test(r))].slice(0, 4),
  };
  return { mission: next, swap: { ...req, mode, fromKind, changed: true } };
}

/** Hard constraints for the generator. Appended to the mission block. */
export function swapPromptBlock(swap: (SwapRequest & { fromKind: MissionKind | null }) | null | undefined, mission: Pick<Mission, "minutes" | "label">): string {
  if (!swap) return "";
  const why = swap.reason ? ({
    no_motivation: "they don't feel like doing it",
    too_big: "it felt too big",
    no_time: "they don't have the time",
    no_users: "they have no users to reach yet",
    no_access: "they have no access to what it needs",
    already_done: "they already did it",
    not_relevant: "it isn't relevant to them",
  } as Record<SwapReason, string>)[swap.reason] : "they asked for a replacement";
  const lines = [
    `TASK SWAP (hard rules). The founder rejected: "${swap.rejected.slice(0, 300)}" because ${why}.`,
    "A swap keeps the importance of the work. It must NOT be easier busywork.",
  ];
  if (swap.mode === "shrink") {
    lines.push(
      `- Keep the SAME goal and the SAME kind of work as the rejected task, but cut it to a first slice that fits in ${mission.minutes} minutes or less.`,
      "- Make the slice small enough to start in one minute and still leave something observable: a message sent, a call booked, a thing live, a number written down.",
      "- Do not change the subject. Do not make it planning, research, tidying or tool setup.",
    );
  } else {
    lines.push(
      "- Pick a DIFFERENT task that advances the same goal or the most critical open startup priority.",
      "- It must be at least as important as the rejected task and produce evidence: customer learning, a concrete result or a public/visible output.",
      `- Keep it small: ${mission.minutes} minutes or less. Smaller is fine; softer is not.`,
      "- Forbidden: planning, brainstorming, research with no output, branding/polish, reading, tool setup, reorganising notes.",
    );
  }
  return lines.join("\n");
}

const EASY_EXIT_RE = /\b(brainstorm|plan(?:ning)?\s+(?:out|the|your)|organi[sz]e|tidy|clean\s*up|reorgani[sz]e|polish|redesign|logo|brand(?:ing)?|color\s+palette|read\s+(?:about|up)|watch\s+(?:a\s+)?(?:video|tutorial)|set\s*up\s+(?:your\s+)?(?:tool|notion|trello|workspace)|research\s+(?:competitors|the market|tools))\b/i;

/** Final check on the generated swap task. */
export function swapProblems(task: string, swap: (SwapRequest & { fromKind: MissionKind | null }) | null | undefined): string[] {
  if (!swap) return [];
  const problems: string[] = [];
  const t = (task ?? "").trim();
  if (!t) return ["empty"];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (norm(t) === norm(swap.rejected)) problems.push("same_as_rejected");
  if (EASY_EXIT_RE.test(t)) problems.push("easy_exit");
  const k = kindOfTask(t);
  if (k && IMPORTANCE[k] < FLOOR) problems.push("low_importance");
  if (swap.fromKind && k && IMPORTANCE[k] < IMPORTANCE[swap.fromKind] && IMPORTANCE[k] < 3 && IMPORTANCE[swap.fromKind] === 3) problems.push("less_important");
  return problems;
}

/** One line on what a swap history says, for the generator and the Mirror. */
export function swapHistoryNote(history: SwapRecord[], now = Date.now()): string {
  const week = history.filter((h) => now - Date.parse(h.created_at) < 14 * 86_400_000);
  if (week.length < 2) return "";
  const resolved = week.filter((h) => h.outcome);
  const done = resolved.filter((h) => DONE.has(h.outcome ?? "")).length;
  const motiv = week.filter((h) => h.reason === "no_motivation").length;
  const parts = [`SWAP HISTORY (14 days): ${week.length} swaps${motiv ? `, ${motiv} because of motivation` : ""}; ${done} of ${resolved.length} replacements completed.`];
  if (resolved.length >= 2 && done / resolved.length < 0.5) parts.push("Replacements are mostly not getting done: make them smaller, not different.");
  return parts.join(" ");
}

// ── "Not feeling it? Swap in" — the deterministic candidate rankings ────────

/** How much each decision-layer candidate matters. The generic continuation is an easy exit. */
export const CANDIDATE_IMPORTANCE: Record<string, 1 | 2 | 3> = {
  evidence_probe: 3,
  avoidance_microdose: 3,
  unstall_goal: 2,
  continue_best_next_task: 1,
};

export interface SwapCandidate {
  id: string;
  action: string;
  rationale?: string;
  expected_evidence: string;
  supporting_signals?: string[];
  scores?: { total: number };
  why_it_beats_alternatives: string;
}

export interface SwapOption extends SwapCandidate {
  swap_mode: SwapMode;
  swap_label: string;
  minutes?: number;
}

const LABELS: Record<string, string> = {
  evidence_probe: "Learn from a real person",
  avoidance_microdose: "Same goal, 15-minute version",
  unstall_goal: "Finish one concrete piece",
};

/** A first slice of today's own task: same goal, same kind of work, observable result. */
export function shrinkAction(action: string): string {
  const a = (action ?? "").replace(/\s+/g, " ").trim().replace(/[.!\s]+$/, "");
  const short = a.length > 220 ? `${a.slice(0, 217).trimEnd()}...` : a;
  return `Do only the first 15 minutes of this: ${short}. Stop at the first observable result (one message sent, one section live, one number written down).`;
}

/**
 * What the founder may swap to. Same goal or a critical priority, at least as
 * important as today's task, producing evidence. A smaller version of today's
 * task always comes first; the generic "continue" candidate never appears.
 */
export function buildSwapOptions(top: SwapCandidate | null | undefined, candidates: SwapCandidate[], max = 3): SwapOption[] {
  if (!top?.action) return [];
  const topImportance = CANDIDATE_IMPORTANCE[top.id] ?? 2;
  const options: SwapOption[] = [{
    ...top,
    action: shrinkAction(top.action),
    swap_mode: "shrink",
    swap_label: "Same task, smaller",
    minutes: 15,
    why_it_beats_alternatives: "Same goal and same kind of work, cut to a first slice you can start in a minute.",
    scores: undefined,
  }];
  const floor = Math.max(2, topImportance);
  const seen = new Set<string>([top.id]);
  for (const c of candidates) {
    if (!c?.action || seen.has(c.id)) continue;
    seen.add(c.id);
    if ((CANDIDATE_IMPORTANCE[c.id] ?? 2) < floor) continue;
    if (!c.expected_evidence?.trim()) continue;
    if (EASY_EXIT_RE.test(c.action)) continue;
    options.push({ ...c, swap_mode: "alternative", swap_label: LABELS[c.id] ?? "Equally important" });
  }
  return options.slice(0, max);
}
