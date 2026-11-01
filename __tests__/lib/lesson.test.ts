import { describe, it, expect } from "vitest";
import { lessonFor } from "@/lib/today/lesson";

describe("lessonFor", () => {
  it("gives a plain sentence to a new founder", () => {
    expect(lessonFor("interview", 2, 0)).toMatch(/conversations/);
  });
  it("stops after two weeks or six finished tasks", () => {
    expect(lessonFor("interview", 14, 0)).toBeNull();
    expect(lessonFor("interview", 3, 6)).toBeNull();
  });
  it("says nothing for an unknown or missing kind", () => {
    expect(lessonFor("mystery", 1, 0)).toBeNull();
    expect(lessonFor(null, 1, 0)).toBeNull();
  });
});
