import { describe, it, expect } from "vitest";
import { isArchetypeSuccess } from "@/lib/learningLoop";
import { buildFounderMirror } from "@/lib/founderMirror";
import { selectAppSections } from "@/lib/coachAppKnowledge";
import { matchNavigation, parseReplyLinks } from "@/lib/coachNavigation";

describe("isArchetypeSuccess", () => {
  it("needs completion", () => {
    expect(isArchetypeSuccess({ outcome: "skipped", evidence_match_score: 0.9, outcome_quality: "strong" })).toBe(false);
  });
  it("counts structured evidence even with zero word overlap", () => {
    expect(isArchetypeSuccess({ outcome: "completed", evidence_match_score: 0.2, evidence_references: [{ id: "x" }] })).toBe(true);
    expect(isArchetypeSuccess({ outcome: "completed", evidence_match_score: 0.2, outcome_quality: "strong" })).toBe(true);
  });
  it("does not count the default 'useful' stamp or a bare completion", () => {
    expect(isArchetypeSuccess({ outcome: "completed", evidence_match_score: 0.2, outcome_quality: "useful", evidence_references: [] })).toBe(false);
  });
  it("keeps the old overlap bar as a fallback", () => {
    expect(isArchetypeSuccess({ outcome: "completed", evidence_match_score: 0.5 })).toBe(true);
  });
});

describe("coach navigation", () => {
  it("opens pages on a clear go-verb", () => {
    expect(matchNavigation("take me to my progress page")?.href).toBe("/progress");
    expect(matchNavigation("open notification settings")?.href).toBe("/settings");
  });
  it("does not treat data requests or chatter as navigation", () => {
    expect(matchNavigation("show my open tasks")).toBeNull();
    expect(matchNavigation("why is my progress so slow")).toBeNull();
  });
  it("only honours allow-listed tags and strips the rest", () => {
    const { text, links } = parseReplyLinks("See it here. [[open:/progress|Open Progress]] [[open:https://evil.com|x]] [[run:list_backlog]] [[run:drop_tables]]");
    expect(text).toBe("See it here.");
    expect(links.map((l) => l.kind)).toEqual(["open", "run"]);
  });
  it("app knowledge covers toggles", () => {
    expect(selectAppSections("where is the streak reminder toggle").map((s) => s.id)).toContain("notifications");
  });
});
