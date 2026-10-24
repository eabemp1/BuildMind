import { describe, it, expect } from "vitest";
import { assessRecovery, recoveryPromptBlock, repeatsStalledTask, shownFromLog, clusterShown, type ShownTask } from "@/lib/recommendationRecovery";
import { guardRules } from "@/lib/today/rules";
import { assessTaskQuality, planTodayMission } from "@/lib/todayMission";
import { computeRecommendationMetrics } from "@/lib/recommendationMetrics";

const TASK = "Message 3 founders on WhatsApp and ask what they did the last time they lost momentum.";
const rows = (n: number, o: Partial<ShownTask> = {}, task = TASK): ShownTask[] =>
  Array.from({ length: n }, (_, i) => ({ action: task, shownAt: `2026-10-${String(10 + i).padStart(2, "0")}T09:00:00Z`, outcome: "pending", ...o }));

// The scenarios below test the pure rules directly. They use constructed rows, not the model or the database.
describe("recommendation recovery: the 10 scenarios", () => {
  it("1. a task shown once is left alone", () => { expect(assessRecovery(rows(1)).top).toBeNull(); });
  it("2. shown twice is still fine", () => { expect(assessRecovery(rows(2)).top).toBeNull(); });
  it("3. three days with no answer gets a smaller version, and silence is not called rejection", () => {
    const a = assessRecovery(rows(3));
    expect(a.top?.mode).toBe("shrink");
    const block = recoveryPromptBlock(a);
    expect(block).toMatch(/NOT evidence the founder rejected/);
    expect(block).toMatch(/15 minutes or less/);
  });
  it("4. five days gets a clearer rewrite", () => { expect(assessRecovery(rows(5)).top?.mode).toBe("clarify"); });
  it("5. eight days becomes a keep/reshape/drop decision", () => {
    const a = assessRecovery(rows(8));
    expect(a.top?.mode).toBe("reconsider");
    expect(recoveryPromptBlock(a)).toMatch(/does this goal still matter/i);
  });
  it("6. partial progress is a legitimate multi-day task, not a stall", () => {
    const r = rows(5); r[1].outcome = "partial";
    expect(assessRecovery(r).top).toBeNull();
    expect(assessRecovery(r).clusters[0].mode).toBe("continue");
  });
  it("7. a completed task never recovers", () => {
    const r = rows(6); r[5].outcome = "completed";
    expect(assessRecovery(r).clusters[0].mode).toBeNull();
  });
  it("8. a named blocker comes first, even before three days, and the goal is kept", () => {
    const r = rows(2); r[1] = { ...r[1], outcome: "partial", blockedAt: "2026-10-11T10:00:00Z", blockedReason: "I have no list of founders" };
    const a = assessRecovery(r);
    expect(a.top?.mode).toBe("unblock");
    const block = recoveryPromptBlock(a);
    expect(block).toMatch(/no list of founders/);
    expect(block).toMatch(/Keep the underlying goal/);
  });
  it("9. repeated swaps mean reconsider, not shrink", () => {
    const r = rows(3, { outcome: "overridden" });
    expect(assessRecovery(r).top?.mode).toBe("reconsider");
  });
  it("10. a reworded copy of the same task is the same task", () => {
    const r = [...rows(2), ...rows(2, {}, "Message three founders via WhatsApp: ask what they did the last time they lost momentum").map((x, i) => ({ ...x, shownAt: `2026-10-${20 + i}T09:00:00Z` }))];
    expect(clusterShown(r)).toHaveLength(1);
    expect(assessRecovery(r).top?.daysShown).toBe(4);
  });
});

describe("repeat guard", () => {
  const stalled = assessRecovery(rows(3)).stalled;
  it("rejects an unchanged restatement", () => {
    expect(repeatsStalledTask(TASK, stalled)).not.toBeNull();
    expect(guardRules(TASK, undefined, undefined, stalled)).toContain("repeats_stalled_task");
  });
  it("rejects a light reword with no change of approach", () => {
    expect(guardRules("Message three founders on WhatsApp and ask about the last time they lost momentum today.", undefined, undefined, stalled)).toContain("repeats_stalled_task");
  });
  it("allows a genuinely smaller version of the same goal", () => {
    expect(guardRules("In 10 minutes, send just one WhatsApp message to one founder asking what they did the last time they lost momentum.", undefined, undefined, stalled)).not.toContain("repeats_stalled_task");
  });
  it("never blocks a different task", () => {
    expect(guardRules("Write the pricing page headline and publish it on the site.", undefined, undefined, stalled)).toEqual([]);
  });
  it("never blocks a decision task when the mode is reconsider only if it is not a restatement", () => {
    const st = assessRecovery(rows(8)).stalled;
    expect(guardRules(TASK, undefined, undefined, st)).toContain("repeats_stalled_task");
    expect(guardRules("Decide whether reaching founders on WhatsApp is still your channel: keep it, reshape it or drop it, and write down which.", undefined, undefined, st)).not.toContain("repeats_stalled_task");
  });
  it("does nothing when nothing is stalled", () => { expect(guardRules(TASK)).toEqual([]); expect(guardRules(TASK, undefined, undefined, [])).toEqual([]); });
});

describe("integration with the mission planner and quality gate", () => {
  const base = { stage: "Growth", recentTasks: [{ text: TASK, outcome: null }], avoidance: [], blockers: [], activeGoals: [] };
  it("moves the mission toward unblock when a task is being shrunk", () => {
    const plain = planTodayMission(base);
    const rec = planTodayMission({ ...base, recoveryMode: "shrink" });
    expect(rec.scores.unblock).toBeGreaterThan(plain.scores.unblock);
    expect(rec.reasons.join(" ")).toMatch(/smaller and clearer/);
  });
  it("treats a recovery version as allowed and an unchanged repeat as a hard fail", () => {
    const stalled = assessRecovery(rows(3)).stalled;
    const mission = planTodayMission({ ...base, recoveryMode: "shrink" });
    const ctx = { recentTasks: base.recentTasks, stalled };
    const ok = assessTaskQuality({ task: "In 10 minutes, send just one WhatsApp message to one founder asking what they did the last time they lost momentum.", done_when: "The message is sent", first_step: "Open WhatsApp and pick one founder", platform: "WhatsApp", count: 1 }, mission, ctx);
    expect(ok.hardFails).not.toContain("repeat");
    expect(ok.hardFails).not.toContain("repeats_stalled_task");
    const bad = assessTaskQuality({ task: TASK, done_when: "Three messages are sent", first_step: "Open WhatsApp", platform: "WhatsApp", count: 3 }, mission, ctx);
    expect(bad.hardFails).toContain("repeats_stalled_task");
  });
});

describe("shownFromLog and metrics", () => {
  it("reads lifecycle columns from learning-log rows", () => {
    const [r] = shownFromLog([{ action_shown: TASK, created_at: "2026-10-10T00:00:00Z", outcome: "partial", blocked_at: "2026-10-10T01:00:00Z", blocked_reason: "no list" }]);
    expect(r).toMatchObject({ blockedAt: "2026-10-10T01:00:00Z", blockedReason: "no list" });
  });
  it("counts stalled tasks and ignores coach chat, briefings and reports", () => {
    const log = [
      ...rows(9, { outcome: "ignored" }).map((r) => ({ action_shown: r.action, created_at: r.shownAt, outcome: r.outcome, session_id: "today_action:u:" + r.shownAt.slice(0, 10) })),
      { action_shown: "Spend the next two hours debugging the posting flow and test a post.", created_at: "2026-10-12T00:00:00Z", outcome: "ignored", session_id: "morning_briefing:u:2026-10-12", critic_persona: "morning_briefing" },
      { action_shown: "Type \"open execution\" in the AI Coach chat to begin.", created_at: "2026-10-12T00:00:00Z", outcome: "ignored", session_id: "ai_coach:p1", critic_persona: "ai_coach" },
    ];
    const m = computeRecommendationMetrics(log);
    expect(m.shown_rows).toBe(9);
    expect(m.distinct_tasks).toBe(1);
    expect(m.stalled_tasks).toBe(1);
    expect(m.stalled_silent_tasks).toBe(1);
    expect(m.longest_repeat_days).toBe(9);
    expect(m.by_mode.reconsider).toBe(1);
  });
});
