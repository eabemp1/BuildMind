import { describe, it, expect } from "vitest";
import { cleanProblem, inferProjectProblem } from "@/lib/today/problemPhrase";

describe("cleanProblem", () => {
  it("keeps a short phrase that names a problem", () => {
    expect(cleanProblem("finding the cheapest groceries online")).toBe("finding the cheapest groceries online");
    expect(cleanProblem("Losing track of customer follow-ups.")).toBe("Losing track of customer follow-ups");
  });
  it("rejects descriptions and pasted paragraphs (real examples from live accounts)", () => {
    expect(cleanProblem("Our distribution engine is a scalable, repeatable growth framework designed to efficiently acquire users")).toBeNull();
    expect(cleanProblem("The market for AI-driven startup evaluation tools is saturated with platforms that focus primarily on financial metrics")).toBeNull();
    expect(cleanProblem("Most website-building services target small businesses that want a full-featured site")).toBeNull();
    expect(cleanProblem("BuildMind solves the problem of **founders lacking clear direction**")).toBeNull();
  });
  it("rejects empty input", () => { expect(cleanProblem("")).toBeNull(); expect(cleanProblem(null)).toBeNull(); });
});

describe("inferProjectProblem", () => {
  it("falls back to 'this problem' rather than a cut-off description", () => {
    expect(inferProjectProblem("Our engine is a scalable growth framework for startups", "DistriGINE", "A distribution engine for startups")).toBe("this problem");
  });
  it("uses a real problem phrase", () => {
    expect(inferProjectProblem("slow client onboarding", "Acme")).toBe("slow client onboarding");
  });
});
