import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeDb } from "../helpers/fakeAdmin";

const UID = "0b328401-d620-482e-87b6-a2ad032cd683";
const h = vi.hoisted(() => ({ db: null as unknown, model: vi.fn() }));
vi.mock("@/app/api/ai/_planCheck", () => ({ getRouteUser: async () => ({ ok: true, userId: "0b328401-d620-482e-87b6-a2ad032cd683", plan: "free" }) }));
vi.mock("@/app/api/ai/_usageGate", () => ({ gateAIUsage: async () => null }));
vi.mock("@/app/api/ai/_utils", () => ({ hasAdminEnv: () => true }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.db }));
vi.mock("@/lib/ai-providers", () => ({ callModelJSON: (...a: unknown[]) => h.model(...a) }));
vi.mock("@/lib/server/rateLimit", () => ({ rateLimitAsync: async () => ({ ok: true }), getClientIp: () => "1.1.1.1" }));

import { GET, POST, PATCH } from "@/app/api/radar/route";
import { POST as prep } from "@/app/api/radar/prep/route";
import type { FakeDb as Db } from "../helpers/fakeAdmin";

const call = (m: (r: Request) => Promise<Response>, body: unknown, url = "http://x/api/radar") => m(new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const db = () => h.db as Db;

const GRANT_TEXT = "Africa Founders Grant. Non-dilutive funding for early-stage solo founders building tools. Applications close on 30 November 2026. Open to founders based in Africa.";
const future = () => new Date(Date.now() + 4 * 86400000);

beforeEach(() => {
  h.db = new FakeDb({ projects: [{ id: "3c952be8-0da3-4683-9ece-ce33257225ac", user_id: UID, name: "BuildMind", description: "Daily execution system for solo founders", problem: "Founders lose momentum", target_users: "solo founders", startup_stage: "Growth", updated_at: "2026-10-19" }] });
  h.model.mockReset();
});

describe("radar routes", () => {
  it("adds a grant, keeps only supported fields, and does not ask about a clear kind", async () => {
    h.model.mockResolvedValue({ title: "Africa Founders Grant", organizer: "", deadline_at: "2026-11-30", eligibility: "Open to founders based in Africa", quotes: { deadline_at: "Applications close on 30 November 2026", eligibility: "Open to founders based in Africa", location: "Lagos" }, location: "Lagos" });
    const r = await call(POST, { text: GRANT_TEXT });
    const b = await r.json();
    expect(r.status).toBe(200);
    expect(b.item.kind).toBe("grant"); expect(b.item.type).toBe("program");
    expect(b.item.deadline_at).toContain("2026-11-30");
    expect(b.item.location).toBeNull();                      // quote "Lagos" is not in the source
    expect(b.dropped.join(" ")).toMatch(/location/);
    expect(b.ask_kind).toBeNull();
    expect(b.item.next_move).toMatch(/Apply by/);
    expect(b.item.ics).toContain("BEGIN:VEVENT");
  });

  it("drops a date that disagrees with its quote", async () => {
    h.model.mockResolvedValue({ title: "Founder Summit", starts_at: "2026-12-05", quotes: { starts_at: "on 30 November 2026" } });
    const b = await (await call(POST, { text: "Founder Summit conference with keynotes and a forum. Takes place on 30 November 2026." })).json();
    expect(b.item.starts_at).toBeNull();
  });

  it("asks the founder when the kind is unclear, then PATCH confirms and retypes it", async () => {
    h.model.mockResolvedValue({ title: "Come along" });
    const b = await (await call(POST, { text: "Come along on Thursday, it will be good." })).json();
    expect(b.ask_kind).not.toBeNull();
    const id = b.item.id as string;
    expect((await call(PATCH, { id, kind: "hackathon" })).status).toBe(200);
    const row = db().rows("radar_items").find((r) => r.id === id)!;
    expect(row.kind).toBe("hackathon"); expect(row.type).toBe("event"); expect(row.kind_confirmed).toBe(true);
  });

  it("lists ranked items and picks only confirmed, near, worthwhile ones for Today", async () => {
    const soon = future().toISOString();
    db().rows("radar_items").push(
      { id: "a1111111-1111-4111-8111-111111111111", user_id: UID, type: "program", kind: "grant", kind_confirmed: true, title: "Grant for solo founders tools", status: "new", deadline_at: soon, is_virtual: false },
      { id: "b1111111-1111-4111-8111-111111111111", user_id: UID, type: "event", kind: "meetup", kind_confirmed: false, title: "Unsure thing", status: "new", starts_at: soon, is_virtual: true },
      { id: "c1111111-1111-4111-8111-111111111111", user_id: UID, type: "event", kind: "conference", kind_confirmed: true, title: "Old summit", status: "new", starts_at: "2026-01-01T00:00:00Z", is_virtual: false },
      { id: "d1111111-1111-4111-8111-111111111111", user_id: UID, type: "event", kind: "webinar", kind_confirmed: true, title: "Dismissed", status: "dismissed", starts_at: soon, is_virtual: true },
    );
    const all = await (await GET(new Request("http://x/api/radar"))).json();
    expect(all.items.map((i: { title: string }) => i.title)).not.toContain("Dismissed");
    const today = await (await GET(new Request("http://x/api/radar?today=1"))).json();
    expect(today.items.map((i: { title: string }) => i.title)).toEqual(["Grant for solo founders tools"]);
  });

  it("reports setup when the table is missing", async () => {
    db().failTables.add("radar_items");
    const b = await (await GET(new Request("http://x/api/radar"))).json();
    expect(b.reason).toBe("setup");
  });

  it("prepares, caches, and falls back when the model is unusable", async () => {
    db().rows("radar_items").push({ id: "e1111111-1111-4111-8111-111111111111", user_id: UID, type: "meeting", kind: "meeting", kind_confirmed: true, title: "Call with Sam", status: "new", is_virtual: true, meeting_url: "https://meet.google.com/x" });
    h.model.mockResolvedValue({ why_it_fits: "Sam knows founders.", questions: ["What do you do when a plan breaks mid-week?"], intro: "Hi Sam, I build a daily planning tool for solo founders and would value your view.", ask: "Ten minutes of advice" });
    const p1 = await (await call(prep, { id: "e1111111-1111-4111-8111-111111111111" })).json();
    expect(p1.prep.intro).toMatch(/Hi Sam/);
    const p2 = await (await call(prep, { id: "e1111111-1111-4111-8111-111111111111" })).json();
    expect(p2.cached).toBe(true);
    h.model.mockRejectedValue(new Error("down"));
    const p3 = await (await call(prep, { id: "e1111111-1111-4111-8111-111111111111", regenerate: true })).json();
    expect(p3.prep.questions.length).toBeGreaterThan(0);
  });
});
