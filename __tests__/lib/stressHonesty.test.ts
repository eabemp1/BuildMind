import { describe, it, expect } from "vitest";
import { founderContextLine, type StartupContext } from "@/lib/agents";

const ctx = (over: Partial<StartupContext>): StartupContext => ({ idea: "SMS reminders for bike shops", problem: "Missed pickups", targetUsers: "shop owners", solution: "texts", stage: "Idea", competitors: [], ...over });

describe("stress test founder context", () => {
  it("withholds behaviour when the founder says it is a test", () => {
    const line = founderContextLine(ctx({ idea: "Fictional QA project, no real customers", founderAvoidanceZones: ["cold outreach"], isOwnProject: true }));
    expect(line).toMatch(/withheld/);
    expect(line).not.toMatch(/cold outreach/);
  });
  it("labels avoidance zones as unverified and bans character claims and unstated spend", () => {
    const line = founderContextLine(ctx({ founderAvoidanceZones: ["cold outreach"], isOwnProject: true }));
    expect(line).toMatch(/not verified/);
    expect(line).toMatch(/Do not describe the founder as avoiding/);
    expect(line).toMatch(/Do not recommend paid advertising/);
  });
});
