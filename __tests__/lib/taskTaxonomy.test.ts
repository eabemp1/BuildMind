import { describe, it, expect } from "vitest";
import { classifyTask, isMeaninglessLabel, sameWorkArea, UNCLASSIFIED_LABEL } from "@/lib/taxonomy/taskTaxonomy";
import { isRealTaskTitle, isFounderRecommendation, distinctByAction } from "@/lib/recommendationRows";
import { resolveStrengthsAndAvoidance } from "@/lib/founderPatterns";
import { splitMilestones, tasksInPlay } from "@/lib/milestoneScope";
import { isExternalWork, showsUserEvidence } from "@/lib/taxonomy/workSignals";

describe("classifyTask", () => {
  const cases: Array<[string, string]> = [
    ["Call one churned user and ask why they left", "Churn & exit interviews"],
    ["Build a clickable Figma prototype", "Wireframes & prototypes"],
    ["Launch a weekly newsletter on Substack", "Newsletter"],
    ["Review pricing tiers and decide what to charge", "Pricing design"],
    ["Set up PostHog event tracking for signup funnel", "Analytics & tracking"],
    ["Create a 5-question Google Form survey", "Feedback & surveys"],
    ["Onboard the first 10 beta founders", "Beta user onboarding"],
  ];
  it.each(cases)("%s -> %s", (task, label) => {
    expect(classifyTask(task).label).toBe(label);
  });
  it("never forces a vague task into a bucket", () => {
    const c = classifyTask("Do the thing");
    expect(c.confident).toBe(false);
    expect(c.label).toBe(UNCLASSIFIED_LABEL);
  });
  it("reads channel and audience separately", () => {
    const c = classifyTask("Message 3 founders on LinkedIn and ask about their last launch");
    expect(c.channel?.label).toBe("LinkedIn");
    expect(c.audience).toBe("founders");
  });
  it("does not treat a feature word as the channel", () => {
    expect(classifyTask("Fix the email validation bug in the signup form").channel).toBeNull();
  });
  it("is stable across verb forms", () => {
    expect(classifyTask("Interviewed three users").leafId).toBe(classifyTask("Interview three users").leafId);
  });
});

describe("labels", () => {
  it("rejects catch-all and bare platform labels", () => {
    expect(isMeaninglessLabel("other tasks (linkedin)")).toBe(true);
    expect(isMeaninglessLabel("linkedin")).toBe(true);
    expect(isMeaninglessLabel("Cold outreach")).toBe(false);
  });
  it("matches old and new vocabulary for the same area", () => {
    expect(sameWorkArea("direct outreach (email)", "Cold outreach · LinkedIn")).toBe(true);
    expect(sameWorkArea("Cold outreach", "Problem interviews")).toBe(false);
  });
});

describe("recommendation rows", () => {
  it("drops coach chat and prompt fragments", () => {
    expect(isRealTaskTitle('Type "open execution" in the AI Coach chat to launch the Execution page.')).toBe(false);
    expect(isRealTaskTitle("You are the founder of BuildMind.")).toBe(false);
    expect(isFounderRecommendation({ critic_persona: "ai_coach", action_shown: "Message 3 founders today" })).toBe(false);
    expect(isFounderRecommendation({ session_id: "ai_coach:p:1", action_shown: "Message 3 founders today" })).toBe(false);
    expect(isFounderRecommendation({ action_shown: "Message 3 founders on LinkedIn" })).toBe(true);
  });
  it("counts a repeatedly ignored task once", () => {
    const rows = Array.from({ length: 10 }, () => ({ action_shown: "Message 3 Founders on LinkedIn" }));
    expect(distinctByAction(rows)).toHaveLength(1);
  });
});

describe("resolveStrengthsAndAvoidance", () => {
  const done = (t: string) => ({ title: t, completed: true });
  const skipped = (t: string) => ({ title: t, completed: false });
  it("keeps the strength when the record backs it", () => {
    const r = resolveStrengthsAndAvoidance({
      strengths: ["Cold outreach · Email"], avoidance: ["outreach"],
      records: [done("Cold email 5 founders"), done("Cold email 3 prospects"), done("Cold DM 4 founders"), skipped("Cold email 2 founders")],
    });
    expect(r.strengths).toContain("Cold outreach · Email");
    expect(r.avoidance).not.toContain("outreach");
  });
  it("keeps the avoidance when the record backs it", () => {
    const r = resolveStrengthsAndAvoidance({
      strengths: ["Cold outreach · Email"], avoidance: ["outreach"],
      records: [skipped("Cold email 5 founders"), skipped("Cold email 3 prospects"), skipped("Cold DM 4 founders"), done("Cold email 2 founders")],
    });
    expect(r.avoidance).toContain("outreach");
    expect(r.strengths).toHaveLength(0);
  });
  it("reports mixed instead of claiming both", () => {
    const r = resolveStrengthsAndAvoidance({ strengths: ["content creation"], avoidance: ["content creation"], records: [] });
    expect(r.strengths).toHaveLength(0);
    expect(r.avoidance).toHaveLength(0);
    expect(r.mixed).toHaveLength(1);
  });
  it("drops 'other' and bare platform names", () => {
    const r = resolveStrengthsAndAvoidance({ strengths: [], avoidance: ["other", "linkedin", "Pricing design"], records: [] });
    expect(r.avoidance).toEqual(["Pricing design"]);
  });
});

describe("milestoneScope", () => {
  const ms = [
    { id: "a", title: "Launch", status: "completed", stage: "Launch" },
    { id: "b", title: "Growth", status: "pending", stage: "Growth" },
    { id: "c", title: "Run beta", status: "pending", stage: "Launch" },
    { id: "d", title: "Idea", status: "pending" },
  ];
  it("treats later-stage milestones as upcoming, not stalled", () => {
    const s = splitMilestones(ms, "Launch");
    expect(s.upcoming.map((m) => m.id)).toEqual(["b"]);
    expect(s.inPlay.map((m) => m.id)).toEqual(["c", "d"].filter((x) => x === "c" || x === "d"));
  });
  it("ignores tasks from passed or upcoming stages", () => {
    const tasks = [{ id: 1, milestone_id: "b" }, { id: 2, milestone_id: "c" }, { id: 3, milestone_id: null }];
    expect(tasksInPlay(tasks, ms, "Launch").map((t) => t.id)).toEqual([2, 3]);
  });
});

describe("workSignals", () => {
  it("counts outreach as external, a refactor as not", () => {
    expect(isExternalWork("Message 5 founders on LinkedIn")).toBe(true);
    expect(isExternalWork("Refactor the auth module")).toBe(false);
  });
  it("reads a founder's account of a reply as evidence", () => {
    expect(showsUserEvidence({ task: "Reach out to founders", happened: "Two of them replied and asked for a demo" })).toBe(true);
    expect(showsUserEvidence({ task: "Tidy the repo", happened: "Done" })).toBe(false);
  });
});
