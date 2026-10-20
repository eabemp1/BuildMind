import type { Mission } from "@/lib/todayMission";

export type FounderState = {
  level: "fresh" | "low" | "depleted";
  confidence: number;
  source: "self" | "time";
  reasons: string[];
  effortCap: number;
  holdBigDecisions: boolean;
  maxMinutes: number;
};

export function buildFounderState(input: { cognitiveLoad?: unknown; clientHour?: number | null }): FounderState | null {
  if (input.cognitiveLoad === "autopilot") {
    return { level: "depleted", confidence: 0.9, source: "self", reasons: ["Founder reported autopilot-level cognitive load."], effortCap: 1, holdBigDecisions: true, maxMinutes: 15 };
  }
  if (input.cognitiveLoad === "drained" || input.cognitiveLoad === "low") {
    return { level: "low", confidence: 0.85, source: "self", reasons: ["Founder reported low or drained energy."], effortCap: 2, holdBigDecisions: true, maxMinutes: 25 };
  }
  if (typeof input.clientHour === "number" && (input.clientHour >= 23 || input.clientHour < 5)) {
    return { level: "low", confidence: 0.45, source: "time", reasons: ["It is late in the founder's local day."], effortCap: 2, holdBigDecisions: true, maxMinutes: 25 };
  }
  if (input.cognitiveLoad === "fresh" || input.cognitiveLoad === "normal" || input.cognitiveLoad === "high") {
    return { level: "fresh", confidence: 0.8, source: "self", reasons: [], effortCap: 5, holdBigDecisions: false, maxMinutes: 90 };
  }
  return null;
}

export function stateNote(state: FounderState | null | undefined): string | null {
  if (!state || state.level === "fresh") return null;
  return state.level === "depleted"
    ? "Capacity is very low. Keep the important task to one small, finishable step and hold major decisions."
    : "Capacity is low. Keep the important task small and hold major decisions until rested.";
}

/** Shrinks duration while preserving the mission's kind and objective. */
export function fitMissionToState(mission: Mission, state: FounderState | null | undefined): Mission {
  if (!state || state.level === "fresh") return mission;
  const minutes = Math.min(mission.minutes, state.maxMinutes);
  if (minutes === mission.minutes) return mission;
  return {
    ...mission,
    minutes,
    reasons: [...mission.reasons, stateNote(state) ?? "Keep this task within current capacity."],
  };
}
