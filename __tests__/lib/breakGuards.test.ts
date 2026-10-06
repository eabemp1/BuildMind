import { describe, it, expect } from "vitest";
import { isUnsupportedFounderTraitClaim, stripUnsupportedTraitClaims, classifyRiskCategory } from "@/lib/breakGuards";

describe("founder trait guard", () => {
  it("flags the discipline and hire-a-PM claims", () => {
    expect(isUnsupportedFounderTraitClaim("The founder admits no focus areas, so they may lack the discipline to build and iterate.")).toBe(true);
    expect(isUnsupportedFounderTraitClaim("Hire an experienced product manager or bring on a co-founder.")).toBe(true);
  });
  it("keeps ordinary risks", () => {
    expect(isUnsupportedFounderTraitClaim("Incumbents can copy the feature within a quarter.")).toBe(false);
  });
  it("drops trait claims without behavioural history and keeps them with it", () => {
    const list = ["Founder lacks the discipline to iterate.", "No customer has paid."];
    expect(stripUnsupportedTraitClaims(list, false)).toEqual(["No customer has paid."]);
    expect(stripUnsupportedTraitClaims(list, true)).toEqual(list);
  });
});

describe("risk categories come from the text", () => {
  it("does not call a founder claim a moat risk", () => {
    expect(classifyRiskCategory("Incumbents can replicate this easily, no defensibility")).toBe("Moat risk");
    expect(classifyRiskCategory("Founders may not pay for this at the price needed")).toBe("Revenue risk");
    expect(classifyRiskCategory("Something unrelated and vague")).toBe("General risk");
  });
});
