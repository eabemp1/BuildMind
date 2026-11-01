/**
 * The founder harness. Runs every test founder through the same code real accounts go through, offline, and checks
 * the things that have actually gone wrong: wrong stage, tasks that assume users or built parts the founder never
 * mentioned, two channels in one task, template leaks and platform debugging. No AI calls are made.
 */
import { describe, it, expect } from "vitest";
import { FOUNDERS, type TestFounder } from "./profiles";
import { planTodayMission } from "@/lib/todayMission";
import { buildLedger } from "@/lib/today/facts";
import { firstRunTask } from "@/lib/todayFirstRun";
import { guardRules } from "@/lib/today/rules";
import { ALLOWED_PLATFORMS, composeConcreteTask } from "@/lib/today/compose";
import { namedPlatform } from "@/lib/today/platformInText";

const ledgerOf = (f: TestFounder) =>
  buildLedger(f.said.map((t, i) => ({ created_at: new Date(Date.now() - i * 1000).toISOString(), outcome: "blocked", note: t })));
const input = (f: TestFounder) => ({ userType: f.userType, problemDesc: f.problem, productName: f.product, stage: f.stage });
const BUILD_WORDS = /\b(?:build|create|implement|code|develop|design)\s+(?:a|an|the|your)?\s*(?:simple\s+)?(?:page|dashboard|feature|ui|screen|app|api|endpoint|component)\b/i;
const ASSUMES_USERS = /\b(?:your|the)\s+(?:last\s+\d+\s+|first\s+\d+\s+|existing\s+|current\s+)?(?:users|customers|subscribers)\b|\bpaying\s+customers\b/i;
const NAMES_OF_CHANNELS = (t: string) => ALLOWED_PLATFORMS.filter((p) => namedPlatform(t, [p]) === p);

describe("test founders: the first task", () => {
  for (const f of FOUNDERS) {
    it(`${f.id}: first task is safe and grounded`, () => {
      const ledger = ledgerOf(f);
      const t = firstRunTask(f.stage, input(f), f.id, ledger);
      expect(t, "a curated first task must exist").not.toBeNull();
      const text = `${t!.action} ${t!.first_step} ${t!.message}`;
      expect(guardRules(text, ledger, t!.message)).toEqual([]);
      expect(text).not.toMatch(BUILD_WORDS);
      expect(text).not.toMatch(/undefined|\bnull\b|\[object/i);
      if (ledger.facts.some((x) => x.kind === "no_users")) expect(text, "assumes users the founder said they lack").not.toMatch(ASSUMES_USERS);
      expect(NAMES_OF_CHANNELS(t!.action).length, "more than one channel in one task").toBeLessThanOrEqual(1);
      expect(t!.done_when.length).toBeGreaterThan(5);
    });
  }
});

describe("test founders: the planner", () => {
  for (const f of FOUNDERS) {
    it(`${f.id}: picks a mission that fits what they said`, () => {
      const ledger = ledgerOf(f);
      const noUsers = ledger.facts.some((x) => x.kind === "no_users");
      const m = planTodayMission({ stage: f.stage, recentTasks: f.recent, avoidance: [], blockers: [], activeGoals: [], noUsers });
      expect(m.kind).toBeTruthy();
      if (noUsers) expect(["follow_up", "pricing"], "no users, yet planned a task that needs users").not.toContain(m.kind);
      for (const bad of f.neverFirst ?? []) {
        if (bad !== "build") expect(m.label.toLowerCase() + m.reasons.join(" ").toLowerCase()).not.toContain(bad);
      }
    });
  }
});

describe("what founders said is understood", () => {
  it("'nobody uses it yet' counts as no users", () => {
    expect(ledgerOf(FOUNDERS.find((f) => f.id === "revenue-says-no-users")!).facts.some((x) => x.kind === "no_users")).toBe(true);
  });
});

describe("a task never gets a second channel", () => {
  const outreach = { requires: { platform: true, number: true, userType: true, draft: true } } as never;
  const cases: Array<[string, string | undefined, string]> = [
    ["Send direct messages to 3 founders on Twitter asking how they handled it", "WhatsApp", "Twitter"],
    ["Send direct messages to 3 founders on Twitter asking how they handled it", undefined, "Twitter"],
    ["Message 3 people on Discord about the problem", "WhatsApp", "Discord"],
    ["Email 3 founders and ask how they handled it", "LinkedIn", "email"],
  ];
  for (const [task, platform, expected] of cases) {
    it(`${expected}: "${task.slice(0, 40)}…" with platform field ${platform ?? "missing"}`, () => {
      const r = composeConcreteTask({ task, platform, rationale: "x", count: 3 }, outreach);
      expect(r.task).not.toMatch(/— on /);
      expect(r.task).toBe(task);
    });
  }
  it("adds a channel only when the sentence names none", () => {
    const r = composeConcreteTask({ task: "Ask 3 founders how they handled it", platform: "LinkedIn", rationale: "x", count: 3 }, outreach);
    expect(r.task).toContain("on LinkedIn");
    const d = composeConcreteTask({ task: "Ask 3 founders how they handled it", rationale: "x", count: 3 }, outreach);
    expect(d.task).toContain("on WhatsApp");
  });
});

describe("known bad AI tasks are caught", () => {
  const bad: Array<[string, string]> = [
    ["debug the Discord verification issue that is not working", "platform_debugging"],
    ["Find communities where your users hang out", "open_ended_search"],
    ["Message your target audience: not specified yet", "template_leak"],
  ];
  for (const [task, rule] of bad) it(`${rule}: ${task}`, () => expect(guardRules(task)).toContain(rule));
});

describe("a founder who says it is built is not planned a build task", () => {
  it("Nevrix: build loses to people tasks once the founder says it is built", () => {
    const base = { stage: "MVP", recentTasks: [{ text: "Ask one person to try it", outcome: "completed" as const }], avoidance: [], blockers: [], activeGoals: [], noUsers: true };
    const without = planTodayMission(base as never);
    const withClaim = planTodayMission({ ...base, saysBuilt: true } as never);
    expect(withClaim.scores.build).toBeLessThan(without.scores.build);
    expect(withClaim.kind).not.toBe("build");
  });
});
