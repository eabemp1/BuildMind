import { describe, it, expect } from "vitest";
import { planTodayMission, parseRecentTasks, DELEGATION_RE } from "@/lib/todayMission";

const base = { stage: "Idea", recentTasks: [], avoidance: [], blockers: [], activeGoals: [], noUsers: true };

describe("swapped-out tasks", () => {
  const swapped = (text: string) => ({ text, outcome: "replaced" as string | null });
  it("do not make outreach 'tired': swapping outreach tasks keeps people work on the table", () => {
    const m = planTodayMission({ ...base, recentTasks: [swapped("Message 5 clinic owners on WhatsApp"), swapped("Cold email 10 founders"), swapped("DM 5 barbers")] });
    expect(["outreach", "interview", "unblock"]).toContain(m.kind);
    expect(m.reasons.join(" ")).not.toMatch(/something different is due/);
    expect(m.reasons.join(" ")).toMatch(/swapped out/);
  });
  it("completed outreach still tires the kind", () => {
    const m = planTodayMission({ ...base, recentTasks: [{ text: "Message 5 clinic owners on WhatsApp", outcome: "completed" }, { text: "Cold email 10 founders", outcome: "completed" }] });
    expect(m.reasons.join(" ")).toMatch(/something different|replies/);
  });
  it("parses [replaced] and [skipped] tags", () => {
    expect(parseRecentTasks('1. 10/4/2026: "Message 3 founders" [replaced]\n2. 10/3/2026: "DM 2 people" [skipped]').map((t) => t.outcome)).toEqual(["replaced", "skipped"]);
  });
});

describe("delegation guard", () => {
  it("catches hiring and outsourcing tasks", () => {
    expect(DELEGATION_RE.test("Post a contract sales specialist job on two freelance platforms")).toBe(true);
    expect(DELEGATION_RE.test("Hire a virtual assistant")).toBe(true);
    expect(DELEGATION_RE.test("Message 5 clinic owners about booking")).toBe(false);
  });
});
