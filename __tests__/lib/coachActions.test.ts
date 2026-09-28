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
  backlogToCSV,
  type BacklogMilestone,
  type BacklogTaskRow,
} from "@/lib/coachActions/backlog";

const NOW = new Date("2026-09-28T00:00:00Z");

const milestones: BacklogMilestone[] = [
  { id: "m1", title: "Customer Validation", status: "active", created_at: "2026-09-01T00:00:00Z" },
  { id: "m2", title: "Pricing Experiments", status: "planned", created_at: "2026-09-10T00:00:00Z" },
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
      for (const m of ["select", "eq", "in", "order", "limit"]) b[m] = () => b;
      b.maybeSingle = () =>
        Promise.resolve({ data: Array.isArray(res.data) ? res.data[0] ?? null : res.data, error: res.error ?? null });
      b.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: res.data, error: res.error ?? null }).then(resolve);
      return b;
    },
  } as unknown as SupabaseClient;
}

const okTables = {
  projects: { data: { id: "p1" } },
  milestones: { data: milestones },
  tasks: { data: tasks },
};

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
    ["give me my execution record in json", {}],
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
      const r = await runCoachAction({ id: chip.id, params: chip.params }, { userId: "u1", projectId: "p1", admin: fakeAdmin(okTables), now: NOW }, "free");
      expect(r.ok).toBe(true);
    }
  });

  it("everything the matcher extracts is accepted by the action schemas", async () => {
    const samples = [
      "show my open tasks on the pricing milestone", "show top 5 open tasks", "list all my tasks",
      "show my completed tasks", "export my data as csv", "download my intelligence report with history",
    ];
    for (const msg of samples) {
      const m = matchCoachAction(msg)!;
      const r = await runCoachAction({ id: m.id, params: m.params }, { userId: "u1", projectId: "p1", admin: fakeAdmin(okTables), now: NOW }, "free");
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
