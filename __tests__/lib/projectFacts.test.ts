import { describe, it, expect } from "vitest";
import { assembleFacts, factsBlock, latestCorrections, parseCorrections, type FactsInput } from "@/lib/projectFacts";

const base: FactsInput = { project: { name: "BikeApp", targetUsers: "bike shops", problem: "no queue" }, recentBlockers: [], corrections: [], constraints: null, testMode: false };
const get = (f: ReturnType<typeof assembleFacts>, k: string) => f.find((x) => x.key === k)!;

describe("projectFacts", () => {
  it("lists unknowns as unknown, never filled in", () => {
    const f = assembleFacts(base);
    expect(get(f, "target_location").value).toBeNull();
    expect(get(f, "target_location").source).toBe("unknown");
    expect(factsBlock(f)).toContain("NOT KNOWN");
  });
  it("derives no-contact from a blocker", () => {
    const f = assembleFacts({ ...base, recentBlockers: ["I don't know any bike shop owners"] });
    expect(get(f, "contacts").value).toMatch(/^None\./);
    expect(get(f, "contacts").source).toBe("reflection");
  });
  it("a founder correction wins over the derived value, newest wins over older", () => {
    const f = assembleFacts({ ...base, recentBlockers: ["I don't know any bike shop owners"], corrections: [
      { key: "contacts", value: "two shop owners", at: "2026-11-01T00:00:00Z" },
      { key: "contacts", value: "five shop owners", at: "2026-11-10T00:00:00Z" } ] });
    expect(get(f, "contacts").value).toBe("five shop owners");
    expect(get(f, "contacts").source).toBe("founder");
  });
  it("keeps founder and customer location separate", () => {
    const f = assembleFacts({ ...base, corrections: [
      { key: "founder_location", value: "Accra", at: "2026-11-01T00:00:00Z" },
      { key: "target_location", value: "Kumasi", at: "2026-11-01T00:00:00Z" } ] });
    const t = factsBlock(f);
    expect(t).toContain("Where you are: Accra");
    expect(t).toContain("Where your customers are: Kumasi");
    expect(t).toContain("different facts");
  });
  it("flags a test run", () => {
    expect(factsBlock(assembleFacts({ ...base, testMode: true }))).toContain("Test run");
  });
  it("parseCorrections drops junk and unknown keys", () => {
    const c = parseCorrections({ items: [{ key: "team", value: " solo ", at: "x" }, { key: "nope", value: "a", at: "x" }, { key: "team", value: "", at: "x" }, null] });
    expect(c).toEqual([{ key: "team", value: "solo", at: "x" }]);
    expect(parseCorrections(null)).toEqual([]);
    expect(latestCorrections(c).get("team")?.value).toBe("solo");
  });
});
