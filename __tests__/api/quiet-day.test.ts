import { describe, it, expect, vi, beforeEach } from "vitest";

const { getUser, state, rate } = vi.hoisted(() => ({ getUser: vi.fn(), rate: vi.fn(), state: { days: [] as string[], missing: false, upserts: [] as unknown[] } }));
vi.mock("../../lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock("../../lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => (state.missing ? { data: null, error: { message: 'column "quiet_days" does not exist' } } : { data: { quiet_days: state.days }, error: null }) }) }),
      upsert: async (row: unknown) => { state.upserts.push(row); return { error: null }; },
    }),
  }),
}));
vi.mock("../../lib/server/rateLimit", () => ({ rateLimitAsync: rate }));
vi.mock("../../lib/server/logger", () => ({ logError: vi.fn() }));
vi.mock("next/server", () => ({ NextResponse: { json: (b: unknown, i?: ResponseInit) => new Response(JSON.stringify(b), { ...i, headers: { "Content-Type": "application/json" } }) } }));

import { GET, POST } from "../../app/api/today/quiet-day/route";
const post = (b: unknown) => new Request("https://x.test/api/today/quiet-day", { method: "POST", body: JSON.stringify(b) });

beforeEach(() => {
  state.days = []; state.missing = false; state.upserts = [];
  getUser.mockReset(); rate.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  rate.mockResolvedValue({ ok: true });
});

describe("/api/today/quiet-day", () => {
  it("requires sign-in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET()).status).toBe(401);
    expect((await POST(post({}))).status).toBe(401);
  });
  it("saves a quiet day for the signed-in user only, using the server date", async () => {
    const res = await POST(post({ day: "today", user_id: "someone-else", date: "1999-01-01" }));
    expect(res.status).toBe(200);
    const row = state.upserts[0] as { user_id: string; quiet_days: string[] };
    expect(row.user_id).toBe("u1");
    expect(row.quiet_days).toEqual([new Date().toISOString().slice(0, 10)]);
  });
  it("refuses a second quiet day inside 7 days", async () => {
    state.days = [new Date().toISOString().slice(0, 10)];
    const res = await POST(post({ day: "tomorrow" }));
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j.reason).toBe("too_soon");
    expect(state.upserts).toHaveLength(0);
  });
  it("says plainly when the migration has not run, instead of failing", async () => {
    state.missing = true;
    const g = await (await GET()).json();
    expect(g).toMatchObject({ ok: true, available: false, canTakeToday: false });
    expect((await POST(post({}))).status).toBe(503);
  });
  it("applies the rate limit", async () => {
    rate.mockResolvedValue({ ok: false });
    expect((await POST(post({}))).status).toBe(429);
  });
});
