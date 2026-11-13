import { describe, it, expect } from "vitest";
import { recommendedFor } from "@/lib/work/recommend";
import { catalog } from "@/lib/work/registry";

describe("work recommendations", () => {
  it("every recommended id exists in the catalogue, for every stage", () => {
    const ids = new Set(catalog().map((e) => e.id));
    for (const stage of ["Idea", "Validation", "MVP", "Launch", "Growth", "Revenue", "", "nonsense"]) {
      const r = recommendedFor(stage);
      expect(r.length).toBeGreaterThan(0);
      expect(r.length).toBeLessThanOrEqual(3);
      for (const x of r) expect(ids.has(x.id)).toBe(true);
    }
  });
  it("validation stage starts with the interview kit", () => {
    expect(recommendedFor("Validation")[0].id).toBe("existing:validation_kit");
  });
  it("skips jobs already made", () => {
    expect(recommendedFor("Validation", ["validation_kit"]).map((r) => r.id)).not.toContain("existing:validation_kit");
  });
});

import { recommendedForTask } from "@/lib/work/recommend";
describe("recommendations by today's task", () => {
  it("every task kind maps to real catalogue entries", () => {
    const ids = new Set(catalog().map((e) => e.id));
    for (const t of ["Interview two shop owners about missed pickups", "Send 5 messages to repair shops on WhatsApp", "Follow up with the 3 people who haven't replied", "Publish a post on LinkedIn about repair tracking", "Ask one shop to pay 20 dollars for early access"]) {
      const r = recommendedForTask(t, "Validation");
      expect(r.length).toBeGreaterThan(0);
      for (const x of r) expect(ids.has(x.id)).toBe(true);
    }
  });
  it("falls back to the stage when the task is not recognised or missing", () => {
    expect(recommendedForTask(null, "Validation")).toEqual(recommendedForTask("", "Validation"));
    expect(recommendedForTask("Think", "Validation").length).toBeGreaterThan(0);
  });
  it("a follow-up task puts outreach first", () => {
    expect(recommendedForTask("Follow up with the 3 people who haven't replied", "Validation")[0].id).toBe("existing:outreach");
  });
});
