import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeDb } from "../helpers/fakeAdmin";

const UID = "0b328401-d620-482e-87b6-a2ad032cd683";
const PID = "3c952be8-0da3-4683-9ece-ce33257225ac";

const h = vi.hoisted(() => ({ db: null as unknown, model: vi.fn(), search: vi.fn(), gate: vi.fn(async () => null as unknown) }));

vi.mock("@/app/api/ai/_planCheck", () => ({ getRouteUser: async () => ({ ok: true, userId: "0b328401-d620-482e-87b6-a2ad032cd683", plan: "free" }) }));
vi.mock("@/app/api/ai/_usageGate", () => ({ gateAIUsage: (...a: unknown[]) => h.gate(...(a as [])) }));
vi.mock("@/app/api/ai/_utils", () => ({ hasAdminEnv: () => true }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.db }));
vi.mock("@/lib/ai-providers", () => ({ callModelJSON: (...a: unknown[]) => h.model(...a) }));
vi.mock("@/lib/search", () => ({ webSearch: (...a: unknown[]) => h.search(...a) }));
vi.mock("@/lib/server/founderSnapshot", () => ({ getFounderSnapshot: async () => ({ streak: 3, activeDaysThisWeek: 4 }) }));

import { POST as prep } from "@/app/api/ai/prep/route";
import { POST as record } from "@/app/api/ai/prep/record/route";
import { POST as reply } from "@/app/api/ai/prep/reply/route";
import { POST as notes } from "@/app/api/ai/prep/notes/route";
import { POST as correct } from "@/app/api/ai/prep/correct/route";
import { POST as link } from "@/app/api/ai/prep/link/route";
import type { FakeDb as Db } from "../helpers/fakeAdmin";

const req = (body: unknown) => new Request("http://x/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const json = async (r: Response) => ({ status: r.status, body: await r.json() });
const db = () => h.db as Db;

const OUTREACH = { variants: [
  { label: "Personal", text: "Hi Sam, saw your post on how you plan your week. What did you do the last time a plan fell apart mid-week?", why: "opens on them" },
  { label: "Curious", text: "Hi Sam, I read your note on shipping every Friday. How do you decide what gets dropped when a week goes wrong?", why: "asks about a decision" },
  { label: "Direct", text: "Hi Sam, I'm researching how solo founders pick their next task. Could I ask you two questions about your last week?", why: "clear ask" },
], sections: [{ heading: "Before you send", bullets: ["Pick someone who posted about planning this month.", "Quote one line from their post."] }], title: "Outreach", summary: "Three openers." };

beforeEach(() => {
  h.db = new FakeDb({ projects: [{ id: PID, user_id: UID, name: "BuildMind", description: "Daily execution system for solo founders", problem: "Founders lose momentum", target_users: "solo founders", startup_stage: "Growth", updated_at: "2026-10-19" }] });
  h.model.mockReset(); h.search.mockReset(); h.gate.mockReset(); h.gate.mockResolvedValue(null);
  h.search.mockResolvedValue({ results: [], scraped: false, provider: "none" });
});

describe("POST /api/ai/prep", () => {
  it("prepares outreach drafts, saves them, and serves the same ones from cache", async () => {
    h.model.mockResolvedValue(OUTREACH);
    const r = await json(await prep(req({ task: "Send a personalized WhatsApp message to a founder to book a 15 minute call", missionKind: "outreach", projectId: PID })));
    expect(r.status).toBe(200);
    expect(r.body.prep.kind).toBe("outreach");
    expect(r.body.prep.prepared.variants).toHaveLength(3);
    expect(db().rows("prepared_work")).toHaveLength(1);
    const calls = h.model.mock.calls.length;
    const again = await json(await prep(req({ task: "Send a personalized WhatsApp message to a founder to book a 15 minute call", missionKind: "outreach", projectId: PID })));
    expect(again.body.prep.cached).toBe(true);
    expect(again.body.prep.id).toBe(r.body.prep.id);
    expect(h.model.mock.calls.length).toBe(calls);
  });

  it("covers every task kind with something to show", async () => {
    h.model.mockResolvedValue({ title: "x", summary: "s", variants: OUTREACH.variants, sections: [{ heading: "Smallest version", body: "Ship the toggle only." }, { heading: "Steps", bullets: ["a", "b", "c"] }] });
    const tasks: Array<[string, string | null]> = [
      ["Rewrite the landing page headline", null], ["Write an SEO brief for founder drift", null], ["Send the October investor update", null],
      ["Record a 30 second demo video", null], ["Build the export button", "build"], ["Launch on Show HN", null], ["Share one lesson from this week", "publish"],
    ];
    for (const [task, mk] of tasks) {
      const r = await json(await prep(req({ task, missionKind: mk, projectId: PID })));
      expect(r.status, task).toBe(200);
      expect(r.body.prep, `no panel for: ${task}`).not.toBeNull();
    }
  });

  it("never returns nothing: if the model is down the founder still gets a starting structure, and it is retried next time", async () => {
    h.model.mockRejectedValue(new Error("model down"));
    const task = "Send a personalized WhatsApp message to a founder";
    const r = await json(await prep(req({ task, missionKind: "outreach", projectId: PID })));
    expect(r.body.prep).not.toBeNull();
    expect(r.body.prep.prepared.degraded).toBe(true);
    expect(r.body.prep.prepared.sections.length).toBeGreaterThan(0);
    h.model.mockResolvedValue(OUTREACH);
    const again = await json(await prep(req({ task, missionKind: "outreach", projectId: PID })));
    expect(again.body.prep.cached).toBe(false);
    expect(again.body.prep.prepared.degraded).toBeFalsy();
    expect(again.body.prep.prepared.variants).toHaveLength(3);
  });

  it("gives every task an action plan, including rest days and tasks that match no specific kind", async () => {
    h.model.mockResolvedValue({ title: "Plan", summary: "s", variants: [], sections: [{ heading: "First move", body: "Open the notes." }, { heading: "Steps", bullets: ["a", "b", "c"] }] });
    for (const [task, mk] of [["Tidy your task list and close old tabs", "reset"], ["Think about the next quarter", null]] as Array<[string, string | null]>) {
      const r = await json(await prep(req({ task, missionKind: mk, projectId: PID })));
      expect(r.body.prep.kind).toBe("action_plan");
    }
  });

  it("says the migration is missing when the table does not exist", async () => {
    db().failTables.add("prepared_work");
    h.model.mockResolvedValue(OUTREACH);
    const r = await json(await prep(req({ task: "Send a personalized WhatsApp message to a founder", missionKind: "outreach", projectId: PID })));
    expect(r.body.reason).toBe("setup");
    expect(r.body.prep.id).toBeNull();
    expect(r.body.prep.prepared.variants).toHaveLength(3);
  });

  it("passes the AI-budget block through", async () => {
    h.gate.mockResolvedValue(new Response(JSON.stringify({ ok: false, error: "limit" }), { status: 429 }));
    const r = await json(await prep(req({ task: "Send a personalized WhatsApp message to a founder", missionKind: "outreach", projectId: PID })));
    expect(r.status).toBe(429);
  });
});

describe("record, reply, notes, correct, link", () => {
  async function prepared(task = "Send a personalized WhatsApp message to a founder", mk: string | null = "outreach") {
    h.model.mockResolvedValue(OUTREACH);
    const r = await json(await prep(req({ task, missionKind: mk, projectId: PID })));
    return r.body.prep.id as string;
  }

  it("records edits, sending and a result, and computes the edit ratio", async () => {
    const id = await prepared();
    const edited = await json(await record(req({ id, event: "edited", variantId: "v1", finalText: "Hi Sam, quick one: what did you do last time your plan fell apart mid-week?" })));
    expect(edited.body.ok).toBe(true);
    expect(edited.body.editRatio).toBeGreaterThan(0);
    await record(req({ id, event: "sent", finalText: "Hi Sam, quick one: what did you do last time your plan fell apart mid-week?" }));
    const out = await json(await record(req({ id, event: "outcome", outcome: "replied" })));
    expect(out.body.ok).toBe(true);
    const row = db().rows("prepared_work")[0];
    expect(row.status).toBe("sent"); expect(row.outcome).toBe("replied"); expect(row.final_text).toContain("quick one");
  });

  it("refuses a result before the draft was used", async () => {
    const id = await prepared();
    const r = await json(await record(req({ id, event: "outcome", outcome: "replied" })));
    expect(r.status).toBe(409);
  });

  it("drafts a reply, verifies the quote, and records that they replied", async () => {
    const id = await prepared();
    await record(req({ id, event: "sent", finalText: "Hi Sam, what did you do the last time a plan fell apart?" }));
    h.model.mockResolvedValue({ read: "question", summary: "Asks how it differs from a spreadsheet.", quote: "we already use a spreadsheet", reply: "Fair question. A spreadsheet shows the plan; BuildMind shows what you skipped. Want to see one real example?", nextStep: "Send an example." });
    const r = await json(await reply(req({ id, mode: "reply", theirReply: "Sounds ok but we already use a spreadsheet for this." })));
    expect(r.status).toBe(200);
    expect(r.body.assist.quote).toBe("we already use a spreadsheet");
    expect(db().rows("prepared_work")[0].outcome).toBe("replied");
  });

  it("drafts a follow-up when nobody answered", async () => {
    const id = await prepared();
    await record(req({ id, event: "sent", finalText: "Hi Sam, what did you do the last time a plan fell apart?" }));
    h.model.mockResolvedValue({ read: "unclear", summary: "", quote: "", reply: "Sam, one more angle: is it the planning or the following through that breaks first for you?", nextStep: "Send it in 3 days." });
    const r = await json(await reply(req({ id, mode: "followup" })));
    expect(r.status).toBe(200);
    expect(r.body.assist.reply).toContain("one more angle");
  });

  it("reads interview notes with verified quotes", async () => {
    const id = await prepared("Talk to 3 founders about how they pick tasks", "interview");
    const text = "Last month I paid for three planners and quit all of them. I would probably use something simpler if it existed. We tried a spreadsheet for two weeks.";
    h.model.mockResolvedValue({ themes: [{ theme: "Abandoned tools", quote: "Last month I paid for three planners and quit all of them." }, { theme: "Fake", quote: "I would pay 500 dollars right now" }], surprise: "", nextQuestion: "What did you switch to?" });
    const r = await json(await notes(req({ id, notes: text })));
    expect(r.status).toBe(200);
    expect(r.body.read.themes).toHaveLength(1);
  });

  it("runs the Studio correction on a message", async () => {
    const id = await prepared();
    h.model.mockResolvedValue({ insight: "Ask about behaviour.", working: [], weakening: [{ point: "Opens with the product", quote: "Hi Sam" }], revisions: [{ approach: "personal", text: "Sam, what did you do last time a plan fell apart?", why: "specific", hypothesis: "h", metric: "m", changeIf: "c" }], followUps: [] });
    const r = await json(await correct(req({ id, text: "Hi Sam, I am building BuildMind, a daily execution system for founders. Want a demo?" })));
    expect(r.status).toBe(200);
    expect(r.body.diagnosis).toBeTruthy();
  });

  it("saves a video link", async () => {
    const id = await prepared("Record a 30 second demo video", null);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ title: "BuildMind demo" }), { status: 200 })));
    const r = await json(await link(req({ id, url: "https://www.loom.com/share/0123456789abcdef0123456789abcdef" })));
    vi.unstubAllGlobals();
    expect(r.status).toBe(200);
    expect(r.body.recorded.title).toBe("BuildMind demo");
    expect((db().rows("prepared_work")[0].payload as { recorded?: unknown }).recorded).toBeTruthy();
  });
});
