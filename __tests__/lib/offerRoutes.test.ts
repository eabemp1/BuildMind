import { describe, it, expect, vi, beforeEach } from "vitest";

// ── a tiny in-memory database: just enough of the query builder the route uses ──
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const writes: Array<{ table: string; op: string }> = [];
let seq = 0;
function from(table: string) {
  db[table] ??= [];
  const filters: Array<(r: Row) => boolean> = [];
  let op: "select" | "insert" | "update" | "delete" = "select";
  let payload: Row = {};
  let lim = 1000;
  let order: { col: string; asc: boolean } | null = null;
  const run = () => {
    let rows = db[table].filter((r) => filters.every((f) => f(r)));
    if (op === "insert") { const r = { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`, created_at: new Date(Date.now() + seq).toISOString(), ...payload }; db[table].push(r); writes.push({ table, op }); return [r]; }
    if (op === "update") { rows.forEach((r) => Object.assign(r, payload)); writes.push({ table, op }); return rows; }
    if (op === "delete") { db[table] = db[table].filter((r) => !rows.includes(r)); writes.push({ table, op }); return rows; }
    if (order) rows = [...rows].sort((a, b) => (String(a[order!.col]) < String(b[order!.col]) ? -1 : 1) * (order!.asc ? 1 : -1));
    return rows.slice(0, lim);
  };
  const b: Record<string, unknown> = {
    select: () => b, order: (col: string, o?: { ascending?: boolean }) => { order = { col, asc: o?.ascending !== false }; return b; }, limit: (n: number) => { lim = n; return b; },
    insert: (p: Row) => { op = "insert"; payload = p; return b; }, update: (p: Row) => { op = "update"; payload = p; return b; }, delete: () => { op = "delete"; return b; },
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; }, neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return b; },
    is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return b; }, gte: () => b,
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }), single: async () => ({ data: run()[0] ?? null, error: null }),
    then: (res: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: run(), error: null }).then(res),
  };
  return b;
}


const counts: Array<{ slug: string; kind: string }> = [];
vi.mock("@/app/api/ai/_usageGate", () => ({ gateAIUsage: vi.fn(async () => null) }));
let user: { userId: string; plan: string } | null = { userId: "u1", plan: "builder" };
vi.mock("@/app/api/ai/_planCheck", () => ({ getRouteUser: vi.fn(async () => user) }));
vi.mock("@/app/api/ai/_utils", async (orig) => ({ ...(await orig<typeof import("@/app/api/ai/_utils")>()), hasAdminEnv: () => true }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from, rpc: async (_n: string, a: { p_slug: string; p_kind: string }) => { counts.push({ slug: a.p_slug, kind: a.p_kind }); return { error: null }; } }) }));
vi.mock("@/lib/ai-providers", () => ({
  callModelJSON: vi.fn(async () => ({ headline: "Stop copying numbers between sheets", subhead: "A calmer Sunday", offer: "We will set up one simple sheet for your first month.", who_for: "New runners", faqs: [{ q: "How long?", a: "About a day." }], cta_kind: "pilot" })),
}));

const QUOTE = "I spend two hours every Sunday copying numbers between sheets";
const PID = "11111111-1111-4111-8111-111111111111";
const json = (url: string, method: string, body?: unknown) => new Request(`http://t${url}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  counts.length = 0; user = { userId: "u1", plan: "builder" };
  db.projects = [{ id: "p1", user_id: "u1", name: "PlayForge", description: "Quests that keep new runners consistent", problem: "Runners quit in week two", target_users: "New runners", startup_stage: "Idea", updated_at: "2026" }];
  db.conversation_people = [{ id: PID, user_id: "u1", project_id: null, notes: `They said: "${QUOTE}". Also other things.`, insights: [{ point: "Spends Sundays on spreadsheets", quote: QUOTE }] }];
});

describe("quote to offer page", () => {
  it("a draft cannot be made until the founder approves the quote", async () => {
    const { POST } = await import("@/app/api/offers/route");
    const r = await POST(json("/api/offers", "POST", { personId: PID, index: 0 }));
    expect(r.status).toBe(409);
    expect(db.offer_pages ?? []).toHaveLength(0);
  });

  it("approve, draft, refuse to publish without a contact, publish, then count a click", async () => {
    const { POST: approve } = await import("@/app/api/conversations/approve/route");
    expect((await approve(json("/api/conversations/approve", "POST", { id: PID, index: 0, approved: true }))).status).toBe(200);
    expect((db.conversation_people[0].insights as Array<{ approved?: boolean }>)[0].approved).toBe(true);

    const { POST } = await import("@/app/api/offers/route");
    const made = await (await POST(json("/api/offers", "POST", { personId: PID, index: 0 }))).json();
    expect(made.ok).toBe(true);
    expect(made.page.status).toBe("draft");
    expect(made.page.content.quote).toBe(QUOTE);
    expect(made.page.content.contact).toBe("");

    const { PATCH } = await import("@/app/api/offers/[id]/route");
    const id = made.page.id as string;
    const ctx = { params: Promise.resolve({ id }) };
    const blocked = await PATCH(json(`/api/offers/${id}`, "PATCH", { action: "publish" }), ctx);
    expect(blocked.status).toBe(422);
    expect(db.offer_pages[0].status).toBe("draft");

    const ok = await (await PATCH(json(`/api/offers/${id}`, "PATCH", { action: "publish", content: { contact: "me@example.com" } }), ctx)).json();
    expect(ok.page.status).toBe("published");

    const { GET } = await import("@/app/o/[slug]/go/route");
    const res = await GET(new Request("http://t"), { params: Promise.resolve({ slug: made.page.slug }) });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("mailto:me@example.com");
    expect(counts).toEqual([{ slug: made.page.slug, kind: "click" }]);
  });

  it("a draft page is not reachable by its link, and another founder cannot edit it", async () => {
    db.offer_pages = [{ id: "22222222-2222-4222-8222-222222222222", user_id: "u1", slug: "stop-copying-abc123", status: "draft", content: { contact: "me@example.com", headline: "h", offer: "o", faqs: [], subhead: "", who_for: "", cta_kind: "demo", quote: QUOTE } }];
    const { GET } = await import("@/app/o/[slug]/go/route");
    expect((await GET(new Request("http://t"), { params: Promise.resolve({ slug: "stop-copying-abc123" }) })).status).toBe(404);
    user = { userId: "u2", plan: "builder" };
    const { PATCH } = await import("@/app/api/offers/[id]/route");
    expect((await PATCH(json("/x", "PATCH", { action: "publish" }), { params: Promise.resolve({ id: "22222222-2222-4222-8222-222222222222" }) })).status).toBe(404);
  });

  it("a quote that is no longer in the notes cannot be approved", async () => {
    db.conversation_people[0].notes = "I rewrote my notes completely";
    const { POST: approve } = await import("@/app/api/conversations/approve/route");
    expect((await approve(json("/x", "POST", { id: PID, index: 0, approved: true }))).status).toBe(409);
  });
});
