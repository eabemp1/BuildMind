import { describe, it, expect } from "vitest";
import { planTodayMission } from "@/lib/todayMission";
import { deriveFounderState, fitMissionToState, founderStatePromptBlock, isBigDecision, stateNote } from "@/lib/founderState";

const now = Date.parse("2026-10-18T01:00:00Z");
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
const H = 3_600_000;

describe("founder state", () => {
  it("is fresh by default in the morning", () => {
    const s = deriveFounderState({ now, localHour: 9 });
    expect(s.level).toBe("fresh");
    expect(s.holdBigDecisions).toBe(false);
    expect(founderStatePromptBlock(s)).toBe("");
  });

  it("holds big decisions in the middle of the night, even with no other signal", () => {
    const s = deriveFounderState({ now, localHour: 1 });
    expect(["low", "depleted"]).toContain(s.level);
    expect(s.holdBigDecisions).toBe(true);
    expect(stateNote(s)).toMatch(/late/i);
  });

  it("reads tiredness in recent writing and swap reasons", () => {
    const s = deriveFounderState({
      now, localHour: 15,
      texts: [{ text: "I'm so tired and overwhelmed, can't focus", at: iso(2 * H) }],
      swaps: [{ reason: "no_motivation", at: iso(3 * H) }, { reason: "no_time", at: iso(5 * H) }],
      recentOutcomes: ["blocked", "partial", "blocked"],
    });
    expect(["low", "depleted"]).toContain(s.level);
    expect(s.source).toBe("inferred");
  });

  it("a recent self-report wins, and an old one expires", () => {
    const wiped = deriveFounderState({ now, localHour: 10, selfReport: { level: "wiped", at: iso(1 * H) } });
    expect(wiped.level).toBe("depleted");
    expect(wiped.source).toBe("self");
    const stale = deriveFounderState({ now, localHour: 10, selfReport: { level: "wiped", at: iso(30 * H) } });
    expect(stale.level).toBe("fresh");
    const fresh = deriveFounderState({ now, localHour: 15, selfReport: { level: "fresh", at: iso(1 * H) }, texts: [{ text: "tired", at: iso(1 * H) }] });
    expect(["fresh", "steady"]).toContain(fresh.level);
  });

  it("fits the mission to capacity without dropping to busywork", () => {
    const planned = planTodayMission({ stage: "Validation", recentTasks: [], avoidance: [], blockers: [], activeGoals: [] });
    const low = fitMissionToState(planned, deriveFounderState({ now, localHour: 12, selfReport: { level: "low", at: iso(H) } }));
    expect(low.minutes).toBeLessThanOrEqual(25);
    expect(["interview", "build", "pricing", "analyze"]).not.toContain(low.kind);
    expect(["analyze"]).not.toContain(low.kind);
    const fresh = fitMissionToState(planned, deriveFounderState({ now, localHour: 10 }));
    expect(fresh).toBe(planned);
  });

  it("tells the coach to defer a pivot question at night", () => {
    const s = deriveFounderState({ now, localHour: 1 });
    expect(isBigDecision("Should I pivot?")).toBe(true);
    const block = founderStatePromptBlock(s, { message: "Should I pivot, I'm so tired" });
    expect(block).toMatch(/HOLD BIG DECISIONS/);
    expect(block).toMatch(/wrong hour/);
    expect(founderStatePromptBlock(s, { message: "what should I post" })).not.toMatch(/wrong hour/);
  });
});

import { buildFounderIntelligenceState } from "@/lib/founderIntelligence";

describe("founder state in Founder Intelligence", () => {
  const depleted = deriveFounderState({ now, localHour: 2, selfReport: { level: "wiped", at: iso(H) } });
  const base = { userId: "u", now: new Date(now), founderContext: {}, project: { startup_stage: "Validation" }, milestones: [], tasks: [], reflections: [], learningLogs: [], activityEvents: [] };

  it("raises a LOW_CAPACITY signal and stamps the decision with the level", () => {
    const st = buildFounderIntelligenceState({ ...base, founderState: depleted });
    expect(st.signals.some((s) => s.type === "LOW_CAPACITY")).toBe(true);
    expect(st.decision.state_level).toBe("depleted");
    expect(st.capacity?.holdBigDecisions).toBe(true);
  });

  it("does not reuse a decision cached for a rested founder", () => {
    const rested = buildFounderIntelligenceState({ ...base, founderState: deriveFounderState({ now, localHour: 10 }) });
    const day = new Date(now).toISOString().slice(0, 10);
    const reused = buildFounderIntelligenceState({ ...base, founderState: deriveFounderState({ now, localHour: 10 }), cachedDecision: { decision: rested.decision, date: day } });
    expect(reused.decision.top_candidate?.id).toBe(rested.decision.top_candidate?.id);
    const recomputed = buildFounderIntelligenceState({ ...base, founderState: depleted, cachedDecision: { decision: rested.decision, date: day } });
    expect(recomputed.decision.state_level).toBe("depleted");
  });

  it("is a no-op when nothing is known about the founder's state", () => {
    const st = buildFounderIntelligenceState(base);
    expect(st.signals.some((s) => s.type === "LOW_CAPACITY")).toBe(false);
    expect(st.decision.state_level).toBe("fresh");
  });
});
