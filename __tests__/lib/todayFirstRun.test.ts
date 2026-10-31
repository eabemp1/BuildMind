import { describe, it, expect } from "vitest";
import { buildLedger } from "@/lib/today/facts";
import { firstRunTask, isFirstRun } from "@/lib/todayFirstRun";
import { guardRules } from "@/lib/today/rules";

const input = { userType: "founders", problemDesc: "validating ideas", productName: "Nevrix", stage: "MVP" };
const PLACEHOLDER_RE = /\[[A-Za-z][^\]]{0,40}\]|\{\{?[a-z_ ]+\}?\}/;
const STAGES = ["Idea", "Validation", "MVP", "Launch", "Growth", "Revenue"];

describe("first run", () => {
  it("applies until something is finished or three tasks have been shown", () => {
    expect(isFirstRun([])).toBe(true);
    expect(isFirstRun([{ text: "a", outcome: "pending" }, { text: "b", outcome: "blocked" }])).toBe(true);
    expect(isFirstRun([{ text: "a", outcome: "completed" }])).toBe(false);
    expect(isFirstRun([{ text: "a", outcome: "learned" }])).toBe(false);
    expect(isFirstRun([{ text: "a", outcome: null }, { text: "b", outcome: null }, { text: "c", outcome: null }])).toBe(false);
  });
});

describe("curated first tasks", () => {
  const ledger = buildLedger([], { now: Date.parse("2026-10-30T20:00:00Z"), knownContacts: 0 });

  it("every stage has a task that is concrete, placeholder-free and needs no email address", () => {
    for (const stage of STAGES) {
      const t = firstRunTask(stage, { ...input, stage }, "u:2026-10-30");
      expect(t, stage).not.toBeNull();
      const text = `${t!.action} ${t!.first_step} ${t!.message}`;
      expect(PLACEHOLDER_RE.test(text), stage).toBe(false);
      expect(t!.action.length, stage).toBeGreaterThan(25);
      expect(t!.done_when.length, stage).toBeGreaterThan(8);
      expect(t!.first_step.length, stage).toBeGreaterThan(8);
      expect(/\bemail\b/i.test(t!.action), stage).toBe(false);
    }
  });

  it("an MVP founder with no users is asked to put the product in front of someone, not to interview strangers", () => {
    const t = firstRunTask("MVP", input, "u:2026-10-30", ledger)!;
    expect(/private window|try/i.test(t.action)).toBe(true);
    expect(/email|interview/i.test(t.action)).toBe(false);
  });

  it("passes the same guard every generated task must pass, for a founder with no users", () => {
    for (const stage of STAGES.filter((s) => s !== "Growth" && s !== "Revenue")) {
      const t = firstRunTask(stage, { ...input, stage }, "u:2026-10-30", ledger);
      if (t) expect(guardRules(`${t.action} ${t.first_step}`, ledger, t.message)).toEqual([]);
    }
  });

  it("a Growth founder who has said they have no users gets Launch tasks, never ones that assume users", () => {
    const g = firstRunTask("Growth", { ...input, stage: "Growth" }, "u:2026-10-30", ledger)!;
    expect(g).not.toBeNull();
    expect(/last 5 users|most recent person who used/i.test(g.action)).toBe(false);
    expect(guardRules(`${g.action} ${g.first_step}`, ledger, g.message)).toEqual([]);
  });

  it("Replace never returns the task just replaced", () => {
    const first = firstRunTask("MVP", input, "u:2026-10-30")!;
    const next = firstRunTask("MVP", input, "u:2026-10-30", undefined, first.action);
    expect(next === null || next.action !== first.action).toBe(true);
  });
});
