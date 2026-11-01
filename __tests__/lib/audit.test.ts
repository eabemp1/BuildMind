import { describe, it, expect } from "vitest";
import { auditTask } from "@/lib/today/audit";
import { buildLedger } from "@/lib/today/facts";

const rihab = "Ok I've built Nevrix, it is an AI-powered project intelligence platform that evaluates startup ideas through financial, environmental, market, location, and regulatory analysis.";

describe("auditTask", () => {
  it("flags the real Nevrix task: invented parts, and a build task for something already built", () => {
    const r = auditTask("Create a simple results page that receives the JSON report from the AI and displays the five dimension scores as progress bars with brief explanations", rihab);
    expect(r).toContain("assumed_component");
    expect(r).toContain("built_but_asked_to_build");
  });
  it("does not flag a part the founder named", () => {
    expect(auditTask("Build an API endpoint for the report", "I am building a REST api with an endpoint for reports")).not.toContain("assumed_component");
  });
  it("ignores non-build tasks", () => {
    expect(auditTask("Email three founders asking how they handled the problem", rihab)).toEqual([]);
  });
  it("flags users assumed when the founder said they have none", () => {
    const ledger = buildLedger([{ created_at: new Date().toISOString(), outcome: "blocked", note: "I have no users yet" }]);
    expect(auditTask("Message your users and ask what they think", "", ledger)).toContain("assumes_users");
    expect(auditTask("Message your users and ask what they think", "")).toEqual([]);
  });
  it("flags two channels in one task", () => {
    expect(auditTask("Send 3 DMs on Twitter — on WhatsApp", "")).toContain("multiple_channels");
    expect(auditTask("Send 3 DMs on Twitter", "")).toEqual([]);
  });
});

import { buildLedger as bl } from "@/lib/today/facts";
describe("'wrong assumption' feedback", () => {
  it("becomes a rule the next task must respect, using the founder's own words", () => {
    const ledger = bl([], { feedback: [{ task_text: "Build a results page", reason: "wrong_assumption", note: "I already have a results page", created_at: new Date().toISOString() }] });
    const f = ledger.facts.find((x) => x.kind === "rejected");
    expect(f?.rule).toContain("I already have a results page");
  });
});
