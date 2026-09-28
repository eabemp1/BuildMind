import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { matchCoachAction } from "@/lib/coachActions/matcher";
import { COACH_ACTION_CHIPS } from "@/lib/coachActions/chips";
import {
  COACH_ACTIONS,
  buildBacklogResult,
  parseActionRequest,
  runCoachAction,
} from "@/lib/coachActions/registry";
import {
  shapeBacklog,
  shapeMilestones,
  backlogToCSV,
  type BacklogMilestone,
  type BacklogTaskRow,
} from "@/lib/coachActions/backlog";
import { shapeExecutionLog, executionLogToCSV, normalizeOutcome, type ExecutionLogRow } from "@/lib/coachActions/executionLog";
import { buildSignalsResult, buildDecisionResult, buildBeliefsResult, buildMomentumResult } from "@/lib/coachActions/intelligenceViews";
import { isTodayFlowSession, todayFlowSource } from "@/lib/todayFlowSessions";
import type { FounderMirror } from "@/lib/founderMirror";
import type { FounderScorecard } from "@/lib/scorecard";

const NOW = new Date("2026-09-28T00:00:00Z");

const milestones: BacklogMilestone[] = [
  { id: "m1", title: "Customer Validation", status: "in_progress", created_at: "2026-09-01T00:00:00Z", target_date: "2026-09-25" },
  { id: "m2", title: "Pricing Experiments", status: "pending", created_at: "2026-09-10T00:00:00Z", target_date: "2026-10-08" },
];
const task = (id: string, milestone_id: string, title: string, is_completed: boolean, created_at: string): BacklogTaskRow =>
  ({ id, milestone_id, title, notes: null, is_completed, created_at });
const tasks: BacklogTaskRow[] = [
  task("t4", "m2", "Draft pricing page", false, "2026-09-12T00:00:00Z"),
  task("t3", "m2", "Test $29 price", false, "2026-09-11T00:00:00Z"),
  task("t2", "m1", "Write survey", true, "2026-09-03T00:00:00Z"),
  task("t1", "m1", "Interview 5 users", false, "2026-09-02T00:00:00Z"),
  task("tx", "ghost-milestone", "Orphaned task", false, "2026-09-05T00:00:00Z"),
];

// Chainable, awaitable stand-in for the supabase-js query builder.
function fakeAdmin(tables: Record<string, { data: unknown; error?: { message: string } | null }>) {
  return {
    from(table: string) {
      const res = tables[table] ?? { data: null, error: { message: `no such table ${table}` } };
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "order", "limit", "gte"]) b[m] = () => b;
      b.maybeSingle = () =>
        Promise.resolve({ data: Array.isArray(res.data) ? res.data[0] ?? null : res.data, error: res.error ?? null });
      b.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: res.data, error: res.error ?? null }).then(resolve);
      return b;
    },
  } as unknown as SupabaseClient;
}

const logRow = (id: string, session_id: string, outcome: string | null, created_at: string, outcome_recorded_at: string | null = null, action = "Interview 3 customers"): ExecutionLogRow =>
  ({ id, session_id, action_shown: action, action_type: "user_interview", outcome, created_at, outcome_recorded_at, outcome_note: null });

const logRows: ExecutionLogRow[] = [
  logRow("l1", "today_action:p1:1", "completed", "2026-09-27T09:00:00Z", "2026-09-27T15:00:00Z"),
  logRow("l2", "task_complete:u1:2", "completed", "2026-09-26T10:00:00Z", "2026-09-26T10:00:00Z", "Send 10 outreach emails"),
  logRow("l3", "today_action:p1:3", null, "2026-09-25T09:00:00Z"),
  logRow("l4", "today_action:p1:4", "overridden", "2026-09-24T09:00:00Z", "2026-09-24T11:00:00Z"),
  // Not Today's — the table is shared. None of these may appear in an execution record.
  logRow("x1", "ai_coach:u1:5", "completed", "2026-09-27T10:00:00Z", "2026-09-27T10:00:00Z", "Coach reply text"),
  logRow("x2", "weekly_report:u1:6", "completed", "2026-09-27T10:00:00Z", "2026-09-27T10:00:00Z", "Report"),
  logRow("x3", "morning_briefing:u1:7", null, "2026-09-27T10:00:00Z", null, "Briefing"),
  logRow("x4", "recovery_mode:u1:8", null, "2026-09-27T10:00:00Z", null, "Recovery"),
  logRow("x5", "bms_123_abc", "completed", "2026-09-27T10:00:00Z", "2026-09-27T10:00:00Z", "Break My Startup run"),
  // Outside a 7-day window
  logRow("old", "today_action:p1:9", "completed", "2026-08-01T09:00:00Z", "2026-08-01T09:00:00Z"),
];

const okTables = {
  projects: { data: { id: "p1" } },
  milestones: { data: milestones },
  tasks: { data: tasks },
  reflexion_learning_log: { data: logRows },
};

const fakeMirror = {
  signals: [
    { id: "s1", type: "MOMENTUM_DROP", severity: "medium", title: "Momentum dropped", summary: "Momentum moved from 60 to 40.", recommended_response: "Assign a smaller task.", evidence: [{ source: "founder_context", detail: "60→40" }], decayed_confidence: 0.6, lifecycle: "active" },
    { id: "s2", type: "STALLED_MILESTONE", severity: "high", title: "Milestone stalled", summary: "No progress in 9 days.", recommended_response: "Ship one small piece today.", evidence: [{ source: "tasks", detail: "0 completed" }, { source: "reflections", detail: "none" }], decayed_confidence: 0.8, lifecycle: "active" },
  ],
  decision: {
    top: { id: "c1", action: "Interview 3 customers about pricing", rationale: "Evidence-producing and unblocks the pricing milestone.", why_it_beats_alternatives: "It produced evidence the last 3 times you did it.", score: 82 },
    alternatives: [
      { id: "c2", action: "Polish the landing page", rationale: "Low-risk but produces no new evidence.", score: 70, gap_to_top: 12 },
      { id: "c3", action: "Refactor the auth flow", rationale: "Not tied to a milestone.", score: 55, gap_to_top: 27 },
    ],
  },
  beliefs: [
    { belief: "You tend to be strong at technical.", belief_key: "k1", why: "Derived from completions.", evidence: ["a", "b", "c"], confidence: 0.72, trend: "persistent", last_updated: "", contradictory_evidence: [], correction_effect: null },
    { belief: "You tend to avoid pricing conversations.", belief_key: "k2", why: "Derived from skips.", evidence: [], confidence: 0.4, trend: "weakening", last_updated: "", contradictory_evidence: [], correction_effect: { corrections_applied: 1, confidence_before: 0.7, confidence_after: 0.4 } },
  ],
  suppressed_beliefs: [{ belief: "You avoid cold outreach.", reason: "softened" }],
} as unknown as FounderMirror;

const fakeScorecard = {
  momentum: 34, momentumLabel: { label: "Low" }, momentumDelta: 14, momentumTrend: "up", streak: 1, xp: 120, isDecaying: false,
} as unknown as FounderScorecard;

const loaders = { mirror: async () => fakeMirror, scorecard: async () => fakeScorecard };

describe("matchCoachAction — requests it should catch", () => {
  const backlogCases: Array<[string, Record<string, unknown>]> = [
    ["show my open tasks", {}],
    ["What's in my backlog?", {}],
    ["list my backlog", {}],
    ["how many open tasks do I have", {}],
    ["what tasks are left", {}],
    ["show my completed tasks", { status: "completed" }],
    ["list all my tasks", { status: "all" }],
    ["show top 5 open tasks", { limit: 5 }],
    ["show my open tasks on the pricing milestone", { milestone: "pricing" }],
    ["what's in my backlog for the launch milestone", { milestone: "launch" }],
    ["export my backlog as csv", {}],
  ];
  it.each(backlogCases)("%s → list_backlog", (msg, expected) => {
    const m = matchCoachAction(msg);
    expect(m?.id).toBe("list_backlog");
    expect(m?.params).toMatchObject(expected);
  });

  const exportCases: Array<[string, Record<string, unknown>]> = [
    ["export my intelligence data", {}],
    ["download my data as json", {}],
    ["how do I export my data", {}],
    ["export my data as csv", { format: "csv" }],
    ["download my intelligence report with history", { history: true }],
  ];
  it.each(exportCases)("%s → export_intelligence", (msg, expected) => {
    const m = matchCoachAction(msg);
    expect(m?.id).toBe("export_intelligence");
    expect(m?.params).toMatchObject(expected);
  });
});

describe("matchCoachAction — must NOT hijack real coaching", () => {
  it.each([
    "my backlog is overwhelming and I feel stuck",
    "should I clear my backlog first?",
    "why do I keep avoiding my open tasks",
    "I'm worried about my backlog, show me what to do",
    "what should I do about pricing",
    "tell me about my progress",
    "show me json examples for my API",
    "download the app",
    "export",
    "hello",
    "",
    `show my open tasks ${"and also think about my whole strategy ".repeat(6)}`,
  ])("%s → null", (msg) => {
    expect(matchCoachAction(msg)).toBeNull();
  });
});

describe("shapeBacklog", () => {
  it("orders by milestone (roadmap order) then oldest task first, and ignores orphaned tasks", () => {
    const v = shapeBacklog(milestones, tasks, { status: "open" }, NOW);
    expect(v.items.map((i) => i.id)).toEqual(["t1", "t3", "t4"]);
    expect(v.totalTasks).toBe(4); // orphan excluded
    expect(v.openCount).toBe(3);
    expect(v.completedCount).toBe(1);
    expect(v.milestonesWithMatches).toBe(2);
    expect(v.oldestOpenAgeDays).toBe(26);
  });

  it("filters by status", () => {
    expect(shapeBacklog(milestones, tasks, { status: "completed" }, NOW).items.map((i) => i.id)).toEqual(["t2"]);
    expect(shapeBacklog(milestones, tasks, { status: "all" }, NOW).items).toHaveLength(4);
  });

  it("matches milestone by case-insensitive substring while project-wide counts ignore the filter", () => {
    const v = shapeBacklog(milestones, tasks, { status: "open", milestone: "PRICING" }, NOW);
    expect(v.items.map((i) => i.id)).toEqual(["t3", "t4"]);
    expect(v.openCount).toBe(3);
  });

  it("reports a milestone that matches nothing, with the real titles to choose from", () => {
    const v = shapeBacklog(milestones, tasks, { status: "open", milestone: "launch" }, NOW);
    expect(v.items).toEqual([]);
    expect(v.milestoneNotFound).toBe("launch");
    expect(v.availableMilestones).toEqual(["Customer Validation", "Pricing Experiments"]);
  });
});

describe("backlogToCSV", () => {
  it("escapes quotes/commas/newlines and neutralizes spreadsheet formulas", () => {
    const v = shapeBacklog(
      milestones,
      [
        task("a", "m1", 'Call "Sam", then follow up', false, "2026-09-02T00:00:00Z"),
        task("b", "m1", "=HYPERLINK(\"http://evil\")", false, "2026-09-03T00:00:00Z"),
      ],
      { status: "open" },
      NOW,
    );
    const csv = backlogToCSV(v.items);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("milestone,milestone_status,task,notes,completed,created_at,age_days");
    expect(lines[1]).toContain('"Call ""Sam"", then follow up"');
    expect(lines[2]).toContain("'=HYPERLINK"); // leading ' defuses the formula
  });
});

describe("buildBacklogResult", () => {
  const params = { status: "open" as const, limit: 12 };
  const view = shapeBacklog(milestones, tasks, { status: "open" }, NOW);

  it("summarizes deterministically with real numbers and links downloads to the same filters", () => {
    const r = buildBacklogResult(view, params, "p1");
    expect(r.summary).toBe("3 open tasks across 2 milestones. The oldest has been waiting 26 days.");
    expect(r.stats).toContainEqual({ label: "Oldest open", value: "26d" });
    expect(r.rows).toHaveLength(3);
    expect(r.note).toBeUndefined();
    expect(r.downloads?.[0].href).toBe("/api/founder-context/backlog-export?projectId=p1&status=open&format=json");
  });

  it("says how many rows are hidden when the limit truncates the card", () => {
    const r = buildBacklogResult(view, { ...params, limit: 2 }, "p1");
    expect(r.rows).toHaveLength(2);
    expect(r.note).toMatch(/Showing 2 of 3/);
  });

  it("handles not-found, empty project, and all-done without inventing anything", () => {
    const nf = buildBacklogResult(shapeBacklog(milestones, tasks, { status: "open", milestone: "launch" }, NOW), { ...params, milestone: "launch" }, "p1");
    expect(nf.summary).toContain('couldn\'t find a milestone matching "launch"');
    expect(nf.note).toContain("Customer Validation");

    const empty = buildBacklogResult(shapeBacklog(milestones, [], { status: "open" }, NOW), params, "p1");
    expect(empty.summary).toBe("There are no tasks on this project yet.");

    const done = buildBacklogResult(
      shapeBacklog(milestones, [task("d", "m1", "Done thing", true, "2026-09-02T00:00:00Z")], { status: "open" }, NOW),
      params, "p1",
    );
    expect(done.summary).toBe("No open tasks — everything on this project is done.");
  });
});

describe("runCoachAction", () => {
  const ctx = (tables = okTables) => ({ userId: "u1", projectId: "p1", admin: fakeAdmin(tables), now: NOW });

  it("rejects unknown actions and invalid params", async () => {
    expect(await runCoachAction({ id: "delete_everything", params: {} }, ctx(), "free")).toMatchObject({ ok: false, status: 400 });
    expect(await runCoachAction({ id: "list_backlog", params: { limit: 500 } }, ctx(), "free")).toMatchObject({ ok: false, status: 400 });
    expect(await runCoachAction({ id: "list_backlog", params: { limit: "5" } }, ctx(), "free")).toMatchObject({ ok: false, status: 400 });
    expect(await runCoachAction({ id: "list_backlog", params: { status: "everything" } }, ctx(), "free")).toMatchObject({ ok: false, status: 400 });
  });

  it("cannot be pointed at another user's data: params have no userId/projectId, and unknown keys are ignored", async () => {
    const r = await runCoachAction({ id: "list_backlog", params: { userId: "someone-else", projectId: "p9" } }, ctx(), "free");
    expect(r.ok).toBe(true); // ran against ctx's session-derived ids, extra keys dropped
  });

  it("export_intelligence links to the existing export route, ordering the requested format first", async () => {
    const base = await runCoachAction({ id: "export_intelligence", params: {} }, ctx(), "free");
    expect(base.ok && base.result.downloads?.[0].href).toBe("/api/founder-context/intelligence-export?projectId=p1&format=json");

    const csv = await runCoachAction({ id: "export_intelligence", params: { format: "csv" } }, ctx(), "free");
    expect(csv.ok && csv.result.downloads?.[0].href).toContain("format=csv");

    const hist = await runCoachAction({ id: "export_intelligence", params: { history: true } }, ctx(), "free");
    expect(hist.ok && hist.result.downloads?.[0].href).toContain("history=true");
    expect(hist.ok && new Set(hist.result.downloads?.map((d) => d.href)).size).toBe(3); // no duplicates
  });

  it("404s when the project isn't the session user's", async () => {
    const r = await runCoachAction({ id: "export_intelligence", params: {} }, ctx({ ...okTables, projects: { data: null } }), "free");
    expect(r).toMatchObject({ ok: false, status: 404 });
    const r2 = await runCoachAction({ id: "list_backlog", params: {} }, ctx({ ...okTables, projects: { data: null } }), "free");
    expect(r2).toMatchObject({ ok: false, status: 404 });
  });

  it("runs list_backlog end to end", async () => {
    const r = await runCoachAction({ id: "list_backlog", params: {} }, ctx(), "free");
    expect(r.ok && r.result.summary).toContain("3 open tasks");
  });

  it("surfaces a failed query as an error instead of a fake-empty backlog", async () => {
    const r = await runCoachAction(
      { id: "list_backlog", params: {} },
      ctx({ ...okTables, tasks: { data: null, error: { message: 'column "notes" does not exist' } } }),
      "free",
    );
    expect(r).toMatchObject({ ok: false, status: 500 });
    expect(!r.ok && r.error).toContain('column "notes" does not exist');
  });
});

describe("registry wiring", () => {
  it("every UI chip points at a registered action and produces params that action accepts", async () => {
    for (const chip of COACH_ACTION_CHIPS) {
      expect(COACH_ACTIONS[chip.id]).toBeDefined();
      const r = await runCoachAction({ id: chip.id, params: chip.params }, { userId: "u1", projectId: "p1", admin: fakeAdmin(okTables), now: NOW, loaders }, "free");
      expect(r.ok, chip.id).toBe(true);
    }
  });

  it("everything the matcher extracts is accepted by the action schemas", async () => {
    const samples = [
      "show my open tasks on the pricing milestone", "show top 5 open tasks", "list all my tasks",
      "show my completed tasks", "export my data as csv", "download my intelligence report with history",
      "show my execution log for the last 30 days", "what did I complete this week", "export my execution history as csv",
      "show my milestones", "what signals are you seeing", "what do you believe about me", "what's my momentum", "why did you recommend that",
    ];
    for (const msg of samples) {
      const m = matchCoachAction(msg)!;
      const r = await runCoachAction({ id: m.id, params: m.params }, { userId: "u1", projectId: "p1", admin: fakeAdmin(okTables), now: NOW, loaders }, "free");
      expect(r.ok, msg).toBe(true);
    }
  });

  it("parseActionRequest only accepts well-formed payloads", () => {
    expect(parseActionRequest({ id: "list_backlog", params: { status: "open" } })).toEqual({ id: "list_backlog", params: { status: "open" } });
    expect(parseActionRequest({ id: "list_backlog" })).toEqual({ id: "list_backlog", params: {} });
    expect(parseActionRequest(null)).toBeNull();
    expect(parseActionRequest("list_backlog")).toBeNull();
    expect(parseActionRequest({ id: 5 })).toBeNull();
  });
});


describe("matchCoachAction — extended actions", () => {
  const cases: Array<[string, string, Record<string, unknown>]> = [
    ["show my execution log", "get_execution_log", {}],
    ["give me my execution record in json", "get_execution_log", { format: "json" }],
    ["export my execution history as csv", "get_execution_log", { format: "csv" }],
    ["what did I complete this week", "get_execution_log", { days: 7 }],
    ["what did I do yesterday", "get_execution_log", { days: 2 }],
    ["what have I done?", "get_execution_log", {}],
    ["show my execution log for the last 30 days", "get_execution_log", { days: 30 }],
    ["show my milestones", "list_milestones", {}],
    ["list milestones", "list_milestones", {}],
    ["how are my milestones going", "list_milestones", {}],
    ["milestone progress", "list_milestones", {}],
    ["what milestones do I have", "list_milestones", {}],
    ["what signals are you seeing", "get_signals", {}],
    ["show my signals", "get_signals", {}],
    ["any signals?", "get_signals", {}],
    ["what do you believe about me", "get_beliefs", {}],
    ["what do you know about me?", "get_beliefs", {}],
    ["what patterns have you noticed", "get_beliefs", {}],
    ["show my avoidance patterns", "get_beliefs", {}],
    ["what's my momentum", "get_momentum", {}],
    ["how is my streak", "get_momentum", {}],
    ["show my momentum score", "get_momentum", {}],
    ["how many xp do I have", "get_momentum", {}],
    ["why did you recommend that?", "get_decision_reasoning", {}],
    ["what else did you consider", "get_decision_reasoning", {}],
    ["how did you decide", "get_decision_reasoning", {}],
    ["why is that my recommendation", "get_decision_reasoning", {}],
    ["show your decision reasoning", "get_decision_reasoning", {}],
  ];
  it.each(cases)("%s → %s", (msg, id, expected) => {
    const m = matchCoachAction(msg);
    expect(m?.id).toBe(id);
    expect(m?.params).toMatchObject(expected);
  });

  it("keeps existing intents intact where phrases overlap", () => {
    // a milestone named inside a task request is a backlog filter, not a milestones request
    expect(matchCoachAction("show my open tasks on the pricing milestone")?.id).toBe("list_backlog");
    expect(matchCoachAction("export my backlog as csv")?.id).toBe("list_backlog");
    expect(matchCoachAction("export my data as csv")?.id).toBe("export_intelligence");
    expect(matchCoachAction("download my intelligence report with history")?.id).toBe("export_intelligence");
  });

  it.each([
    "what signals should I look for in customer interviews",
    "what signals do customers give when they're interested",
    "my momentum is dropping and I don't know why",
    "how is my momentum trending, I feel stuck",
    "what did I do wrong this week",
    "what did I do to deserve this",
    "why did you say that",
    "tell me about my strengths and weaknesses",
    "what am I avoiding",
    "my milestones feel impossible",
    "I need to talk about my streak, I'm frustrated",
  ])("%s → null (must reach the coach)", (msg) => {
    expect(matchCoachAction(msg)).toBeNull();
  });

  it("never intercepts the coach page's own suggested prompts", () => {
    for (const p of [
      "Am I avoiding the hardest work right now?",
      "What is the single highest-leverage move this week?",
      "Is my recent progress real or just busyness?",
      "If you were the founder, what would you do today?",
      "What behavioral patterns should I be worried about?",
    ]) expect(matchCoachAction(p), p).toBeNull();
  });
});

describe("todayFlowSessions — the shared allowlist", () => {
  it("names exactly the two prefixes Today's flow writes", () => {
    expect(isTodayFlowSession("today_action:p1:123")).toBe(true);
    expect(isTodayFlowSession("task_complete:u1:456")).toBe(true);
  });
  it("rejects every other writer of the shared table", () => {
    for (const s of ["ai_coach:u1:1", "weekly_report:u1:1", "morning_briefing:u1:1", "recovery_mode:u1:1", "bms_1_abc", "", null, undefined])
      expect(isTodayFlowSession(s as string | null | undefined), String(s)).toBe(false);
  });
  it("labels the fallback path distinctly", () => {
    expect(todayFlowSource("task_complete:u1:1")).toBe("fallback");
    expect(todayFlowSource("today_action:p1:1")).toBe("today");
  });
});

describe("shapeExecutionLog", () => {
  it("includes only Today-flow rows, inside the window, newest first", () => {
    const v = shapeExecutionLog(logRows, 7, NOW);
    expect(v.entries.map((e) => e.id)).toEqual(["l1", "l2", "l3", "l4"]);
    expect(v.entries.some((e) => e.id.startsWith("x"))).toBe(false);
  });

  it("counts outcomes and distinct completion days", () => {
    const v = shapeExecutionLog(logRows, 7, NOW);
    expect(v.counts).toEqual({ completed: 2, partial: 0, skipped: 1, ignored: 0, pending: 1 });
    expect(v.daysWithCompletion).toBe(2);
  });

  it("marks a task-complete fallback row as such so a missing shown-row is visible", () => {
    const v = shapeExecutionLog(logRows, 7, NOW);
    expect(v.entries.find((e) => e.id === "l2")?.source).toBe("fallback");
    expect(v.entries.find((e) => e.id === "l1")?.source).toBe("today");
  });

  it("windows on when it HAPPENED, so a row shown before the edge but completed inside it is kept", () => {
    const rows = [logRow("edge", "today_action:p1:1", "completed", "2026-09-20T09:00:00Z", "2026-09-27T20:00:00Z")];
    expect(shapeExecutionLog(rows, 1, NOW).entries.map((e) => e.id)).toEqual(["edge"]);
    // ...and one completed before the edge is not
    const old = [logRow("gone", "today_action:p1:1", "completed", "2026-09-20T09:00:00Z", "2026-09-21T20:00:00Z")];
    expect(shapeExecutionLog(old, 1, NOW).entries).toEqual([]);
  });

  it("maps outcomes, treating unknown/null as no outcome", () => {
    expect(["completed", "partial", "overridden", "ignored", null, "weird"].map(normalizeOutcome))
      .toEqual(["completed", "partial", "skipped", "ignored", "pending", "pending"]);
  });

  it("exports CSV with formula-injection defused", () => {
    const rows = [logRow("f", "today_action:p1:1", "completed", "2026-09-27T09:00:00Z", "2026-09-27T09:30:00Z", "=SUM(A1:A9)")];
    const csv = executionLogToCSV(shapeExecutionLog(rows, 7, NOW).entries);
    expect(csv.split("\n")[0]).toBe("when,outcome,action,category,source,shown_at,outcome_recorded_at,note");
    expect(csv).toContain("'=SUM(A1:A9)");
  });
});

describe("shapeMilestones", () => {
  it("counts real task progress and days to target in roadmap order", () => {
    const p = shapeMilestones(milestones, tasks, NOW);
    expect(p.map((m) => m.title)).toEqual(["Customer Validation", "Pricing Experiments"]);
    expect(p[0]).toMatchObject({ total: 2, done: 1, open: 1, daysToTarget: -3 }); // overdue by 3
    expect(p[1]).toMatchObject({ total: 2, done: 0, open: 2, daysToTarget: 10 });
  });
  it("handles a milestone with no target date or tasks", () => {
    const p = shapeMilestones([{ id: "m9", title: "Empty", status: "pending", created_at: "2026-09-01T00:00:00Z" }], [], NOW);
    expect(p[0]).toMatchObject({ total: 0, done: 0, daysToTarget: null, targetDate: null });
  });
});

describe("intelligence result builders", () => {
  it("signals: most severe first, real counts, evidence counts, recommended response", () => {
    const r = buildSignalsResult(fakeMirror.signals, 6);
    expect(r.rows?.map((x) => x.badge)).toEqual(["high", "medium"]);
    expect(r.summary).toBe("2 active signals — 1 high-severity.");
    expect(r.rows?.[0].secondary).toContain("2 evidence items");
    expect(r.rows?.[0].detail).toBe("→ Ship one small piece today.");
    expect(r.stats).toContainEqual({ label: "Avg confidence", value: "70%" });
  });
  it("signals: says so when there are none, and honors the limit", () => {
    expect(buildSignalsResult([], 6).summary).toMatch(/isn't flagging any active signals/);
    expect(buildSignalsResult(fakeMirror.signals, 1).note).toBe("Showing 1 of 2, most severe first.");
  });

  it("decision: chosen pick first with its reason, alternatives with gaps", () => {
    const r = buildDecisionResult(fakeMirror.decision);
    expect(r.rows?.[0]).toMatchObject({ badge: "chosen · 82", detail: "Why it won: It produced evidence the last 3 times you did it." });
    expect(r.rows?.slice(1).map((x) => x.badge)).toEqual(["−12", "−27"]);
    expect(r.stats).toContainEqual({ label: "Closest runner-up", value: "−12" });
    expect(r.summary).toContain("2 alternatives scored lower");
  });
  it("decision: no recommendation means nothing to compare", () => {
    expect(buildDecisionResult({ top: null, alternatives: [] }).summary).toMatch(/no active recommendation/);
  });

  it("beliefs: sorted by confidence, shows corrections and evidence, notes suppressed ones", () => {
    const r = buildBeliefsResult(fakeMirror.beliefs, fakeMirror.suppressed_beliefs, 8);
    expect(r.rows?.map((x) => x.badge)).toEqual(["72%", "40%"]);
    expect(r.rows?.[0].detail).toBe("Based on 3 logged actions");
    expect(r.rows?.[1].detail).toBe("Softened by 1 correction: 70% → 40%");
    expect(r.note).toContain("You avoid cold outreach");
    expect(r.note).toContain("correct any of them in Founder Mirror");
    expect(r.stats).toContainEqual({ label: "Corrected by you", value: "2" });
  });
  it("beliefs: honest when there is no history", () => {
    expect(buildBeliefsResult([], [], 8).summary).toMatch(/enough history/);
  });

  it("momentum: reads only scorecard fields, describes direction and streak", () => {
    const r = buildMomentumResult(fakeScorecard);
    expect(r.summary).toBe("Momentum is 34 (Low), up 14 from a week ago. 1 day streak.");
    expect(r.stats).toContainEqual({ label: "vs last week", value: "+14" });
    const noBaseline = buildMomentumResult({ ...fakeScorecard, momentumDelta: null, streak: 0, isDecaying: true } as FounderScorecard);
    expect(noBaseline.summary).toBe("Momentum is 34 (Low), no week-ago baseline yet. No active streak. It's currently decaying.");
  });
});

describe("runCoachAction — extended actions", () => {
  const ctx = (tables: Record<string, { data: unknown; error?: { message: string } | null }> = okTables) =>
    ({ userId: "u1", projectId: "p1", admin: fakeAdmin(tables), now: NOW, loaders });

  it("runs each new action end to end", async () => {
    for (const id of ["get_signals", "get_decision_reasoning", "get_beliefs", "get_momentum", "list_milestones", "get_execution_log"] as const) {
      const r = await runCoachAction({ id, params: {} }, ctx(), "free");
      expect(r.ok, id).toBe(true);
      expect(r.ok && r.result.actionId, id).toBe(id);
    }
  });

  it("intelligence actions refuse a project the session user doesn't own", async () => {
    for (const id of ["get_signals", "get_decision_reasoning", "get_beliefs"] as const) {
      const r = await runCoachAction({ id, params: {} }, ctx({ ...okTables, projects: { data: null } }), "free");
      expect(r, id).toMatchObject({ ok: false, status: 404 });
    }
  });

  it("execution log: only Today rows, correct counts, downloads ordered by requested format", async () => {
    const r = await runCoachAction({ id: "get_execution_log", params: { days: 7, format: "csv" } }, ctx(), "free");
    expect(r.ok && r.result.stats?.find((s) => s.label === "Completed")?.value).toBe("2");
    expect(r.ok && r.result.rows?.length).toBe(4);
    expect(r.ok && r.result.downloads?.[0].href).toBe("/api/founder-context/execution-log-export?days=7&format=csv");
  });

  it("execution log: reports an empty window honestly instead of fabricating rows", async () => {
    const r = await runCoachAction({ id: "get_execution_log", params: { days: 1 } }, ctx({ ...okTables, reflexion_learning_log: { data: [] } }), "free");
    expect(r.ok && r.result.summary).toBe("No Today actions were logged in the last day.");
  });

  it("execution log: a failed query is an error, not an empty log", async () => {
    const r = await runCoachAction({ id: "get_execution_log", params: {} }, ctx({ ...okTables, reflexion_learning_log: { data: null, error: { message: "boom" } } }), "free");
    expect(r).toMatchObject({ ok: false, status: 500 });
  });

  it("validates new params and drops identifiers", async () => {
    expect(await runCoachAction({ id: "get_execution_log", params: { days: 500 } }, ctx(), "free")).toMatchObject({ ok: false, status: 400 });
    expect(await runCoachAction({ id: "get_signals", params: { limit: 0 } }, ctx(), "free")).toMatchObject({ ok: false, status: 400 });
    const r = await runCoachAction({ id: "get_signals", params: { userId: "victim", projectId: "p9" } }, ctx(), "free");
    expect(r.ok).toBe(true);
  });

  it("milestones: overdue and progress come from real dates and tasks", async () => {
    const r = await runCoachAction({ id: "list_milestones", params: {} }, ctx(), "free");
    expect(r.ok && r.result.summary).toContain("1 milestone past target date");
    expect(r.ok && r.result.rows?.[0].secondary).toBe("1 of 2 tasks done · overdue by 3 days");
    expect(r.ok && r.result.rows?.[0].badge).toBe("in progress");
  });
});
