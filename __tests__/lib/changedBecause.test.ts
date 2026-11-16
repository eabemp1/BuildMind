import { describe, it, expect } from "vitest";
import { changedBecause } from "@/lib/todayFallbacks";

describe("changedBecause", () => {
  it("quotes what the founder said when contacts are the reason", () => {
    expect(changedBecause(["assumes_contact"], "I don't know any shop owners")).toContain("I don't know any shop owners");
  });
  it("explains a zero budget swap", () => {
    expect(changedBecause(["budget_zero_spend"], null, { minutesPerDay: 30, monthlyBudget: 0 })).toMatch(/no money/);
  });
  it("is empty when nothing applies", () => {
    expect(changedBecause([], null)).toBe("");
    expect(changedBecause(["assumes_contact"], null)).toBe("");
  });
});

import { markTestRun, isTestRun } from "@/lib/testMode";
describe("test run marker", () => {
  it("marks once and detects", () => {
    expect(markTestRun("did it")).toBe("[test run] did it");
    expect(markTestRun(markTestRun("did it"))).toBe("[test run] did it");
    expect(isTestRun("[test run] x")).toBe(true);
    expect(isTestRun("x")).toBe(false);
    expect(isTestRun(null)).toBe(false);
  });
});

import { projectSaysSimulated } from "@/lib/testMode";
describe("projectSaysSimulated", () => {
  it("catches explicit wording", () => {
    expect(projectSaysSimulated("QueuePilot is a fictional startup for QA")).toBe(true);
    expect(projectSaysSimulated("This is a test account")).toBe(true);
  });
  it("leaves real products alone", () => {
    expect(projectSaysSimulated("A QA testing tool for mobile teams")).toBe(false);
    expect(projectSaysSimulated("Booking software for bike shops")).toBe(false);
  });
});
