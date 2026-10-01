import { describe, it, expect } from "vitest";
import {
  FOCUS_AREA_LIBRARY,
  focusAreaDefinition,
  closestFocusAreaDefinition,
  tagFocusAreas,
  tagFocusAreasForList,
  buildFocusAreaCoverage,
  buildPreviewFocusInsights,
} from "@/lib/breakMyStartupFocusAreas";

describe("FOCUS_AREA_LIBRARY", () => {
  it("has exactly the 7 areas the frontend renders as chips", () => {
    expect(FOCUS_AREA_LIBRARY.map((f) => f.name)).toEqual([
      "Business Model", "Unit Economics", "Market Size", "Competitive Moat",
      "Founder-Market Fit", "Tech Risk", "Regulatory Risk",
    ]);
  });
  it("every definition has real keywords and a real examines sentence", () => {
    for (const f of FOCUS_AREA_LIBRARY) {
      expect(f.keywords.length).toBeGreaterThan(3);
      expect(f.examines.length).toBeGreaterThan(20);
    }
  });
});

describe("focusAreaDefinition / closestFocusAreaDefinition", () => {
  it("matches exactly, case-insensitively", () => {
    expect(focusAreaDefinition("Unit Economics")?.name).toBe("Unit Economics");
    expect(focusAreaDefinition("unit economics")?.name).toBe("Unit Economics");
    expect(focusAreaDefinition("  Unit Economics  ")?.name).toBe("Unit Economics");
  });
  it("returns null for something with no real match", () => {
    expect(focusAreaDefinition("Vibes")).toBeNull();
    expect(closestFocusAreaDefinition("Vibes")).toBeNull();
  });
  it("closest still finds an exact match", () => {
    expect(closestFocusAreaDefinition("Tech Risk")?.name).toBe("Tech Risk");
  });
});

describe("tagFocusAreas", () => {
  it("tags only areas the founder actually selected, never the full library", () => {
    const text = "Our CAC is high relative to LTV, and there's real regulatory risk around data privacy.";
    expect(tagFocusAreas(text, ["Unit Economics"])).toEqual(["Unit Economics"]);
    expect(tagFocusAreas(text, ["Unit Economics", "Regulatory Risk"])).toEqual(["Unit Economics", "Regulatory Risk"]);
    // Business Model keywords aren't in the text, and it wasn't selected either way
    expect(tagFocusAreas(text, ["Unit Economics", "Business Model"])).toEqual(["Unit Economics"]);
  });

  it("returns nothing for empty text or no selection", () => {
    expect(tagFocusAreas("", ["Unit Economics"])).toEqual([]);
    expect(tagFocusAreas("CAC and LTV", [])).toEqual([]);
  });

  it("is case-insensitive and matches substrings", () => {
    expect(tagFocusAreas("Nothing here is DEFENSIBLE against a copycat.", ["Competitive Moat"])).toEqual(["Competitive Moat"]);
  });

  it("doesn't invent a tag when nothing matches", () => {
    expect(tagFocusAreas("We will build a mobile app for dog walkers.", ["Regulatory Risk"])).toEqual([]);
  });

  it("tagFocusAreasForList stays index-aligned with the input, including empty results", () => {
    const texts = ["High CAC relative to LTV.", "A nice logo.", "GDPR compliance is unresolved."];
    expect(tagFocusAreasForList(texts, ["Unit Economics", "Regulatory Risk"])).toEqual([
      ["Unit Economics"], [], ["Regulatory Risk"],
    ]);
  });
});

describe("buildFocusAreaCoverage", () => {
  it("splits selected areas into addressed vs unaddressed based on what was actually tagged", () => {
    const coverage = buildFocusAreaCoverage(
      ["Unit Economics", "Regulatory Risk", "Tech Risk"],
      [["Unit Economics"], [], ["Unit Economics", "Regulatory Risk"]],
    );
    expect(coverage).toEqual({
      selected: ["Unit Economics", "Regulatory Risk", "Tech Risk"],
      addressed: ["Unit Economics", "Regulatory Risk"],
      unaddressed: ["Tech Risk"],
    });
  });
  it("is null when nothing was selected — no coverage summary to show", () => {
    expect(buildFocusAreaCoverage([], [["Unit Economics"]])).toBeNull();
  });
  it("every selected area is unaddressed when nothing was tagged at all", () => {
    expect(buildFocusAreaCoverage(["Market Size"], [[], []])?.unaddressed).toEqual(["Market Size"]);
  });
});

describe("buildPreviewFocusInsights — the free-tier preview", () => {
  it("splits selected areas by whether the founder's own text already touches on them", () => {
    // Deliberately says nothing at all about regulation/compliance/licensing —
    // this is presence-of-keyword matching, not sentiment analysis, so a
    // sentence that mentions the word (even to deny it) would still count as
    // "touched on". That's a real, acknowledged limitation, not tested here.
    const idea = "We charge a subscription and our CAC is well below LTV, sold directly to small gyms.";
    const { killReasons, surviveReasons } = buildPreviewFocusInsights(
      ["Business Model", "Unit Economics", "Regulatory Risk"], idea,
    );
    expect(surviveReasons).toEqual([
      "Business Model: your description already touches on this — the full run checks whether it actually holds up.",
      "Unit Economics: your description already touches on this — the full run checks whether it actually holds up.",
    ]);
    expect(killReasons).toHaveLength(1);
    expect(killReasons[0]).toContain("Regulatory Risk: not addressed yet");
    expect(killReasons[0]).toContain(FOCUS_AREA_LIBRARY.find((f) => f.name === "Regulatory Risk")!.examines);
  });

  it("never fabricates anything idea-specific — the sentence is the same generic 'examines' text regardless of what the idea says", () => {
    const a = buildPreviewFocusInsights(["Tech Risk"], "A totally unrelated idea about pet grooming.");
    const b = buildPreviewFocusInsights(["Tech Risk"], "Another totally different idea about tax software.");
    expect(a.killReasons[0]).toBe(b.killReasons[0]);
  });

  it("produces nothing for areas with no library match, without throwing", () => {
    expect(buildPreviewFocusInsights(["Not A Real Area"], "some idea")).toEqual({ killReasons: [], surviveReasons: [] });
  });

  it("returns empty when no areas are selected", () => {
    expect(buildPreviewFocusInsights([], "an idea")).toEqual({ killReasons: [], surviveReasons: [] });
  });
});
