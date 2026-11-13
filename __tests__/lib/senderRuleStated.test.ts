import { describe, it, expect } from "vitest";
import { productNotBuilt, productClaimsRule, offersMissingProduct, statesNotBuilt } from "@/lib/prep/senderRule";

describe("founder text says there is no product", () => {
  it("overrides a stage label that says a product exists", () => {
    expect(productNotBuilt("MVP")).toBe(false);
    expect(productNotBuilt("MVP", "A fictional idea-stage project with no product or pricing")).toBe(true);
    expect(productClaimsRule("MVP", "idea-stage, no product yet")).toMatch(/DOES NOT EXIST/);
  });
  it("does not trigger on ordinary text", () => {
    expect(statesNotBuilt("We built an SMS tool for shops")).toBe(false);
  });
  it("flags a draft that describes the unbuilt product as existing", () => {
    expect(offersMissingProduct("I built an SMS reminder tool that texts customers when a repair is done.", "")).toBe(true);
    expect(offersMissingProduct("I'm researching how repair shops tell customers a bike is ready.", "")).toBe(false);
  });
});
