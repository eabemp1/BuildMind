import { describe, it, expect } from "vitest";
import { buildFirstTask } from "@/lib/break/firstTask";

describe("buildFirstTask", () => {
  it("uses the weakest test as the task", () => {
    expect(buildFirstTask({ idea: "A tool", weakestTest: "Ask 5 founders", advice: "Other" })?.task).toBe("Ask 5 founders");
  });
  it("falls back to the advice", () => {
    expect(buildFirstTask({ idea: "A tool", advice: "Talk to users" })?.task).toBe("Talk to users");
  });
  it("returns null when there is nothing to do", () => {
    expect(buildFirstTask({ idea: "A tool" })).toBeNull();
  });
  it("fills the message from what was typed and leaves the name blank", () => {
    const r = buildFirstTask({ idea: "x", targetUsers: "Solo founders", problem: "building the wrong thing.", advice: "a" });
    expect(r?.message).toContain("[name]");
    expect(r?.message).toContain("solo founders");
    expect(r?.message).toContain("building the wrong thing. Could");
  });
});
