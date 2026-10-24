/**
 * lib/founderState.ts — how the founder is doing RIGHT NOW.
 *
 * A founder's capacity changes through the day. A task chosen for a rested
 * founder at 9am is the wrong task at 1am, and a pivot decided at 1am is
 * usually the wrong decision. This module turns what BuildMind already knows
 * (a one-tap self-report, the hour, how they have been writing, what they
 * have been swapping out, how much they did today) into one state that every
 * decision surface reads: task choice, Founder Intelligence ranking, the coach.
 *
 * Importance never drops with capacity. A tired founder gets a SMALLER slice of
 * important work and a hold on irreversible decisions, not busywork.
 *
 * Pure and deterministic: no I/O, no model calls.
 */

import { MISSION_KINDS, missionMeta, type Mission, type MissionKind } from "@/lib/todayMission";

export type StateLevel = "fresh" | "steady" | "low" | "depleted";
export type EnergyChoice = "fresh" | "ok" | "low" | "wiped";

export interface SelfReport { level: EnergyChoice; at: string }
export interface StateText { text: string; at: string }
export interface StateSwap { reason: string | null; at: string }

export interface StateInput {
  now?: number;
  /** Founder's local hour 0-23, when known. */
  localHour?: number | null;
  selfReport?: SelfReport | null;
  /** Reflections, close-outs and coach messages from the last ~3 days. */
  texts?: StateText[];
  swaps?: StateSwap[];
  /** Outcomes of the last few reflections, newest first. */
  recentOutcomes?: string[];
  completedToday?: number;
}

export interface FounderState {
  level: StateLevel;
  /** Fatigue 0-100 (higher is more tired). */
  score: number;
  /** Legacy vocabulary used by the reflexion/mission planner. */
  load: "fresh" | "drained" | "autopilot";
  source: "self" | "inferred" | "mixed";
  confidence: number;
  reasons: string[];
  lateNight: boolean;
  /** Irreversible or strategic decisions should wait. */
  holdBigDecisions: boolean;
  maxMinutes: number;
  /** Highest effort tier of task this founder should be given (1 light, 3 heavy). */
  effortCap: 1 | 2 | 3;
}

const HOUR = 3_600_000;

const TIRED_RE = /\b(tired|exhaust(?:ed|ing)|burn(?:ed|t)?[\s-]?out|drained|wiped|no energy|can'?t (?:think|focus|sleep)|overwhelm(?:ed|ing)|stress(?:ed|ful)|sleep[\s-]deprived|barely slept|didn'?t sleep|running on fumes|fed up|so done|hopeless|pointless|giv(?:e|ing) up)\b/i;

const LEVEL_FROM_SCORE = (s: number): StateLevel => (s < 25 ? "fresh" : s < 50 ? "steady" : s < 75 ? "low" : "depleted");

export function isLateNight(hour: number | null | undefined): boolean {
  if (hour == null) return false;
  return hour >= 23 || hour <= 4;
}

function decay(ageMs: number): number {
  if (ageMs < 0) return 1;
  if (ageMs <= 12 * HOUR) return 1;
  if (ageMs <= 48 * HOUR) return 0.5;
  if (ageMs <= 72 * HOUR) return 0.25;
  return 0;
}

export function deriveFounderState(input: StateInput = {}): FounderState {
  const now = input.now ?? Date.now();
  const reasons: string[] = [];
  let score = 10;
  let inferredSignals = 0;

  const hour = input.localHour ?? null;
  const late = isLateNight(hour);
  if (hour != null) {
    if (hour >= 0 && hour <= 4) { score += 45; inferredSignals++; reasons.push("It's the middle of the night where you are."); }
    else if (hour === 23) { score += 30; inferredSignals++; reasons.push("It's very late."); }
    else if (hour === 22) { score += 12; inferredSignals++; }
  }

  let tiredHits = 0;
  for (const t of input.texts ?? []) {
    const at = Date.parse(t.at);
    if (!Number.isFinite(at) || !TIRED_RE.test(t.text ?? "")) continue;
    const w = decay(now - at);
    if (w > 0) tiredHits += w;
  }
  if (tiredHits > 0) {
    score += Math.min(40, Math.round(tiredHits * 16));
    inferredSignals++;
    reasons.push("Recent writing mentions being tired or overwhelmed.");
  }

  const friction = (input.swaps ?? []).filter((s) => {
    const at = Date.parse(s.at);
    return Number.isFinite(at) && now - at <= 24 * HOUR && ["no_motivation", "no_time", "too_big"].includes(String(s.reason));
  }).length;
  if (friction > 0) {
    score += Math.min(25, friction * 10);
    inferredSignals++;
    reasons.push(`You swapped ${friction === 1 ? "a task" : `${friction} tasks`} out in the last day because of energy or time.`);
  }

  const outs = (input.recentOutcomes ?? []).slice(0, 3);
  if (outs.length === 3 && outs.every((o) => o === "blocked" || o === "partial")) {
    score += 12;
    inferredSignals++;
    reasons.push("The last three tasks weren't finished.");
  }

  const done = input.completedToday ?? 0;
  if (done >= 5) { score += 20; inferredSignals++; reasons.push("You've already finished a lot today."); }
  else if (done >= 3) { score += 10; inferredSignals++; reasons.push("You've already finished several tasks today."); }

  // Self-report is the strongest signal, but it expires.
  let source: FounderState["source"] = "inferred";
  const sr = input.selfReport;
  const srAge = sr ? now - Date.parse(sr.at) : Infinity;
  if (sr && Number.isFinite(srAge) && srAge >= 0 && srAge <= 14 * HOUR) {
    const fresh = srAge <= 6 * HOUR;
    const base = { fresh: 12, ok: 32, low: 62, wiped: 88 }[sr.level];
    if (fresh) {
      score = sr.level === "fresh" ? Math.min(score, 24) : sr.level === "ok" ? Math.max(Math.min(score, 45), 28) : Math.max(score, base);
      source = inferredSignals > 0 ? "mixed" : "self";
      reasons.unshift(`You said you're ${sr.level === "wiped" ? "wiped" : sr.level === "ok" ? "okay" : sr.level}.`);
    } else if (sr.level === "low" || sr.level === "wiped") {
      score = Math.max(score, Math.round((score + base) / 2));
      source = "mixed";
      reasons.unshift("You said earlier you were low.");
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const level = LEVEL_FROM_SCORE(score);
  const confidence = source === "self" ? 0.9 : source === "mixed" ? 0.8 : Math.min(0.7, 0.25 + inferredSignals * 0.15);
  const hold = level === "depleted" || (hour != null && hour >= 0 && hour <= 4) || (late && level !== "fresh");

  return {
    level,
    score,
    load: level === "fresh" || level === "steady" ? "fresh" : level === "low" ? "autopilot" : "drained",
    source,
    confidence: Math.round(confidence * 100) / 100,
    reasons: reasons.slice(0, 4),
    lateNight: late,
    holdBigDecisions: hold,
    maxMinutes: { fresh: 60, steady: 45, low: 25, depleted: 15 }[level],
    effortCap: level === "fresh" || level === "steady" ? 3 : level === "low" ? 2 : 1,
  };
}

/** How hard each kind of mission is to do while tired (decisions and long live conversations are heavy). */
export const EFFORT: Record<MissionKind, 1 | 2 | 3> = {
  reset: 1, follow_up: 1,
  outreach: 2, publish: 2, unblock: 2,
  interview: 3, build: 3, pricing: 3, analyze: 3,
};

const IMPORTANT: MissionKind[] = ["follow_up", "outreach", "interview", "pricing", "publish", "build", "unblock"];

/**
 * Re-fit a planned mission to the founder's capacity. Lighter kind and shorter
 * time box, never a drop in importance unless the founder is depleted (then a
 * small finished win is the right move).
 */
export function fitMissionToState(mission: Mission, state: FounderState | null | undefined): Mission {
  if (!state || state.level === "fresh" || state.level === "steady") return mission;
  let kind = mission.kind;
  if (EFFORT[kind] > state.effortCap) {
    const pool = MISSION_KINDS.filter((k) => EFFORT[k] <= state.effortCap && (state.level === "depleted" || IMPORTANT.includes(k)));
    kind = [...pool].sort((a, b) => (mission.scores[b] - mission.scores[a]))[0] ?? mission.kind;
  }
  const meta = missionMeta(kind);
  const minutes = Math.min(state.maxMinutes, kind === mission.kind ? mission.minutes : meta.minutes);
  const why = state.level === "depleted"
    ? "You're running on empty, so this is one small finished thing, not a smaller priority."
    : "Your energy is low, so this is a lighter slice of work that still matters.";
  return {
    ...mission, kind, minutes, label: meta.label, requires: meta.requires, shape: meta.shape("their target users"),
    reasons: [why, ...mission.reasons].slice(0, 4),
  };
}

const BIG_DECISION_RE = /\b(pivot|quit|give up|giving up|shut (?:it )?down|abandon|start over|scrap|kill (?:the|my) (?:project|startup|idea)|change (?:my )?(?:idea|niche|pricing|price|target|direction)|rewrite (?:the|my) (?:app|product|whole)|is it worth|should i (?:stop|continue|keep going))\b/i;

export function isBigDecision(text: string | null | undefined): boolean {
  return BIG_DECISION_RE.test(text ?? "");
}

/** Prompt block shared by Today generation, Founder Intelligence and the coach. */
export function founderStatePromptBlock(state: FounderState | null | undefined, opts: { message?: string } = {}): string {
  if (!state || (state.level === "fresh" && !state.holdBigDecisions)) return "";
  const lines = [
    `FOUNDER STATE RIGHT NOW: ${state.level.toUpperCase()} (${state.source}, confidence ${Math.round(state.confidence * 100)}%).`,
    ...state.reasons.map((r) => `- ${r}`),
  ];
  if (state.level === "low" || state.level === "depleted") {
    lines.push(
      `- Cap the task at ${state.maxMinutes} minutes with the first step named. Keep it important; make it smaller, not softer.`,
      "- Choose work that is easy to start and easy to finish. No open-ended thinking, no choosing between options.",
    );
  }
  if (state.holdBigDecisions) {
    lines.push(
      "- HOLD BIG DECISIONS: do not assign or recommend anything hard to undo (pivot, pricing change, quitting, shutting down, rewriting, changing the target user). Assign a reversible small action instead.",
    );
    if (opts.message && isBigDecision(opts.message)) {
      lines.push(
        "- The founder is asking about a big decision right now. Say plainly that this is the wrong hour to decide it, name when to revisit (after real sleep, with fresh data), give ONE reversible thing to do instead, and do not give a verdict on the decision itself.",
      );
    }
  }
  return lines.join("\n");
}

/** One line for the UI. */
export function stateNote(state: FounderState | null | undefined): string | null {
  if (!state) return null;
  if (state.lateNight && state.level !== "fresh") return "It's late. Big decisions can wait until morning.";
  if (state.level === "depleted") return "You're running on empty. One small finished thing is enough today.";
  if (state.level === "low") return "Energy is low. Keep today's task small.";
  return null;
}
