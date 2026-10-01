import { describe, it, expect } from "vitest";
import { APP_OVERVIEW, APP_SECTIONS, selectAppSections, buildAppKnowledgeBlock } from "@/lib/coachAppKnowledge";
import { NAV } from "@/lib/nav-config";
import { PLAN_LIMITS } from "@/lib/plan";

describe("coachAppKnowledge", () => {
  it("mentions every visible, enabled nav route in the overview", () => {
    const missing = NAV.filter((n) => n.enabled && !n.hidden && n.href.startsWith("/") && !n.href.includes("?"))
      .map((n) => n.href)
      .filter((href) => !APP_OVERVIEW.includes(href));
    expect(missing).toEqual([]);
  });

  it("reads plan numbers from the real limits, not retyped copies", () => {
    const plans = APP_SECTIONS.find((s) => s.id === "plans")!;
    expect(plans.body).toContain(`${PLAN_LIMITS.free.morningBriefingDaysPerWeek} days/week`);
    expect(plans.body).toContain(`${PLAN_LIMITS.free.historyDays}-day history`);
  });

  it("selects relevant sections, max 3, best first", () => {
    const hit = selectAppSections("why can't i use the agent workforce, is it locked on the free plan?");
    expect(hit.length).toBeGreaterThan(0);
    expect(hit.length).toBeLessThanOrEqual(3);
    expect(hit.map((s) => s.id)).toContain("plans");
  });

  it("returns no detail sections for unrelated text", () => {
    expect(selectAppSections("zzz qqq")).toEqual([]);
    expect(selectAppSections("   ")).toEqual([]);
  });

  it("explains how Progress counts tasks", () => {
    const hit = selectAppSections("why does progress show 0/7 tasks this week");
    expect(hit.map((s) => s.id)).toContain("progress");
  });

  it("always includes the overview and the plan label", () => {
    const block = buildAppKnowledgeBlock("hello", "free");
    expect(block).toContain("BUILDMIND APP MAP");
    expect(block).toContain("Free plan");
    expect(buildAppKnowledgeBlock("hello", "builder")).toContain("Builder");
  });
});
