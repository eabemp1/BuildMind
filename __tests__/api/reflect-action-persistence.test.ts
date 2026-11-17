import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  enabled: true,
  duplicate: null as null | { id: string },
  duplicateError: null as null | { message: string },
  inserted: { data: { id: "saved-reflection" }, error: null } as { data: null | { id?: string }; error: null | { message: string; code?: string } },
  mutations: [] as string[],
  inserts: [] as Record<string, unknown>[],
  byKey: null as null | { id: string },
  byKeyError: null as null | { message: string },
  keyLookupFilters: [] as unknown[][],
  insight: vi.fn(async () => null),
  fallbackSucceeds: false,
  swap: vi.fn(async (..._args: unknown[]) => undefined),
}));
vi.mock("../../app/api/ai/_planCheck", () => ({ getRouteUser: async () => ({ userId: "authenticated-user", plan: "free" }) }));
vi.mock("../../app/api/ai/_utils", () => ({
  enforceAndTrackAIUsage: async () => undefined,
  hasAdminEnv: () => state.enabled,
  groqJSON: async () => ({ witnessed: "You wrote the page.", nextAction: "Show the page to someone." }),
}));
vi.mock("../../lib/testMode", () => ({ loadTestMode: async () => false, markTestRun: (note: string) => note }));
vi.mock("../../lib/founderMemory", () => ({ generateFounderInsight: () => state.insight() }));
vi.mock("../../lib/today/swapStore", () => ({ resolveSwap: (...args: unknown[]) => state.swap(...args) }));
vi.mock("../../lib/server/logger", () => ({ logError: vi.fn() }));
vi.mock("../../lib/server/milestoneSync", () => ({ syncMilestoneForTask: async () => undefined }));
vi.mock("../../lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let insert = false;
      let keyLookup = false;
      const filters: unknown[][] = [];
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "gte", "order", "limit"]) query[method] = () => query;
      query.eq = (column: string, value: unknown) => { filters.push([column, value]); if (column === "idempotency_key") keyLookup = true; return query; };
      query.insert = (values: Record<string, unknown>) => { insert = true; state.mutations.push(`${table}:insert`); if (table === "reflections") state.inserts.push(values); return query; };
      query.update = () => { state.mutations.push(`${table}:update`); return query; };
      query.upsert = () => { state.mutations.push(`${table}:upsert`); return query; };
      query.maybeSingle = async () => {
        if (table === "reflections") {
          if (insert) return state.fallbackSucceeds && state.inserts.length > 1
            ? { data: { id: "fallback-reflection" }, error: null } : state.inserted;
          if (keyLookup) state.keyLookupFilters = filters;
          return { data: keyLookup ? state.byKey : state.duplicate, error: keyLookup ? state.byKeyError : state.duplicateError };
        }
        return { data: null, error: null };
      };
      // Force a downstream failure after task update, to prove a persisted row
      // stays acknowledged even when noncritical post-save work is unavailable.
      query.then = (resolve: (value: unknown) => void) => resolve({ data: null, error: null });
      return query;
    },
    rpc: () => { throw new Error("post-save service unavailable"); },
  }),
}));
import { POST } from "../../app/api/ai/reflect-action/route";
const base = {
  outcome: "completed", note: "Wrote the landing page", confidence: 4,
  todayAction: "Write landing page", streak: 3,
  projectId: "11111111-1111-4111-8111-111111111111",
  taskId: "22222222-2222-4222-8222-222222222222",
};
const send = async (body: Record<string, unknown> = base) => {
  const res = await POST(new Request("https://example.com/api/ai/reflect-action", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  expect(res.status).toBe(200);
  return res.json();
};
beforeEach(() => {
  state.enabled = true;
  state.duplicate = null;
  state.duplicateError = null;
  state.inserted = { data: { id: "saved-reflection" }, error: null };
  state.mutations = [];
  state.inserts = [];
  state.byKey = null;
  state.byKeyError = null;
  state.keyLookupFilters = [];
  state.insight.mockClear();
  state.fallbackSucceeds = false;
  state.swap.mockClear();
});
it("reports not saved when persistence is disabled", async () => {
  state.enabled = false;
  expect((await send()).data.notSaved).toBe(true);
  expect(state.mutations).toEqual([]);
});
it("reports not saved when no project was supplied", async () => {
  expect((await send({ ...base, projectId: undefined })).data.notSaved).toBe(true);
  expect(state.mutations).toEqual([]);
});
it("does not mutate task/progress or resolve swaps after reflection insert failure", async () => {
  state.inserted = { data: null, error: { message: "database unavailable" } };
  const body = await send();
  expect(body.data.notSaved).toBe(true);
  expect(body.data.reflectionId).toBeUndefined();
  expect(state.mutations).toEqual(["reflections:insert"]);
  expect(state.swap).not.toHaveBeenCalled();
  expect(state.insight).not.toHaveBeenCalled();
});
it("returns the saved duplicate ID without repeating progress side effects", async () => {
  state.duplicate = { id: "existing-reflection" };
  const body = await send();
  expect(body.data.notSaved).toBeUndefined();
  expect(body.data.reflectionId).toBe("existing-reflection");
  expect(state.mutations).toEqual([]);
  expect(state.swap).not.toHaveBeenCalled();
  expect(state.insight).not.toHaveBeenCalled();
});
it("acknowledges persisted reflection even if downstream side effects fail", async () => {
  const body = await send();
  expect(body.data.notSaved).toBeUndefined();
  expect(body.data.reflectionId).toBe("saved-reflection");
  expect(state.mutations).toContain("tasks:update");
});

it("does not retry an ambiguous keyed insert without its idempotency key", async () => {
  state.inserted = { data: null, error: { message: "connection lost after write" } };
  state.fallbackSucceeds = true;
  const body = await send({ ...base, idempotencyKey: "same-request-key" });
  expect(body.data.notSaved).toBe(true);
  expect(state.inserts).toHaveLength(1);
  expect(state.inserts[0].idempotency_key).toBe("same-request-key");
  expect(state.mutations).toEqual(["reflections:insert"]);
});
it("preserves compatibility fallback only for confirmed missing idempotency column", async () => {
  state.inserted = { data: null, error: { code: "PGRST204", message: "Could not find the 'idempotency_key' column of 'reflections' in the schema cache" } };
  state.fallbackSucceeds = true;
  const body = await send({ ...base, idempotencyKey: "same-request-key" });
  expect(body.data.notSaved).toBeUndefined();
  expect(body.data.reflectionId).toBe("fallback-reflection");
  expect(state.inserts).toHaveLength(2);
  expect(state.inserts[1]).not.toHaveProperty("idempotency_key");
});
it("reuses a confirmed idempotency conflict without repeating side effects", async () => {
  state.inserted = { data: null, error: { code: "23505", message: "duplicate key" } };
  state.byKey = { id: "first-request-reflection" };
  const body = await send({ ...base, idempotencyKey: "same-request-key" });
  expect(body.data.notSaved).toBeUndefined();
  expect(body.data.reflectionId).toBe("first-request-reflection");
  expect(state.keyLookupFilters).toEqual([["user_id", "authenticated-user"], ["idempotency_key", "same-request-key"]]);
  expect(state.mutations).toEqual(["reflections:insert"]);
  expect(state.swap).not.toHaveBeenCalled();
  expect(state.insight).not.toHaveBeenCalled();
});
it("does not claim a conflict was saved when the existing row cannot be read", async () => {
  state.inserted = { data: null, error: { code: "23505", message: "duplicate key" } };
  const body = await send({ ...base, idempotencyKey: "same-request-key" });
  expect(body.data.notSaved).toBe(true);
  expect(state.mutations).toEqual(["reflections:insert"]);
  expect(state.swap).not.toHaveBeenCalled();
  expect(state.insight).not.toHaveBeenCalled();
});

it.each([
  { data: null, error: null },
  { data: {}, error: null },
  { data: { id: "" }, error: null },
  { data: { id: "unconfirmed" }, error: { message: "write not confirmed" } },
])("does not grant saved state for an unconfirmed insert result %j", async (result) => {
  state.inserted = result;
  const body = await send();
  expect(body.data.notSaved).toBe(true);
  expect(body.data.reflectionId).toBeUndefined();
  expect(state.mutations).toEqual(["reflections:insert"]);
  expect(state.swap).not.toHaveBeenCalled();
  expect(state.insight).not.toHaveBeenCalled();
});

it("does not treat a failed conflict lookup as confirmation even if data is present", async () => {
  state.inserted = { data: null, error: { code: "23505", message: "duplicate key" } };
  state.byKey = { id: "unconfirmed-existing" };
  state.byKeyError = { message: "lookup failed" };
  const body = await send({ ...base, idempotencyKey: "same-request-key" });
  expect(body.data.notSaved).toBe(true);
  expect(body.data.reflectionId).toBeUndefined();
  expect(state.mutations).toEqual(["reflections:insert"]);
  expect(state.swap).not.toHaveBeenCalled();
  expect(state.insight).not.toHaveBeenCalled();
});

it("does not accept an errored precheck row as saved and uses confirmed insert instead", async () => {
  state.duplicate = { id: "unconfirmed-duplicate" };
  state.duplicateError = { message: "precheck failed" };
  const body = await send();
  expect(body.data.notSaved).toBeUndefined();
  expect(body.data.reflectionId).toBe("saved-reflection");
  expect(state.inserts).toHaveLength(1);
});
