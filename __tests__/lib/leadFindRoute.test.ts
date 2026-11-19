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

const pending: Array<() => Promise<void>> = [];
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => Promise<void>) => { pending.push(fn); } }));
vi.mock("@/lib/server/jobCost", () => ({ withJobCost: (_k: string, fn: () => unknown) => fn(), setJobUser: () => {} }));
vi.mock("@/lib/server/aiUsageRefund", () => ({ refundAIUsage: vi.fn(async () => {}) }));
vi.mock("@/app/api/ai/_usageGate", () => ({ gateAIUsage: vi.fn(async () => null) }));
vi.mock("@/app/api/ai/_planCheck", () => ({ getRouteUser: vi.fn(async () => ({ userId: "u1", plan: "builder" })) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from }) }));
vi.mock("@/lib/server/heavyRuns", () => ({ admitHeavyRun: vi.fn(async () => ({ allowed: true, light: true })) }));
vi.mock("@/lib/ai-providers", () => ({
  callModelJSON: vi.fn(async (msgs: Array<{ role: string; content: string }>) => {
    const system = msgs.find((m) => m.role === "system")?.content ?? "";
    const user = msgs.find((m) => m.role === "user")?.content ?? "";
    seen.push(user);
    if (system.includes("plan web searches")) return { queries: ["game studios Bengaluru directory", "indie game developers Bengaluru community", "Bengaluru game jam events"], osm: [] };
    if (failWriting) throw new Error("GROQ_429 rate limit reached");
    const product = /Product: ([A-Za-z]+)/.exec(user)?.[1] ?? "none";
    return { leads: [{ name: `Studio group ${seq}`, kind: "association", where: "Bengaluru", url: `https://games.example.in/b${seq}`, why_fit: `Fits ${product}.`, evidence: "The page lists 40 game studios in Bengaluru.", how_to_reach: "Message the page", first_message: `Hello, I am building ${product}. Could I ask two questions?` }] };
  }),
}));
vi.mock("@/lib/search", () => ({
  webSearch: vi.fn(async () => ({ provider: "serper", results: [{ title: "Game studios Bengaluru", url: `https://games.example.in/b${seq}`, snippet: "Studios in Bengaluru", source_type: "web" }] })),
  discussionSearch: vi.fn(async () => ({ provider: "serper", results: [] })),
}));
vi.mock("@/lib/leads/pageReader", async (orig) => ({
  ...(await orig<typeof import("@/lib/leads/pageReader")>()),
  readPage: vi.fn(async () => "x".repeat(200)),
  readPageWithLinks: vi.fn(async () => ({ text: "Directory of 40 game studios in Bengaluru. ".repeat(10), links: [] })),
}));
vi.mock("@/lib/leads/osm", () => ({ findPlaces: vi.fn(async () => []), overpassQuery: vi.fn(), parsePlaces: vi.fn() }));

const seen: string[] = [];
let failWriting = false;

import { NextRequest } from "next/server";
import { POST as find } from "@/app/api/leads/find/route";
import { POST as retry } from "@/app/api/leads/retry/route";
import { GET as list } from "@/app/api/leads/route";

const BM = "11111111-1111-4111-8111-111111111111";
const post = (url: string, body: unknown) => new NextRequest(`http://x${url}`, { method: "POST", body: JSON.stringify(body) });
async function drain() { while (pending.length) await pending.shift()!(); }

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  writes.length = 0; pending.length = 0; seen.length = 0; failWriting = false; seq = 0;
  db.projects = [{ id: BM, user_id: "u1", name: "BuildMind", description: "An execution coach for solo founders", problem: "Founders stall" }];
});

const form = { country: "India", city: "Bengaluru", customer: "indie game studios" };

describe("Find Customers with BuildMind active and a one-off PLAYFORGE brief", () => {
  it("searches, explains and drafts for PLAYFORGE, saves it apart, and leaves BuildMind alone", async () => {
    const res = await find(post("/api/leads/find", { ...form, brief: { name: "PLAYFORGE", what: "Playtest marketplace for game studios" } }));
    expect((await res.json()).ok).toBe(true);
    await drain();
    expect(seen.length).toBeGreaterThan(0);
    for (const u of seen) { expect(u).toContain("Product: PLAYFORGE"); expect(u).not.toContain("BuildMind"); }
    const lead = db.lead_results[0] as { project_id: unknown; payload: { first_message: string; why_fit: string; brief: { name: string } } };
    expect(lead.project_id).toBeNull();
    expect(lead.payload.brief.name).toBe("PLAYFORGE");
    expect(lead.payload.first_message).toContain("PLAYFORGE");
    expect(lead.payload.why_fit).toContain("PLAYFORGE");
    expect((db.lead_runs[0].input as { product: { name: string } }).product.name).toBe("PLAYFORGE");
    // The BuildMind project is untouched: never written, never read for this search.
    expect(writes.filter((w) => w.table === "projects")).toHaveLength(0);
    expect(db.projects[0]).toEqual({ id: BM, user_id: "u1", name: "BuildMind", description: "An execution coach for solo founders", problem: "Founders stall" });
  });

  it("uses the project's own name and description when a project is chosen", async () => {
    await find(post("/api/leads/find", { ...form, projectId: BM }));
    await drain();
    for (const u of seen) expect(u).toContain("Product: BuildMind");
    expect((db.lead_results[0] as { project_id: string }).project_id).toBe(BM);
  });

  it("Find more keeps the batch's original brief, even if a different one is sent later", async () => {
    await find(post("/api/leads/find", { ...form, brief: { name: "PLAYFORGE", what: "Playtest marketplace" } }));
    await drain();
    seen.length = 0;
    await find(post("/api/leads/find", { ...form, brief: { name: "playforge", what: "Something else entirely" }, more: true }));
    await drain();
    for (const u of seen) { expect(u).toContain("Playtest marketplace"); expect(u).not.toContain("Something else"); }
    expect(db.lead_runs).toHaveLength(2);
    expect((db.lead_runs[1].input as { product: { what: string } }).product.what).toBe("Playtest marketplace");
  });

  it("lists a one-off batch under its own product, not under the project", async () => {
    await find(post("/api/leads/find", { ...form, brief: { name: "PLAYFORGE", what: "Playtest marketplace" } }));
    await drain();
    const one = await (await list(new NextRequest("http://x/api/leads?scope=oneoff&brief=playforge"))).json();
    expect(one.leads).toHaveLength(1);
    expect(one.oneoffs[0].name).toBe("PLAYFORGE");
    const proj = await (await list(new NextRequest(`http://x/api/leads?projectId=${BM}`))).json();
    expect(proj.leads).toHaveLength(0);
    const other = await (await list(new NextRequest("http://x/api/leads?scope=oneoff&brief=somethingelse"))).json();
    expect(other.leads).toHaveLength(0);
  });

  it("needs a project or a brief", async () => {
    const res = await find(post("/api/leads/find", form));
    expect(res.status).toBe(400);
  });
});

describe("when writing the leads fails", () => {
  it("is a retryable failure, then a retry writes the leads without searching again", async () => {
    failWriting = true;
    await find(post("/api/leads/find", { ...form, brief: { name: "PLAYFORGE", what: "Playtest marketplace" } }));
    await drain();
    const run = db.lead_runs[0] as { id: string; status: string; error: string; lead_count: number };
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/rate limit/);
    expect(run.error).toMatch(/without searching again/);
    expect(db.lead_results ?? []).toHaveLength(0);
    // The page is told a retry is possible, and is not sent the saved reading.
    const shown = (await (await list(new NextRequest("http://x/api/leads?scope=oneoff&brief=PLAYFORGE"))).json()).run;
    expect(shown.status).toBe("failed");
    expect(shown.retryable).toBe(true);
    expect(JSON.stringify(shown)).not.toContain("Directory of 40 game studios");

    const search = (await import("@/lib/search")).webSearch as unknown as { mock: { calls: unknown[] } };
    const before = search.mock.calls.length;
    failWriting = false;
    const res = await retry(post("/api/leads/retry", { runId: run.id }));
    expect((await res.json()).ok).toBe(true);
    await drain();
    expect(search.mock.calls.length).toBe(before); // no new search
    expect(db.lead_runs[0].status).toBe("done");
    expect(db.lead_runs[0].lead_count).toBe(1);
    const lead = db.lead_results[0] as { project_id: unknown; payload: { first_message: string; brief: { name: string } } };
    expect(lead.project_id).toBeNull();
    expect(lead.payload.brief.name).toBe("PLAYFORGE");
    expect(lead.payload.first_message).toContain("PLAYFORGE");
  });

  it("a second failure stays retryable, and a finished search cannot be retried", async () => {
    failWriting = true;
    await find(post("/api/leads/find", { ...form, brief: { name: "PLAYFORGE", what: "x" } }));
    await drain();
    const id = (db.lead_runs[0] as { id: string }).id;
    await retry(post("/api/leads/retry", { runId: id }));
    await drain();
    expect(db.lead_runs[0].status).toBe("failed");
    expect((await (await list(new NextRequest("http://x/api/leads?scope=oneoff&brief=PLAYFORGE"))).json()).run.retryable).toBe(true);
    failWriting = false;
    await retry(post("/api/leads/retry", { runId: id }));
    await drain();
    expect(db.lead_runs[0].status).toBe("done");
    const again = await retry(post("/api/leads/retry", { runId: id }));
    expect(again.status).toBe(409);
  });
});
