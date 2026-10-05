import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MirrorStory, type MirrorStoryProps } from "@/components/founder-mirror/MirrorStory";

const full: MirrorStoryProps = {
  mirror: {
    beliefs: [{ belief: "You ship fastest after talking to a user", belief_key: "b1", why: "Seen across 6 tasks", evidence: ["6 tasks"], confidence: 78, trend: "strengthening", contradictory_evidence: [] }],
    skills: [{ id: "s1", label: "Customer discovery", level: 3, progress: 0.4, trend: "up" }],
    strengthening_patterns: ["Morning outreach"], weakening_patterns: [], may_be_wrong_about: ["Your avoidance of pricing"],
    recent_changes: [], signals: [{ id: "g1", severity: "high", title: "Pricing avoided", summary: "Four skips", recommended_response: "Do a 20 minute slice" }],
    decision: { top: { action: "Ask 2 users to pay", rationale: "Because", score: 80 }, alternatives: [1, 2] },
    self_reported_accuracy: { sample_size: 12, accuracy_pct: 64, trend: "up", summary: "Matches 64% of your moves." },
    generated_at: new Date().toISOString(),
  },
  behavioral: { archetype: { name: "The Builder", tagline: "t", strength: "s", blindSpot: "b", shadowBehavior: "x" }, signature_card: { dayCount: 9, statLine: "stat", avoidanceZone: "pricing", peakHour: null }, days_since_start: 9 },
  onOpenDetail: () => {},
};

describe("MirrorStory", () => {
  it("renders the cover with full data", () => {
    const html = renderToString(<MirrorStory {...full} />);
    expect(html).toContain("Here is how you actually work.");
    expect(html).toContain("Go to slide 10");
    expect(html).not.toContain("Go to slide 11");
  });
  it("renders with minimal data and no behavioral layer", () => {
    const min: MirrorStoryProps = { ...full, behavioral: null, mirror: { ...full.mirror, beliefs: [], skills: [], signals: [], strengthening_patterns: [], may_be_wrong_about: [], decision: { top: null, alternatives: [] }, self_reported_accuracy: { sample_size: 0, accuracy_pct: null, trend: "unknown", summary: "" } } };
    const html = renderToString(<MirrorStory {...min} />);
    expect(html).toContain("Founder Mirror");
    expect(html).toContain("Go to slide 3");
    expect(html).not.toContain("Go to slide 4");
  });
});
