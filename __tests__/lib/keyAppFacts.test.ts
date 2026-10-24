import { describe, it, expect } from "vitest";
import { summariseStripe, stripeFacts } from "@/lib/integrations/stripe";
import { summariseGithub, githubFacts } from "@/lib/integrations/github";

describe("what the cards show", () => {
  it("stripe with no subscribers shows zero, not a blank", () => {
    const f = stripeFacts(summariseStripe([], [], "live", new Date("2026-10-24T00:00:00Z")));
    expect(f.find((x) => x.label.startsWith("Monthly recurring revenue"))?.value).toBe("0");
    expect(f.find((x) => x.label.startsWith("Paying subscribers"))?.value).toBe("0");
  });
  it("stripe test mode is labelled so test numbers are never read as real revenue", () => {
    const f = stripeFacts(summariseStripe([], [], "test", new Date("2026-10-24T00:00:00Z")));
    expect(f.every((x) => x.label.includes("test mode"))).toBe(true);
  });
  it("github reports commits and cuts nothing it was not given", () => {
    const f = githubFacts(summariseGithub("me/app", 12, [], new Date("2026-10-24T00:00:00Z")));
    expect(f[0].value).toBe("12");
    expect(f.length).toBe(1);
  });
});
