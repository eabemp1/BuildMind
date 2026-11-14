import { describe, it, expect } from "vitest";
import { parseConstraints, constraintsRule } from "@/lib/constraints";

describe("founder constraints", () => {
  it("returns null when nothing usable is set", () => {
    expect(parseConstraints(null)).toBeNull();
    expect(parseConstraints({})).toBeNull();
    expect(parseConstraints({ minutesPerDay: "abc", monthlyBudget: -5 })).toBeNull();
  });
  it("keeps zero as a real value", () => {
    expect(parseConstraints({ minutesPerDay: 30, monthlyBudget: 0 })).toEqual({ minutesPerDay: 30, monthlyBudget: 0 });
  });
  it("caps absurd values", () => {
    expect(parseConstraints({ minutesPerDay: 99999 })?.minutesPerDay).toBe(960);
  });
  it("zero budget means free actions only, and empty means no rule at all", () => {
    expect(constraintsRule({ minutesPerDay: 30, monthlyBudget: 0 })).toMatch(/NO money[^\n]*free actions only/);
    expect(constraintsRule({ minutesPerDay: 30, monthlyBudget: 0 })).toMatch(/30 minutes a day/);
    expect(constraintsRule({ minutesPerDay: null, monthlyBudget: 200 })).toMatch(/200 a month/);
    expect(constraintsRule(null)).toBe("");
  });
});
