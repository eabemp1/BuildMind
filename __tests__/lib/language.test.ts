import { describe, it, expect } from "vitest";
import { LANGUAGE_RULE, withLanguageRule } from "@/lib/language";

describe("withLanguageRule", () => {
  it("adds the rule once", () => {
    const once = withLanguageRule("Do the thing.");
    expect(once).toContain(LANGUAGE_RULE);
    expect(withLanguageRule(once)).toBe(once);
  });
  it("keeps JSON keys in English", () => {
    expect(LANGUAGE_RULE).toMatch(/JSON keys/);
  });
});
