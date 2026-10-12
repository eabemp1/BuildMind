import { describe, it, expect } from "vitest";
import { splitAudiences, pickAudienceFork } from "@/lib/breakEvidenceV3";

describe("audience fork", () => {
  it("splits two distinct groups", () => {
    expect(splitAudiences("Hospital procurement teams and patients")).toEqual(["Hospital procurement teams", "patients"]);
  });
  it("keeps single audiences whole", () => {
    expect(splitAudiences("small and medium businesses")).toHaveLength(1);
    expect(splitAudiences("men and women")).toHaveLength(1);
    expect(splitAudiences("freelance designers")).toEqual(["freelance designers"]);
    expect(splitAudiences("")).toEqual([]);
    expect(splitAudiences(undefined)).toEqual([]);
  });
  it("starts with the group that holds a budget", () => {
    const f = pickAudienceFork("patients and hospital procurement teams")!;
    expect(f.start).toBe("hospital procurement teams");
    expect(f.later).toEqual(["patients"]);
  });
  it("falls back to the first group when neither clearly pays", () => {
    const f = pickAudienceFork("students and parents of teenagers")!;
    expect(f.start).toBe("students");
    expect(f.reason).toMatch(/reach this week/);
  });
  it("returns nothing for one audience", () => {
    expect(pickAudienceFork("freelance designers")).toBeUndefined();
  });
});
