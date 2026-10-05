import { describe, it, expect } from "vitest";
import { buildFirstDaysBrief, isThinHistory } from "@/lib/firstDaysBrief";

describe("buildFirstDaysBrief", () => {
  it("is empty once there is real history", () => {
    expect(buildFirstDaysBrief({ actionsShown: 9, reflections: 4, stage: "MVP" })).toBe("");
    expect(isThinHistory({ actionsShown: 3, reflections: 0 })).toBe(false);
  });
  it("quotes the founder's own words on day one", () => {
    const b = buildFirstDaysBrief({ actionsShown: 0, reflections: 0, stage: "Idea", problem: "Solo founders stall after week two", targetUsers: "first-time founders in Accra" });
    expect(b).toContain("Solo founders stall after week two");
    expect(b).toContain("first-time founders in Accra");
    expect(b).toMatch(/learning from a real person/);
  });
  it("still works with no project details", () => {
    expect(buildFirstDaysBrief({ actionsShown: 0, reflections: 0, stage: "Validation" })).toMatch(/commit time, data or money/);
  });
});
