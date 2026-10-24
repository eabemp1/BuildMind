import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { redactSecrets, buildDataExport, describeExport, EXPORT_CATEGORIES, EXCLUDED_TABLES, LIVE_ONLY_TABLES, MAX_ROWS_PER_TABLE, PAGE_SIZE, EXPORT_SCHEMA_VERSION } from "@/lib/dataExport";

type Behaviour = { rows?: unknown[]; error?: { code?: string; message?: string }; throws?: boolean; badOrder?: boolean; total?: number };

/** In-memory database that records every filter so tests can prove each query is scoped to one user. */
function fakeAdmin(by: Record<string, Behaviour> = {}) {
  const calls: Array<{ table: string; col: string | null; val: unknown }> = [];
  return {
    calls,
    from(table: string) {
      const b = by[table] ?? {};
      const state: { col: string | null; val: unknown; order: string | null } = { col: null, val: undefined, order: null };
      const chain: any = {
        select: () => chain,
        eq: (c: string, v: unknown) => { state.col = c; state.val = v; calls.push({ table, col: c, val: v }); return chain; },
        order: (o: string) => { state.order = o; return chain; },
        range: async (from: number, to: number) => {
          if (b.throws) throw new Error("boom: secret internal detail");
          if (b.badOrder && state.order) return { data: null, error: { code: "42703", message: "column does not exist" }, count: null };
          if (b.error) return { data: null, error: b.error, count: null };
          const all = b.rows ?? [];
          return { data: all.slice(from, to + 1), error: null, count: b.total ?? all.length };
        },
      };
      return chain;
    },
  } as any;
}

describe("redactSecrets", () => {
  it("removes credential-looking keys at any depth and reports their names", () => {
    const removed = new Set<string>();
    const r = redactSecrets({ id: 1, access_token: "x", nested: { api_key: "y", note: "ok" }, list: [{ refresh_token: "z", v: 2 }], share_token: "s", token: "t" }, removed);
    expect(r).toEqual({ id: 1, nested: { note: "ok" }, list: [{ v: 2 }] });
    expect([...removed].sort()).toEqual(["access_token", "api_key", "refresh_token", "share_token", "token"]);
  });
  it("keeps harmless fields that only contain the word token", () => {
    expect(redactSecrets({ tokens_used: 5, max_tokens: 100, token_count: 3, secretary: "Ama" })).toEqual({ tokens_used: 5, max_tokens: 100, token_count: 3, secretary: "Ama" });
  });
  it("leaves plain values alone", () => { expect(redactSecrets("hi")).toBe("hi"); expect(redactSecrets(null)).toBeNull(); });
});

describe("buildDataExport: user isolation", () => {
  it("scopes every query to the one user id, on the right owner column", async () => {
    const admin = fakeAdmin();
    await buildDataExport(admin, { id: "u-123", email: "a@b.c" });
    expect(admin.calls).toHaveLength(EXPORT_CATEGORIES.length);
    for (const c of admin.calls) {
      const cat = EXPORT_CATEGORIES.find((x) => x.table === c.table)!;
      expect(c.col).toBe(cat.ownerCol);
      expect(c.val).toBe("u-123");
    }
  });
  it("never reads credential tables", async () => {
    const admin = fakeAdmin();
    await buildDataExport(admin, { id: "u" });
    const read = new Set(admin.calls.map((c: any) => c.table));
    for (const t of ["integrations", "push_subscriptions", "radar_feeds"]) expect(read.has(t)).toBe(false);
  });
});

describe("buildDataExport: manifest accuracy", () => {
  it("reports exported, empty, unavailable and failed categories honestly and never leaks internals", async () => {
    const admin = fakeAdmin({
      tasks: { rows: [{ id: 1, access_token: "s" }, { id: 2 }] },
      milestones: { error: { code: "42P01", message: 'relation "milestones" does not exist' } },
      reflections: { throws: true },
      projects: { error: { code: "XX000", message: "connection to 10.0.0.5 failed password=abc" } },
    });
    const out = await buildDataExport(admin, { id: "u", email: "a@b.c" }, new Date("2026-10-23T10:00:00Z"));
    const m = (t: string) => out.manifest.find((x) => x.table === t)!;
    expect(out.schema_version).toBe(EXPORT_SCHEMA_VERSION);
    expect(out.tables.tasks).toEqual([{ id: 1 }, { id: 2 }]);
    expect(m("tasks")).toMatchObject({ status: "exported", exported_rows: 2, total_rows: 2, redacted_fields: ["access_token"] });
    expect(m("milestones").status).toBe("unavailable");
    expect(m("reflections").status).toBe("failed");
    expect(m("projects").status).toBe("failed");
    expect(m("founder_memory")).toMatchObject({ status: "empty", exported_rows: 0 });
    expect(out.skipped).toEqual(["milestones", "projects", "reflections"]);
    expect(out.complete).toBe(false);
    expect(JSON.stringify(out)).not.toMatch(/10\.0\.0\.5|password=abc|secret internal detail/);
    expect(out.summary.failed).toBe(2);
    expect(out.summary.unavailable).toBe(1);
    expect(out.summary.total_rows).toBe(2);
    expect(out.email).toBe("a@b.c");
  });
  it("is complete when nothing failed, even if a table does not exist yet", async () => {
    const out = await buildDataExport(fakeAdmin({ milestones: { error: { code: "42P01" } } }), { id: "u" });
    expect(out.complete).toBe(true);
    expect(out.summary.unavailable).toBe(1);
  });
  it("flags third-party data and AI-written categories", async () => {
    const out = await buildDataExport(fakeAdmin(), { id: "u" });
    expect(out.manifest.find((x) => x.table === "signal_events")?.contains_third_party_data).toBe(true);
    expect(out.manifest.find((x) => x.table === "agent_findings")?.ai_generated).toBe(true);
    expect(out.manifest.find((x) => x.table === "tasks")?.ai_generated).toBeUndefined();
    expect(out.excluded.map((e) => e.table)).toContain("integrations");
  });
});

describe("buildDataExport: paging, truncation and ordering", () => {
  it("reads every page and is not truncated when under the cap", async () => {
    const rows = Array.from({ length: PAGE_SIZE * 2 + 5 }, (_, i) => ({ i }));
    const out = await buildDataExport(fakeAdmin({ tasks: { rows } }), { id: "u" });
    expect(out.tables.tasks).toHaveLength(PAGE_SIZE * 2 + 5);
    expect(out.manifest.find((x) => x.table === "tasks")?.truncated).toBe(false);
  });
  it("marks a table truncated when the database holds more than the cap", async () => {
    const rows = Array.from({ length: MAX_ROWS_PER_TABLE }, (_, i) => ({ i }));
    const out = await buildDataExport(fakeAdmin({ tasks: { rows, total: MAX_ROWS_PER_TABLE + 50 } }), { id: "u" });
    const t = out.manifest.find((x) => x.table === "tasks")!;
    expect(t.truncated).toBe(true);
    expect(t.reason).toMatch(/newest/);
    expect(out.truncated).toEqual(["tasks"]);
    expect(out.complete).toBe(false);
  });
  it("does not call a table with exactly the cap truncated when the total matches", async () => {
    const rows = Array.from({ length: MAX_ROWS_PER_TABLE }, (_, i) => ({ i }));
    const out = await buildDataExport(fakeAdmin({ tasks: { rows, total: MAX_ROWS_PER_TABLE } }), { id: "u" });
    expect(out.manifest.find((x) => x.table === "tasks")?.truncated).toBe(false);
  });
  it("still exports a table whose ordering column does not exist", async () => {
    const out = await buildDataExport(fakeAdmin({ tasks: { rows: [{ id: 1 }], badOrder: true } }), { id: "u" });
    expect(out.tables.tasks).toEqual([{ id: 1 }]);
    expect(out.manifest.find((x) => x.table === "tasks")?.status).toBe("exported");
  });
});

describe("completeness against the schema", () => {
  // Every table in the migrations that stores a user_id must be exported or deliberately excluded with a reason.
  const dir = path.resolve("supabase/migrations");
  const tables = new Map<string, Set<string>>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
    const s = readFileSync(path.join(dir, f), "utf8");
    for (const m of s.matchAll(/create table (?:if not exists )?(?:public\.)?"?(\w+)"?\s*\(([\s\S]*?)\n\);/gi)) {
      const cols = tables.get(m[1]) ?? new Set<string>();
      for (const c of m[2].matchAll(/^\s*"?(\w+)"?\s+[a-z]/gim)) cols.add(c[1]);
      tables.set(m[1], cols);
    }
    for (const m of s.matchAll(/alter table (?:if exists )?(?:public\.)?"?(\w+)"?\s+add column (?:if not exists )?"?(\w+)"?/gi)) {
      const cols = tables.get(m[1]) ?? new Set<string>();
      cols.add(m[2]);
      tables.set(m[1], cols);
    }
  }
  const known = new Set([...EXPORT_CATEGORIES.map((c) => c.table), ...EXCLUDED_TABLES.map((e) => e.table)]);
  it("has no user-owned table missing from both lists (add new tables to dataExport.ts)", () => {
    const missing = [...tables.entries()].filter(([t, cols]) => cols.has("user_id") && !known.has(t)).map(([t]) => t);
    expect(missing).toEqual([]);
  });
  it("only lists tables that exist in the migrations or are known live-only tables", () => {
    const live = new Set<string>(LIVE_ONLY_TABLES);
    const unknown = EXPORT_CATEGORIES.map((c) => c.table).filter((t) => !tables.has(t) && !live.has(t));
    expect(unknown).toEqual([]);
  });
  it("uses the owner column the migrations define", () => {
    const live = new Set<string>(LIVE_ONLY_TABLES); // base tables predate the migrations, so their columns are only partly visible here
    const wrong = EXPORT_CATEGORIES.filter((c) => !live.has(c.table) && tables.has(c.table) && c.table !== "profiles" && !tables.get(c.table)!.has(c.ownerCol)).map((c) => c.table);
    expect(wrong).toEqual([]);
  });
  it("gives every exclusion a reason and never exports an excluded table", () => {
    for (const e of EXCLUDED_TABLES) { expect(e.reason.length).toBeGreaterThan(10); expect(EXPORT_CATEGORIES.some((c) => c.table === e.table)).toBe(false); }
  });
  it("describes the export without reading data", () => {
    const d = describeExport();
    expect(d.categories.length).toBe(EXPORT_CATEGORIES.length);
    expect(d.categories.find((c) => c.table === "signal_events")?.third_party).toBe(true);
  });
});
