import { describe, it, expect } from "vitest";
import { kindOfTask, planTodayMission } from "@/lib/todayMission";
import { IMPORTANCE, allowedKinds, applySwap, chooseMode, swapProblems, swapPromptBlock, type SwapRecord } from "@/lib/today/swap";

const mission = (excludeAction?: string) => planTodayMission({ stage: "Validation", recentTasks: [], avoidance: [], blockers: [], activeGoals: [], excludeAction });
const day = 86_400_000;

describe("task swap keeps importance", () => {
  it("shrinks the same kind of work instead of switching", () => {
    const rejected = "Follow up with the 5 founders who replied to your first message";
    const { mission: m, swap } = applySwap(mission(rejected), { rejected, reason: "no_motivation", mode: "shrink" });
    expect(swap?.mode).toBe("shrink");
    expect(m.kind).toBe(kindOfTask(rejected));
    expect(m.minutes).toBeLessThanOrEqual(20);
  });

  it("never swaps to an easy-exit kind", () => {
    const rejected = "Follow up with the 5 founders who replied to your first message";
    for (const reason of ["no_motivation", "too_big", "no_time", "not_relevant"] as const) {
      const { mission: m } = applySwap(mission(rejected), { rejected, reason, mode: "alternative" });
      expect(IMPORTANCE[m.kind]).toBeGreaterThanOrEqual(2);
      expect(m.kind).not.toBe(kindOfTask(rejected));
    }
  });

  it("does not route 'no users' swaps back to people tasks", () => {
    const kinds = allowedKinds("build", { reason: "no_users", mode: "alternative" });
    expect(kinds).not.toContain("interview");
    expect(kinds).not.toContain("outreach");
  });

  it("falls back to shrinking after two alternatives that never got done", () => {
    const now = Date.now();
    const hist: SwapRecord[] = [
      { mode: "alternative", reason: "no_motivation", outcome: null, created_at: new Date(now - 3 * day).toISOString() },
      { mode: "alternative", reason: "no_motivation", outcome: "blocked", created_at: new Date(now - 2 * day).toISOString() },
    ];
    expect(chooseMode("alternative", "no_motivation", hist, now)).toBe("shrink");
    expect(chooseMode("alternative", "no_users", hist, now)).toBe("alternative");
    expect(chooseMode("alternative", "no_motivation", [], now)).toBe("alternative");
  });

  it("rejects easy-exit and repeated replacements", () => {
    const swap = { rejected: "Send 5 pricing emails", reason: "no_motivation" as const, mode: "alternative" as const, fromKind: "pricing" as const };
    expect(swapProblems("Brainstorm new pricing ideas", swap)).toContain("easy_exit");
    expect(swapProblems("Send 5 pricing emails", swap)).toContain("same_as_rejected");
    expect(swapProblems("Message 3 customers on WhatsApp asking what they would pay", swap)).toEqual([]);
  });

  it("states the rules to the generator", () => {
    const { mission: m, swap } = applySwap(mission("Write the launch post"), { rejected: "Write the launch post", reason: "too_big", mode: "shrink" });
    const block = swapPromptBlock(swap, m);
    expect(block).toMatch(/SAME goal/);
    expect(block).toMatch(/15 minutes/);
  });
});

import { buildSwapOptions, shrinkAction } from "@/lib/today/swap";

describe("swap options in the candidate rankings", () => {
  const c = (id: string, action: string, ev = "A concrete result") => ({ id, action, expected_evidence: ev, why_it_beats_alternatives: "x", scores: { total: 60 } });

  it("always offers a smaller version first and never the generic continuation", () => {
    const top = c("evidence_probe", "Message 3 founders on LinkedIn about onboarding");
    const opts = buildSwapOptions(top, [c("continue_best_next_task", "Advance the goal"), c("avoidance_microdose", "Spend 15 minutes on outreach: send 1 message"), c("unstall_goal", "Unstall the goal: finish 1 subtask")]);
    expect(opts[0].swap_mode).toBe("shrink");
    expect(opts[0].action).toContain("first 15 minutes");
    expect(opts.map((o) => o.id)).not.toContain("continue_best_next_task");
    // unstall_goal (importance 2) is below an evidence-producing top task (3)
    expect(opts.map((o) => o.action)).not.toContain("Unstall the goal: finish 1 subtask");
  });

  it("drops candidates with no observable evidence", () => {
    const opts = buildSwapOptions(c("unstall_goal", "Finish the pricing page"), [c("evidence_probe", "Message 3 users", "")]);
    expect(opts.length).toBe(1);
  });

  it("keeps the shrunk text short and bounded", () => {
    expect(shrinkAction("x".repeat(500)).length).toBeLessThan(400);
  });
});
