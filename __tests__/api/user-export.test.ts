import { describe, it, expect, vi, beforeEach } from "vitest";

const { getUser, adminFrom, rate } = vi.hoisted(() => ({ getUser: vi.fn(), adminFrom: vi.fn(), rate: vi.fn() }));
vi.mock("../../lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock("../../lib/supabase/admin", () => ({ createAdminClient: () => ({ from: adminFrom }) }));
vi.mock("../../lib/server/rateLimit", () => ({ rateLimitAsync: rate }));
vi.mock("../../lib/server/logger", () => ({ logError: vi.fn() }));
vi.mock("next/server", () => ({
  NextResponse: class extends Response {
    static json(body: unknown, init?: ResponseInit) { return new Response(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } }); }
  },
}));

import { GET } from "../../app/api/user/export/route";

const table = (rows: unknown[]) => { const c: any = { select: () => c, eq: () => c, order: () => c, range: async () => ({ data: rows, error: null, count: rows.length }) }; return c; };
const req = (q = "") => new Request(`https://x.test/api/user/export${q}`);

beforeEach(() => {
  getUser.mockReset(); adminFrom.mockReset(); rate.mockReset();
  rate.mockResolvedValue({ ok: true });
  getUser.mockResolvedValue({ data: { user: { id: "u-1", email: "a@b.c" } } });
  adminFrom.mockImplementation((t: string) => table(t === "tasks" ? [{ id: 1, title: "A" }] : []));
});

describe("GET /api/user/export (real route, mocked database)", () => {
  it("rejects anonymous requests and reads nothing", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(adminFrom).not.toHaveBeenCalled();
  });
  it("ignores any id in the request: queries only use the session user", async () => {
    const eqs: unknown[] = [];
    adminFrom.mockImplementation(() => { const c: any = { select: () => c, eq: (_c: string, v: unknown) => { eqs.push(v); return c; }, order: () => c, range: async () => ({ data: [], error: null, count: 0 }) }; return c; });
    await GET(req("?user_id=someone-else&id=someone-else"));
    expect(eqs.length).toBeGreaterThan(0);
    expect(new Set(eqs)).toEqual(new Set(["u-1"]));
  });
  it("returns a JSON download that is private, versioned and self-describing", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment; filename="buildmind-data-\d{4}-\d{2}-\d{2}\.json"/);
    expect(res.headers.get("X-Export-Complete")).toBe("true");
    const body = await res.json();
    expect(body.schema_version).toBe("2.0");
    expect(body.manifest.length).toBeGreaterThan(30);
    expect(body.tables.tasks).toEqual([{ id: 1, title: "A" }]);
  });
  it("applies the rate limit", async () => {
    rate.mockResolvedValue({ ok: false });
    expect((await GET(req())).status).toBe(429);
    expect(adminFrom).not.toHaveBeenCalled();
  });
  it("returns a safe error body, without internals, when building fails", async () => {
    adminFrom.mockImplementation(() => { throw new Error("db password=abc host=10.1.1.1"); });
    const res = await GET(req());
    // a failing category is reported in the manifest rather than crashing the whole file
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.complete).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/password=abc|10\.1\.1\.1/);
  });
  it("rejects an unknown format", async () => {
    expect((await GET(req("?format=xml"))).status).toBe(400);
  });
  it("serves CSV for a flat table, refuses other tables, and sets the omitted-columns header", async () => {
    adminFrom.mockImplementation((t: string) => table(t === "tasks" ? [{ id: 1, title: "A", meta: { x: 1 } }] : []));
    const ok = await GET(req("?format=csv&table=tasks"));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Content-Type")).toMatch(/text\/csv/);
    expect(ok.headers.get("X-Export-Omitted-Columns")).toBe("meta");
    expect(await ok.text()).toContain("id,title");
    expect((await GET(req("?format=csv&table=integrations"))).status).toBe(400);
    expect((await GET(req("?format=csv"))).status).toBe(400);
  });
  it("serves a report and a manifest preview", async () => {
    const rep = await GET(req("?format=report"));
    expect(rep.headers.get("Content-Type")).toMatch(/text\/html/);
    expect(await rep.text()).toContain("What you recorded");
    adminFrom.mockClear();
    const man = await GET(req("?format=manifest"));
    const body = await man.json();
    expect(body.categories.length).toBeGreaterThan(30);
    expect(adminFrom).not.toHaveBeenCalled(); // the preview reads no rows
  });
});
