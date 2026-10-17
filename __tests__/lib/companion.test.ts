import { describe, it, expect } from "vitest";
import { buildMoments, shape, plannedVsDone, avoidance, reflectionGap, type CompanionInput, type TaskRow } from "@/lib/companion/moments";
import { selectMoments, limitsFor, type EventRow } from "@/lib/companion/policy";

const NOW = Date.parse("2026-10-17T12:00:00Z");
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const t = (title: string, outcome: string, ago: number, action_type?: string): TaskRow => ({ action_shown: title, outcome, created_at: day(ago), action_type });
const base: CompanionInput = { now: NOW, snapshot: { streak: 0, completedToday: false, daysInactive: 0, worstOverdue: null }, avoidanceZones: [], tasks: [], completedTodayTitles: [], reflectionsToday: 0 };

describe("moments", () => {
  it("flags a kind of work planned often and rarely done, with the real counts", () => {
    const tasks = [t("DM 5 founders on LinkedIn", "ignored", 2, "outreach"), t("Email 3 prospects", "overridden", 4, "outreach"), t("Message 5 users", "ignored", 6, "outreach"), t("Cold DM 10 people", "ignored", 8, "outreach"), t("Send 5 emails", "completed", 9, "outreach")];
    const m = plannedVsDone({ ...base, tasks });
    expect(m).toHaveLength(1);
    expect(m[0].facts[0]).toContain("5 tasks resolved in 21 days, 1 done (20%)");
  });
  it("needs at least 4 resolved tasks and ignores a healthy rate", () => {
    expect(plannedVsDone({ ...base, tasks: [t("a", "ignored", 1, "outreach"), t("b", "ignored", 2, "outreach")] })).toHaveLength(0);
    const ok = [1, 2, 3, 4].map((i) => t(`task ${i}`, "completed", i, "build"));
    expect(plannedVsDone({ ...base, tasks: ok })).toHaveLength(0);
  });
  it("calls out an avoided area with no matching completed task, and offers an approve-first job", () => {
    const m = avoidance({ ...base, avoidanceZones: ["Visibility"], tasks: [t("Fix login bug", "completed", 2, "build")] });
    expect(m).toHaveLength(1);
    expect(m[0].job?.type).toBe("schedule_followup");
  });
  it("stays quiet when the area was actually tackled", () => {
    expect(avoidance({ ...base, avoidanceZones: ["Visibility"], tasks: [t("Publish launch post on LinkedIn", "completed", 2, "content")] })).toHaveLength(0);
  });
  it("prompts a reflection only when work was done and nothing was recorded", () => {
    expect(reflectionGap({ ...base, completedTodayTitles: ["Ship pricing page"] })[0].job).toMatchObject({ type: "open" });
    expect(reflectionGap({ ...base, completedTodayTitles: ["Ship pricing page"], reflectionsToday: 1 })).toHaveLength(0);
  });
  it("facts are identical across styles; only framing changes", () => {
    const m = buildMoments({ ...base, snapshot: { streak: 0, completedToday: false, daysInactive: 6, worstOverdue: null } })[0];
    const a = shape(m, "direct-challenger"), b = shape(m, "execution-coach");
    expect(a.facts).toEqual(b.facts);
    expect(a.headline).not.toBe(b.headline);
  });
});

describe("policy", () => {
  const cand = buildMoments({ ...base, snapshot: { streak: 7, completedToday: true, daysInactive: 8, worstOverdue: { title: "Launch", daysLate: 10 } }, completedTodayTitles: ["x"] });
  it("respects the daily cap by intensity", () => {
    expect(selectMoments(cand, [], "execution-coach", "quiet", NOW).selected.length).toBeLessThanOrEqual(1);
    expect(limitsFor("direct-challenger", "relentless").cap).toBe(4);
  });
  it("skeptic and challenger never celebrate", () => {
    expect(selectMoments(cand, [], "direct-challenger", "relentless", NOW).selected.some((m) => m.kind === "win")).toBe(false);
  });
  it("keeps today's shown set stable and counts it against the cap", () => {
    const first = selectMoments(cand, [], "strategic-partner", "balanced", NOW);
    const hist: EventRow[] = first.selected.map((m) => ({ key: m.key, status: "shown", day: "2026-10-17", created_at: new Date(NOW).toISOString() }));
    const again = selectMoments(cand, hist, "strategic-partner", "balanced", NOW);
    expect(again.selected.map((m) => m.key).sort()).toEqual(first.selected.map((m) => m.key).sort());
    expect(again.newKeys).toHaveLength(0);
  });
  it("a dismissed moment is silent for three days, then returns", () => {
    const m = cand[0];
    const dismissed = (ago: number): EventRow[] => [{ key: m.key, status: "dismissed", day: day(ago).slice(0, 10), created_at: day(ago) }];
    expect(selectMoments(cand, dismissed(1), "execution-coach", "relentless", NOW).selected.some((x) => x.key === m.key)).toBe(false);
    expect(selectMoments(cand, dismissed(4), "execution-coach", "relentless", NOW).selected.some((x) => x.key === m.key)).toBe(true);
  });
});
