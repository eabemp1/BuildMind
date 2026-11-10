import { describe, it, expect } from "vitest";
import { kindOfTask, assessTaskQuality, missionMeta, namesTargetUser, MISSION_KINDS, planTodayMission } from "@/lib/todayMission";
import { fallbackForKind } from "@/lib/todayFallbacks";

const PERSONAS = [
  { userType: "independent barbers", problemDesc: "missed bookings and no-shows", productName: "CutBook", stage: "Idea" },
  { userType: "freelance designers", problemDesc: "late client payments and invoices", productName: "PayNudge", stage: "MVP" },
  { userType: "farm cooperatives", problemDesc: "no price information", productName: "MarketPrice", stage: "Validation" },
];

describe("the app's own fallback tasks are read back as the kind they were written for", () => {
  for (const kind of MISSION_KINDS) {
    it(kind, () => {
      for (const p of PERSONAS) for (let i = 0; i < 12; i++) {
        const fb = fallbackForKind(kind, p, `seed${i}`);
        expect(kindOfTask(fb.action), fb.action).toBe(kind);
      }
    });
  }
});

describe("every fallback passes the app's own quality gate", () => {
  for (const kind of MISSION_KINDS) {
    it(kind, () => {
      const mission = { ...planTodayMission({ stage: "Idea", recentTasks: [], avoidance: [], blockers: [], activeGoals: [] }), kind, requires: missionMeta(kind).requires };
      for (const p of PERSONAS) for (let i = 0; i < 12; i++) {
        const fb = fallbackForKind(kind, p, `seed${i}`);
        const r = assessTaskQuality({ task: fb.action, done_when: fb.done_when, first_step: fb.first_step, minutes: parseInt(fb.time, 10), platform: fb.platform || "WhatsApp", draft: fb.message, user_type: p.userType }, mission as never, { targetUsers: p.userType, problem: p.problemDesc, title: p.productName, recentTasks: [] });
        expect(r.hardFails, fb.action).toEqual([]);
      }
    });
  }
});

describe("a founder's own problem words do not change what kind of task it is", () => {
  it("pricing or payment problems do not turn an interview into a pricing task", () => {
    expect(kindOfTask("Book or hold 2 twenty-minute conversations with farm cooperatives about the last time no price information cost them time or money.")).toBe("interview");
    expect(kindOfTask("Send 5 WhatsApp messages to freelance designers asking how they chase late invoices.")).toBe("outreach");
  });
});

describe("naming the customer", () => {
  it("any real word of the description counts, not only the first", () => {
    expect(namesTargetUser("Message 5 barbers you know", "independent barbers in Accra")).toBe(true);
    expect(namesTargetUser("Walk into two barbershops", "independent barbers in Accra")).toBe(true);
    expect(namesTargetUser("Message 5 plumbers", "independent barbers in Accra")).toBe(false);
  });
});

describe("hiring someone to do your outreach is rejected", () => {
  it("fails the gate", () => {
    const mission = { ...planTodayMission({ stage: "Idea", recentTasks: [], avoidance: [], blockers: [], activeGoals: [] }), requires: missionMeta("outreach").requires, kind: "outreach" as const };
    const r = assessTaskQuality({ task: "Post a contract sales specialist job on two freelance platforms and receive 5 applications from barbers", done_when: "5 applications received", platform: "Upwork" }, mission, { targetUsers: "barbers", recentTasks: [] });
    expect(r.hardFails).toContain("hands_off_the_work");
  });
});

describe("a drained founder is not given the heaviest kinds", () => {
  it("avoids interview and build for 14 days", () => {
    const seen = new Set<string>();
    for (let d = 0; d < 14; d++) seen.add(planTodayMission({ stage: "Validation", recentTasks: [], avoidance: [], blockers: [], activeGoals: [], cognitiveLoad: "drained", momentum: 50 }).kind);
    expect(seen.has("interview")).toBe(false);
    expect(seen.has("build")).toBe(false);
  });
});
