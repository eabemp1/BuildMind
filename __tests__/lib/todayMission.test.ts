import { describe, it, expect } from "vitest";
import { planTodayMission, parseRecentTasks, kindOfTask, assessTaskQuality, failsMissionPreScreen, MISSION_KINDS } from "@/lib/todayMission";
import { fallbackForKind } from "@/lib/todayFallbacks";

const base = { stage: "Validation", recentTasks: [], avoidance: [], blockers: [], activeGoals: [] };

describe("parseRecentTasks", () => {
  it("parses numbered history lines with outcomes", () => {
    const b = `RECENT TASKS SHOWN:\n1. 10/4/2026: "Message 3 founders on LinkedIn" [completed]\n2. 10/3/2026: "Ship the pricing page"\n-> note`;
    expect(parseRecentTasks(b)).toEqual([
      { text: "Message 3 founders on LinkedIn", outcome: "completed" },
      { text: "Ship the pricing page", outcome: null },
    ]);
  });
  it("handles empty", () => expect(parseRecentTasks("")).toEqual([]));
});

describe("kindOfTask", () => {
  it("maps text to kinds", () => {
    expect(kindOfTask("Follow up with the 3 people who replied")).toBe("follow_up");
    expect(kindOfTask("Add a payment link and price to the landing page")).toBe("pricing");
    expect(kindOfTask("Interview 2 clinic owners about scheduling")).toBe("interview");
  });
});

describe("planTodayMission", () => {
  it("starts with people work at Idea stage with no history", () => {
    const m = planTodayMission({ ...base, stage: "Idea" });
    expect(["interview", "outreach"]).toContain(m.kind);
  });
  it("prefers building at Building stage", () => {
    expect(planTodayMission({ ...base, stage: "Building" }).kind).toBe("build");
  });
  it("rotates away from a kind used several days running", () => {
    const rt = Array.from({ length: 4 }, (_, i) => ({ text: `Message ${i + 3} founders on LinkedIn about invoices`, outcome: "completed" }));
    const m = planTodayMission({ ...base, stage: "Idea", recentTasks: rt });
    expect(m.kind).not.toBe("outreach");
  });
  it("follows up after a finished people task", () => {
    const m = planTodayMission({ ...base, recentTasks: [{ text: "Message 5 founders on LinkedIn about invoices", outcome: "completed" }] });
    expect(m.kind).toBe("follow_up");
  });
  it("goes small when drained or blocked", () => {
    const m = planTodayMission({ ...base, cognitiveLoad: "drained", recentTasks: [{ text: "Build the dashboard", outcome: "blocked" }, { text: "Ship onboarding", outcome: "blocked" }] });
    expect(["reset", "unblock", "follow_up"]).toContain(m.kind);
    expect(m.minutes).toBeLessThanOrEqual(20);
  });
  it("avoids the rejected kind", () => {
    const a = planTodayMission({ ...base, stage: "Building" });
    const b = planTodayMission({ ...base, stage: "Building", excludeAction: "Ship the checkout screen and deploy it" });
    expect(a.kind).toBe("build");
    expect(b.kind).not.toBe("build");
  });
  it("always returns a valid kind with reasons", () => {
    const m = planTodayMission(base);
    expect(MISSION_KINDS).toContain(m.kind);
    expect(m.reasons.length).toBeGreaterThan(0);
  });
});

describe("assessTaskQuality", () => {
  const ctx = { title: "InvoiceFlow", targetUsers: "freelance designers", problem: "late invoice payments", recentTasks: [], blockers: [], avoidance: [], activeGoals: [] };
  const build = planTodayMission({ ...base, stage: "Building" });
  it("accepts a build task with no platform or number", () => {
    const q = assessTaskQuality({ task: "Ship the reminder email screen in InvoiceFlow so a designer can chase a late invoice in one click", done_when: "Deployed and one designer has sent a reminder", first_step: "Open the invoices page and add a Remind button" , minutes: 60 }, build, ctx);
    expect(q.hardFails).toEqual([]);
    expect(q.pass).toBe(true);
  });
  it("rejects generic, placeholder and repeated tasks", () => {
    expect(assessTaskQuality({ task: "Brainstorm some ideas to grow your audience this week", done_when: "ideas listed down" }, build, ctx).hardFails).toContain("generic");
    expect(assessTaskQuality({ task: "Ship the [feature] for InvoiceFlow users today", done_when: "it is deployed live" }, build, ctx).hardFails).toContain("placeholder");
    const rep = assessTaskQuality({ task: "Ship the reminder email screen in InvoiceFlow", done_when: "deployed live now" }, build, { ...ctx, recentTasks: [{ text: "Ship the reminder email screen in InvoiceFlow", outcome: null }] });
    expect(rep.hardFails).toContain("repeat");
  });
  it("requires platform, number and user type only for outreach", () => {
    const out = planTodayMission({ ...base, stage: "Idea" });
    const bad = assessTaskQuality({ task: "Reach out to some people about the problem you have", done_when: "messages sent out" }, { ...out, kind: "outreach", requires: { platform: true, number: true, userType: true, draft: true } }, ctx);
    expect(bad.hardFails).toEqual(expect.arrayContaining(["missing_number", "missing_platform"]));
    expect(failsMissionPreScreen("Ship the reminder email screen in InvoiceFlow for designers", build, ctx).fails).toBe(false);
  });
});

describe("fallbackForKind", () => {
  it("has no placeholders and fits every kind", () => {
    for (const k of MISSION_KINDS) {
      const f = fallbackForKind(k, { userType: "freelance designers", problemDesc: "late invoices", productName: "InvoiceFlow", stage: "Validation" }, "seed");
      expect(f.action.length).toBeGreaterThan(25);
      expect(f.done_when.length).toBeGreaterThan(8);
      expect(/\[[A-Za-z][^\]]*\]/.test(`${f.action}${f.message}`)).toBe(false);
    }
  });
});
