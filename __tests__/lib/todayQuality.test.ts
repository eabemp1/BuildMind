/**
 * Golden regression suite for Today-task quality, built from a real founder's
 * last three weeks (reflections + tasks). Every case here is a loophole that
 * actually shipped. Add a row here whenever a new one is found.
 */
import { describe, it, expect } from "vitest";
import { buildLedger, findContradictions, factsPromptBlock, type ReflectionText } from "@/lib/today/facts";
import { checkOutcome } from "@/lib/today/outcomeCheck";
import { planTodayMission, assessTaskQuality, failsMissionPreScreen } from "@/lib/todayMission";
import { splitRegenerated, REGENERATE_WINDOW_MS } from "@/lib/learning";

const r = (created_at: string, o: Partial<ReflectionText>): ReflectionText => ({ created_at, ...o });

const REAL: ReflectionText[] = [
  r("2026-10-15T19:51:00Z", { outcome: "completed", today_action: "Schedule and send outreach emails to at least three beta users within the next two hours.", what_tried: "I don't have any beta users" }),
  r("2026-10-14T18:58:00Z", { outcome: "completed", today_action: "Implement the email reminder toggle on the beta dashboard", what_tried: "I have mostly built all the apps features, the current direction is distribution, growth and revenue" }),
  r("2026-10-12T18:01:00Z", { outcome: "partial", today_action: "Locate a niche founder community", what_tried: "I DMed someone to give me an invite to a founder focused group but I haven't yet received one" }),
  r("2026-10-11T21:36:00Z", { outcome: "blocked", today_action: "Send Discord DMs to three beta founders", what_tried: "I didn't try much", blocker: "I didn't have access to any founder groups on discord" }),
  r("2026-10-10T07:58:00Z", { outcome: "completed", today_action: "Add the 'Invite a fellow founder' referral button to the onboarding screen", what_tried: "Yes, I have already implemented that in my app" }),
  r("2026-10-06T21:48:00Z", { outcome: "partial", today_action: "Post a 2-sentence introduction in the #founders Slack channel of Indie Hackers", what_tried: "I spent the entire day looking for the Slack workspace for #founders in Indie Hackers and i didn't find it" }),
  r("2026-10-05T20:43:00Z", { outcome: "completed", today_action: "Publish a 2-sentence tip post on LinkedIn", what_tried: "I posted this on LinkedIn: When you're building a habit-forming product...", what_happened: "I just posted 10 minutes ago and I have gotten 2 likes, still waiting a full day to measure engagements" }),
  r("2026-09-27T16:20:00Z", { outcome: "blocked", today_action: "Send 5 personalized emails to current beta founders", what_tried: "I don't yet have any users, so i can't send messages or emails to any beta users" }),
];
const at = (iso: string) => Date.parse(iso);

describe("fact ledger", () => {
  it("learns 'no users' from the founder's own words and keeps it", () => {
    const l = buildLedger(REAL, { now: at("2026-10-16T12:00:00Z") });
    const f = l.facts.find((x) => x.kind === "no_users");
    expect(f).toBeTruthy();
    expect(f!.evidence.toLowerCase()).toContain("beta users");
  });

  it("learns platform access limits, and lets them expire", () => {
    expect(buildLedger(REAL, { now: at("2026-10-16T12:00:00Z") }).facts.some((x) => x.kind === "no_access" && x.subject === "discord")).toBe(true);
    expect(buildLedger(REAL, { now: at("2026-11-05T12:00:00Z") }).facts.some((x) => x.kind === "no_access")).toBe(false);
  });

  it("remembers a failed search so it is not re-assigned", () => {
    const l = buildLedger(REAL, { now: at("2026-10-08T12:00:00Z") });
    expect(l.facts.some((x) => x.kind === "search_failed")).toBe(true);
  });

  it("records what is already done and the stated direction", () => {
    const l = buildLedger(REAL, { now: at("2026-10-16T12:00:00Z") });
    expect(l.facts.some((x) => x.kind === "already_done" && /referral/i.test(x.doneTask ?? ""))).toBe(true);
    expect(l.facts.find((x) => x.kind === "direction")?.subject).toContain("distribution");
  });

  it("surfaces open loops (waiting on an invite / measuring a post) while fresh", () => {
    const l = buildLedger(REAL, { now: at("2026-10-13T12:00:00Z") });
    expect(l.openLoops.some((x) => /invite|received/i.test(x.text))).toBe(true);
    expect(buildLedger(REAL, { now: at("2026-10-30T12:00:00Z") }).openLoops).toHaveLength(0);
  });

  it("a later 'got my first users' cancels the no-users fact", () => {
    const l = buildLedger([...REAL, r("2026-10-16T10:00:00Z", { what_happened: "Got my first 3 users today from Reddit" })], { now: at("2026-10-16T12:00:00Z") });
    expect(l.facts.some((x) => x.kind === "no_users")).toBe(false);
  });

  it("does not invent facts from unrelated text", () => {
    const l = buildLedger([r("2026-10-15T10:00:00Z", { what_tried: "Wrote the landing page copy and posted it on LinkedIn" })], { now: at("2026-10-16T12:00:00Z") });
    expect(l.facts).toHaveLength(0);
  });

  it("renders a prompt block that states rules", () => {
    const block = factsPromptBlock(buildLedger(REAL, { now: at("2026-10-16T12:00:00Z") }));
    expect(block).toMatch(/NO users yet/);
    expect(block).toMatch(/rejected/);
  });
});

describe("contradictions: the real bad tasks are caught, good ones are not", () => {
  const ledger = buildLedger(REAL, { now: at("2026-10-16T12:00:00Z") });
  const bad = [
    "Send 1 personalized Discord DM to a paying beta founder requesting quick feedback and scheduling a 15-minute call on WhatsApp.",
    "Schedule and send outreach emails to at least three beta users within the next two hours.",
    "Send a concise Discord DM to three beta founders who used the referral link, proposing a 5-minute feedback call on WhatsApp.",
    "Choose a new outreach channel and send a brief message to one active BuildMind user asking for feedback on the feature they used this week.",
    "Send 5 personalized emails to current beta founders inviting them to refer a fellow founder.",
    "Join a public founder Discord community and post a brief introduction of BuildMind in the #introductions channel.",
  ];
  for (const t of bad) it(`flags: ${t.slice(0, 60)}…`, () => expect(findContradictions(t, ledger).length).toBeGreaterThan(0));

  const good = [
    "Post one specific question about execution habits in r/startups and reply to every comment within 2 hours.",
    "Recruit 5 beta users: DM 5 founders on LinkedIn who posted about missed goals this week and offer a free 15-minute walkthrough.",
    "Check yesterday's LinkedIn post: record likes, comments and profile views, then reply to every comment.",
    "Interview 3 of your target users on WhatsApp about the last time they missed a weekly goal, and write down their exact words.",
    "Message 5 early-stage founders on LinkedIn who posted about consistency this week and ask one question about their last missed goal.",
  ];
  for (const t of good) it(`allows: ${t.slice(0, 60)}…`, () => expect(findContradictions(t, ledger)).toEqual([]));

  it("flags a repeat of something already done", () => {
    expect(findContradictions("Add the 'Invite a fellow founder' referral button to the onboarding screen", ledger).some((c) => c.fact === "already_done")).toBe(true);
  });
});

describe("task quality rubric: template leaks and open-ended searches", () => {
  const mission = planTodayMission({ stage: "Growth", recentTasks: [], avoidance: [], blockers: [], activeGoals: [], cognitiveLoad: "fresh", momentum: 50, isLowConfidence: false, candidateId: null });
  const ctx = { title: "BuildMind", targetUsers: "solo founders", problem: "inconsistent execution", recentTasks: [] };
  const hard = (task: string) => failsMissionPreScreen(task, mission, ctx).failed_checks;

  it("rejects leaked template text", () => {
    expect(hard("Ask 3 Not specified yet to walk you through how they handle No confirmed evidence that target users will pay today.")).toContain("template_leak");
    expect(hard("Conduct a 30-minute interview with one potential car buyer (Myself) about their last import on WhatsApp.")).toContain("template_leak");
  });

  it("rejects 'find a community' with no named place", () => {
    expect(hard("Identify an untapped founder community on a non-Discord platform, secure an invitation, and record the onboarding steps")).toContain("open_ended_search");
    expect(hard("Locate a niche founder community (e.g., a Slack or Reddit group), obtain an invite, join, and document its onboarding flow")).toContain("open_ended_search");
  });

  it("accepts a named place", () => {
    expect(hard("Find the three most upvoted threads in r/startups this week and leave one specific, useful reply on each within 45 minutes.")).not.toContain("open_ended_search");
  });

  it("flags contradictions through the rubric (stream + non-stream share it)", () => {
    const ledger = buildLedger(REAL, { now: at("2026-10-16T12:00:00Z") });
    const q = assessTaskQuality({ task: "Send 3 emails to your beta users asking what they liked about BuildMind this week.", done_when: "3 sent", first_step: "open email" }, mission, { ...ctx, ledger });
    expect(q.hardFails).toContain("contradicts_fact");
    expect(q.pass).toBe(false);
  });
});

describe("outcome honesty (real reflections)", () => {
  const c = (outcome: any, o: any) => checkOutcome({ outcome, ...o });
  it("'completed' + 'I don't have any beta users' becomes blocked", () => {
    const x = c("completed", { what_tried: "I don't have any beta users" });
    expect(x).toMatchObject({ outcome: "blocked", adjusted: true, from: "completed" });
    expect(x.reason).toBeTruthy();
  });
  it("'did nothing' / 'haven't touched anything' becomes abandoned", () => {
    expect(c("partial", { what_tried: "I did nothing" }).outcome).toBe("abandoned");
    expect(c("partial", { what_tried: "I haven't really touched anything " }).outcome).toBe("abandoned");
  });
  it("'blocked' with no blocker and 'engaged in different work' becomes abandoned", () => {
    expect(c("blocked", { what_tried: "I didn't try anything toda, I was engaged in a different work", what_learned: "Let us try again tomorrow " }).outcome).toBe("abandoned");
  });
  it("leaves honest outcomes alone", () => {
    expect(c("completed", { what_tried: "Joined a lot of founder channels today. I'm studying their onboarding steps" }).adjusted).toBe(false);
    expect(c("completed", { what_tried: "I posted this on LinkedIn", what_happened: "2 likes" }).adjusted).toBe(false);
    expect(c("completed", { what_tried: "Yes, I have already implemented that in my app" }).adjusted).toBe(false);
    expect(c("blocked", { what_tried: "I didn't try much", blocker: "I didn't have access to any founder groups on discord" }).adjusted).toBe(false);
    expect(c("partial", { what_tried: "I consistently filtered through founder groups on reddit and DMed someone for an invite" }).adjusted).toBe(false);
    expect(c("learned", { what_tried: "I didn't do anything" }).adjusted).toBe(false);
    expect(c("completed", {}).adjusted).toBe(false);
  });
});

describe("regenerated tasks are not 'ignored'", () => {
  it("a task replaced within 90 minutes is regenerated; a lone one is ignored", () => {
    const t0 = Date.parse("2026-10-13T00:12:49Z");
    const t1 = Date.parse("2026-10-13T00:18:37Z"); // replacement 6 min later
    const lone = Date.parse("2026-10-11T21:36:59Z");
    const res = splitRegenerated(
      [{ id: "a", at: t0, isToday: true }, { id: "b", at: lone, isToday: true }, { id: "c", at: t0, isToday: false }],
      [t0, t1, lone],
    );
    expect(res.regeneratedIds).toEqual(["a"]);
    expect(res.ignoredIds.sort()).toEqual(["b", "c"]);
    expect(REGENERATE_WINDOW_MS).toBe(90 * 60 * 1000);
  });
});
