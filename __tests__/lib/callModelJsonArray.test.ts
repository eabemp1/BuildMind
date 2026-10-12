import { describe, expect, it } from "vitest";
import { extractJSONText } from "@/lib/ai-providers";

describe("extractJSONText", () => {
  it("keeps a top-level array whole (it used to be cut to '{a},{b}')", () => {
    expect(JSON.parse(extractJSONText('[{"a":1},{"a":2}]'))).toEqual([{ a: 1 }, { a: 2 }]);
  });
  it("keeps an array that has prose around it", () => {
    expect(JSON.parse(extractJSONText('Here you go: [{"a":1}] done'))).toEqual([{ a: 1 }]);
  });
  it("still extracts an object, including one that contains arrays", () => {
    expect(JSON.parse(extractJSONText('x {"insights":[{"a":1}]} y'))).toEqual({ insights: [{ a: 1 }] });
  });
  it("returns plain text unchanged when there is no JSON", () => {
    expect(extractJSONText("nothing here")).toBe("nothing here");
  });
});
