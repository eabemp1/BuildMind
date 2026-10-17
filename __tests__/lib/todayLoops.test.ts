import { describe, it, expect } from "vitest";
import {
  parseDuration, defaultChoiceFor, dueAtFor, isDue, urgencyOf, partitionLoops, canSnooze, MAX_SNOOZES,
  loopQuestion, defaultMeasure, loopsPromptBlock, looksLikeOpenLoop, evidenceAsReflection, type Loop,
} from "@/lib/today/loops";
import { computeSlos, statusFor, overallStatus, MIN_SAMPLE, type SloCounts } from "@/lib/today/slo";
import { buildLedger, findContradictions } from "@/lib/today/facts";
import { replay } from "@/lib/today/replay";
import { toRow } from "@/lib/today/telemetry";

const H = 3600_000;
const NOW = Date.parse("2026-10-16T12:00:00Z");
const loop = (o: Partial<Loop>): Loop => ({
  id: "1", project_id: null, task_text: "DM 5 founders", measure: "who replied", due_at: new Date(NOW - H).toISOString(),
  status: "open", snooze_count: 0, notified_at: null, evidence: null, result: null, created_at: new Date(NOW - 48 * H).toISOString(), ...o,
} as Loop);

describe("loops", () => {
  it("parses the durations founders actually type", () => {
    expect(parseDuration("will check in 3 days")).toBe("3d");
    expect(parseDuration("waiting a full day")).toBe("1d");
    expect(parseDuration("next week")).toBe("1w");
    expect(parseDuration("in a couple of hours")).toBe("4h");
    expect(parseDuration("nothing here")).toBeNull();
    expect(defaultChoiceFor("nothing here")).toBe("1d");
  });
  it("computes due times and due state", () => {
    expect(Date.parse(dueAtFor("1d", NOW)) - NOW).toBe(24 * H);
    expect(isDue(loop({}), NOW)).toBe(true);
    expect(isDue(loop({ due_at: new Date(NOW + H).toISOString() }), NOW)).toBe(false);
    expect(isDue(loop({ status: "recorded" }), NOW)).toBe(false);
  });
  it("grades urgency", () => {
    expect(urgencyOf({ due_at: new Date(NOW - H).toISOString() }, NOW)).toBe("due");
    expect(urgencyOf({ due_at: new Date(NOW - 2 * 24 * H).toISOString() }, NOW)).toBe("overdue");
    expect(urgencyOf({ due_at: new Date(NOW - 6 * 24 * H).toISOString() }, NOW)).toBe("stale");
  });
  it("partitions due vs upcoming and ignores closed loops", () => {
    const p = partitionLoops([loop({ id: "a" }), loop({ id: "b", due_at: new Date(NOW + H).toISOString() }), loop({ id: "c", status: "dismissed" })], NOW);
    expect(p.due.map((l) => l.id)).toEqual(["a"]);
    expect(p.upcoming.map((l) => l.id)).toEqual(["b"]);
  });
  it("caps snoozing", () => {
    expect(canSnooze({ snooze_count: MAX_SNOOZES - 1 })).toBe(true);
    expect(canSnooze({ snooze_count: MAX_SNOOZES })).toBe(false);
  });
  it("builds the question, measure and prompt block", () => {
    expect(loopQuestion(loop({}))).toContain("who replied");
    expect(defaultMeasure("Post on LinkedIn")).toMatch(/comments/);
    expect(defaultMeasure("x", "still waiting for Reddit replies")).toMatch(/waiting for Reddit/i);
    expect(loopsPromptBlock([])).toBe("");
    expect(loopsPromptBlock([loop({})], NOW)).toContain("DUE FOLLOW-UPS");
  });
  it("detects open loops in the founder's words", () => {
    expect(looksLikeOpenLoop("still waiting for replies")).toBe(true);
    expect(looksLikeOpenLoop("got 3 signups")).toBe(false);
  });
  it("turns evidence into a reflection", () => {
    const r = evidenceAsReflection(loop({}), "2 replies", "worked");
    expect(r.outcome).toBe("learned");
    expect(JSON.stringify(r)).toContain("2 replies");
  });
});

describe("SLOs", () => {
  const base: SloCounts = { generated: 20, fallbacks: 1, contradictions: 0, templateLeaks: 0, completed: 8, partial: 2, overridden: 3, ignored: 2, reflected: 10, outcomeAdjusted: 1, reflections: 10, loopsDue: 4, loopsRecorded: 3, feedbackDoesntFit: 1 };
  it("grades against targets", () => {
    expect(statusFor(5, 10, "max")).toBe("ok");
    expect(statusFor(14, 10, "max")).toBe("warn");
    expect(statusFor(20, 10, "max")).toBe("breach");
    expect(statusFor(45, 40, "min")).toBe("ok");
    expect(statusFor(32, 40, "min")).toBe("warn");
    expect(statusFor(10, 40, "min")).toBe("breach");
  });
  it("healthy counts are on target", () => {
    expect(overallStatus(computeSlos(base))).toBe("ok");
  });
  it("small samples are nodata, not alarms", () => {
    const s = computeSlos({ ...base, generated: MIN_SAMPLE - 1, fallbacks: MIN_SAMPLE - 1 });
    expect(s.find((x) => x.key === "fallback")?.status).toBe("nodata");
  });
  it("breaches surface overall", () => {
    expect(overallStatus(computeSlos({ ...base, fallbacks: 15 }))).toBe("breach");
  });
});

describe("feedback → ledger → guard", () => {
  const fb = (reason: any) => [{ task_text: "Interview 5 of your users", reason, created_at: "2026-10-15T10:00:00Z" }];
  it("'no users' feedback makes user-interview tasks fail the guard", () => {
    const ledger = buildLedger([], { now: NOW, feedback: fb("no_users") });
    expect(ledger.facts.some((f) => f.kind === "no_users")).toBe(true);
    expect(findContradictions("Interview 5 active users about onboarding", ledger).length).toBeGreaterThan(0);
  });
  it("feedback expires with its TTL", () => {
    const late = Date.parse("2027-02-01T00:00:00Z");
    expect(buildLedger([], { now: late, feedback: fb("no_users") }).facts.length).toBe(0);
  });
});

describe("replay", () => {
  it("flags past tasks that contradict what the founder had already said", () => {
    const reflections = { u1: [{ created_at: "2026-10-01T10:00:00Z", what_happened: "I have no users yet, nobody has signed up" }] };
    const rep = replay([
      { created_at: "2026-10-02T10:00:00Z", action_shown: "Interview 5 active users about onboarding", outcome: "ignored", user_id: "u1" },
      { created_at: "2026-10-03T10:00:00Z", action_shown: "Send 5 DMs to founders in r/SaaS", outcome: "completed", user_id: "u1" },
    ], reflections);
    expect(rep.total).toBe(2);
    expect(rep.flagged).toBe(1);
    expect(rep.flaggedAndRejected).toBe(1);
  });
  it("does not use the future: reflections after the task are ignored", () => {
    const rep = replay(
      [{ created_at: "2026-10-01T10:00:00Z", action_shown: "Interview 5 active users", outcome: null, user_id: "u1" }],
      { u1: [{ created_at: "2026-10-05T10:00:00Z", what_happened: "I have no users yet" }] },
    );
    expect(rep.flagged).toBe(0);
  });
});

describe("telemetry", () => {
  it("normalises rows and drops bad project ids", () => {
    const row = toRow({ kind: "rejected", projectId: "nope", rules: ["a"], task: "x".repeat(900) });
    expect(row.project_id).toBeNull();
    expect(row.task?.length).toBe(400);
  });
});
