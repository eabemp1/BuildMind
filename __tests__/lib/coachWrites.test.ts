import { describe, it, expect } from "vitest";
import { parseCoachWrite, rankTasks, pickTask } from "@/lib/coachWrites/parse";
import { activeMilestoneId, ProposalSchema } from "@/lib/coachWrites/server";

describe("parseCoachWrite", () => {
  it("adds a task", () => {
    expect(parseCoachWrite("add task: email 5 founders")).toEqual({ kind: "add_task", title: "email 5 founders" });
    expect(parseCoachWrite("Please add a new task to my list - fix pricing page")).toEqual({ kind: "add_task", title: "fix pricing page" });
    expect(parseCoachWrite("create a task called Post on Reddit")).toEqual({ kind: "add_task", title: "Post on Reddit" });
  });
  it("marks done and blocked", () => {
    expect(parseCoachWrite("mark the pricing task as done")).toEqual({ kind: "set_task", query: "pricing", outcome: "done" });
    expect(parseCoachWrite("I finished the landing page copy")).toEqual({ kind: "set_task", query: "landing page copy", outcome: "done" });
    expect(parseCoachWrite("set outreach to blocked")).toEqual({ kind: "set_task", query: "outreach", outcome: "blocked" });
    expect(parseCoachWrite("I'm blocked on the stripe setup")).toEqual({ kind: "set_task", query: "stripe setup", outcome: "blocked" });
  });
  it("logs outreach", () => {
    expect(parseCoachWrite("log that Sam replied and wants a demo")).toEqual({ kind: "log_outreach", text: "Sam replied and wants a demo" });
  });
  it("ignores questions and ordinary chat", () => {
    expect(parseCoachWrite("how do I add a task?")).toBeNull();
    expect(parseCoachWrite("what should I do about pricing")).toBeNull();
    expect(parseCoachWrite("I finished")).toBeNull();
    expect(parseCoachWrite("add task")).toBeNull();
    expect(parseCoachWrite("x".repeat(500))).toBeNull();
  });
});

describe("task matching", () => {
  const tasks = [
    { id: "1", title: "Draft landing page copy for TikTok" },
    { id: "2", title: "Email 5 founders about pricing" },
    { id: "3", title: "Landing page analytics check" },
  ];
  it("picks a clear winner", () => {
    expect(pickTask(rankTasks("pricing", tasks)).task?.id).toBe("2");
  });
  it("reports ambiguity instead of guessing", () => {
    const r = pickTask(rankTasks("landing page", tasks));
    expect(r.task).toBeNull();
    expect(r.ambiguous).toBe(true);
  });
  it("finds nothing for unrelated text", () => {
    expect(pickTask(rankTasks("quarterly taxes", tasks))).toEqual({ task: null, ambiguous: false });
  });
});

describe("server helpers", () => {
  it("puts new tasks in the first open milestone", () => {
    expect(activeMilestoneId([{ id: "a", status: "completed" }, { id: "b", status: "in_progress" }])).toBe("b");
    expect(activeMilestoneId([{ id: "a", status: "completed" }])).toBe("a");
    expect(activeMilestoneId([])).toBeNull();
  });
  it("rejects malformed proposals", () => {
    expect(ProposalSchema.safeParse({ kind: "set_task", taskId: "nope", outcome: "done" }).success).toBe(false);
    expect(ProposalSchema.safeParse({ kind: "delete_task", taskId: "x" }).success).toBe(false);
    expect(ProposalSchema.safeParse({ kind: "add_task", title: "ok task" }).success).toBe(true);
  });
});

describe("reminders", () => {
  it("parses time and subject in either order", () => {
    expect(parseCoachWrite("remind me tomorrow to email Sam")).toEqual({ kind: "remind", text: "email Sam", choice: "1d" });
    expect(parseCoachWrite("remind me to post the thread in 3 days")).toEqual({ kind: "remind", text: "post the thread", choice: "3d" });
    expect(parseCoachWrite("remind me next week to review pricing")).toEqual({ kind: "remind", text: "review pricing", choice: "1w" });
    expect(parseCoachWrite("remind me to check analytics")).toEqual({ kind: "remind", text: "check analytics", choice: "1d" });
  });
  it("needs something to be reminded about", () => {
    expect(parseCoachWrite("remind me tomorrow")).toBeNull();
  });
});

import { UndoSchema } from "@/lib/coachWrites/server";
import { prepLoopFor } from "@/lib/radar/prepLoop";
import { weeklyNote } from "@/lib/weeklyNote";

describe("undo, prep reminder and weekly note", () => {
  it("undo accepts only ids and known kinds", () => {
    expect(UndoSchema.safeParse({ kind: "remove_task", taskId: "7b0c1c0e-8c2f-4a39-9f5e-1d2b3c4d5e6f" }).success).toBe(true);
    expect(UndoSchema.safeParse({ kind: "remove_task", taskId: "not-a-uuid" }).success).toBe(false);
    expect(UndoSchema.safeParse({ kind: "drop_table" }).success).toBe(false);
  });
  it("an event far enough away gets a prep reminder two days before; a near one does not", () => {
    const now = Date.parse("2026-10-27T10:00:00Z");
    const r = prepLoopFor({ type: "event", title: "Demo day", starts_at: "2026-11-05T09:00:00Z" }, now);
    expect(r?.due_at).toBe("2026-11-03T09:00:00.000Z");
    expect(prepLoopFor({ type: "event", title: "Demo day", starts_at: "2026-10-28T09:00:00Z" }, now)).toBeNull();
    expect(prepLoopFor({ type: "program", title: "Grant", starts_at: "2026-11-05T09:00:00Z" }, now)).toBeNull();
  });
  it("the weekly note is silent with no activity and honest about the change", () => {
    expect(weeklyNote({ done: 0, prevDone: 0, radarActed: 0 })).toBeNull();
    expect(weeklyNote({ done: 5, prevDone: 3, radarActed: 1 })).toBe("You closed 5 tasks in the last 7 days, 2 more than the week before. You acted on 1 Radar item.");
    expect(weeklyNote({ done: 1, prevDone: 4, radarActed: 0 })).toContain("3 fewer");
  });
});
