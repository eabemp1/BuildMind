import { describe, it, expect } from "vitest";
import { matchRoadmapTask, tokens } from "@/lib/roadmap/match";

const open = [
  { id: "1", title: "Interview five grocery shop owners", milestone: "Validate" },
  { id: "2", title: "Build the price comparison page", milestone: "MVP" },
  { id: "3", title: "Write the launch post", milestone: "Launch" },
];

describe("matchRoadmapTask", () => {
  it("matches when the action covers the task's own words", () => {
    expect(matchRoadmapTask("Interview 5 grocery shop owners in Madina and note what they say", open)?.id).toBe("1");
  });
  it("does not match unrelated work", () => {
    expect(matchRoadmapTask("Message three friends about your idea", open)).toBeNull();
    expect(matchRoadmapTask("fix it", open)).toBeNull();
  });
  it("does not guess between two equally good tasks", () => {
    const two = [{ id: "a", title: "Call grocery shop owners", milestone: "x" }, { id: "b", title: "Call grocery shop owners", milestone: "y" }];
    expect(matchRoadmapTask("Call grocery shop owners today", two)).toBeNull();
  });
  it("ignores plural and filler words", () => {
    expect(tokens("Interview the Owners of shops")).toEqual(["interview", "owner", "shop"]);
  });
});
