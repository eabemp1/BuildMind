import { describe, it, expect } from "vitest";
import { draftLabel, DRAFT_CAN } from "@/lib/today/draftLine";

describe("draftLabel", () => {
  it("offers a draft when nothing exists", () => {
    expect(draftLabel(null)).toBe(DRAFT_CAN);
    expect(draftLabel({})).toBe(DRAFT_CAN);
  });
  it("does not claim a draft that only has a starting structure", () => {
    expect(draftLabel({ degraded: true, variants: [{}, {}] })).toBe(DRAFT_CAN);
  });
  it("counts versions", () => {
    expect(draftLabel({ variants: [{}, {}, {}] })).toBe("BuildMind drafted 3 versions. Open them");
  });
  it("says drafted for one version or a sectioned draft", () => {
    expect(draftLabel({ variants: [{}] })).toBe("BuildMind drafted this. Open it");
    expect(draftLabel({ sections: [{}] })).toBe("BuildMind drafted this. Open it");
  });
});
