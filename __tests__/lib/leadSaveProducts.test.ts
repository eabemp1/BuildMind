import { describe, it, expect } from "vitest";
import { saveLeads, plainUrl } from "@/lib/leads/save";
import type { Lead } from "@/lib/leads/validate";

type Row = { id: string; user_id: string; project_id: string | null; lead_url: string; payload: { brief?: { name?: string }; draft?: string }; lead_name: string };

/** In-memory lead_results with the real unique index on (user, coalesce(project), url). */
function fake() {
  const rows: Row[] = [];
  let n = 0;
  const admin = {
    from() {
      const f: Record<string, unknown> = {};
      let mode = "select"; let patch: Partial<Row> = {};
      const conds: Array<(r: Row) => boolean> = [];
      const api = {
        select() { return api; },
        eq(k: string, v: unknown) { conds.push((r) => (r as unknown as Record<string, unknown>)[k] === v); if (mode === "update") return run(); return api; },
        is(k: string, v: null) { conds.push((r) => (r as unknown as Record<string, unknown>)[k] === v); return api; },
        limit() { return api; },
        maybeSingle: async () => ({ data: rows.find((r) => conds.every((c) => c(r))) ?? null, error: null }),
        update(p: Partial<Row>) { mode = "update"; patch = p; return api; },
        insert: async (r: Omit<Row, "id">) => {
          if (rows.some((x) => x.user_id === r.user_id && (x.project_id ?? "") === (r.project_id ?? "") && x.lead_url === r.lead_url)) return { error: { message: "duplicate key" } };
          rows.push({ id: `r${++n}`, ...r }); return { error: null };
        },
      };
      function run() { const hit = rows.find((r) => conds.every((c) => c(r))); if (hit) Object.assign(hit, patch); return Promise.resolve({ error: null }); }
      void f;
      return api;
    },
  };
  return { admin: admin as never, rows };
}
const lead = (url: string, name: string): Lead => ({ name, url, kind: "business" } as unknown as Lead);
const base = { userId: "u1", projectId: null, country: "Ghana", city: "Accra" };

describe("one-off leads for different products", () => {
  it("two products that find the same page each keep their own saved lead", async () => {
    const { admin, rows } = fake();
    expect(await saveLeads(admin, { ...base, product: { name: "QueuePilot" } as never, leads: [lead("https://shop.example/a", "Shop A")] })).toBe(0);
    expect(await saveLeads(admin, { ...base, product: { name: "StockSense" } as never, leads: [lead("https://shop.example/a", "Shop A")] })).toBe(0);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.payload.brief?.name).sort()).toEqual(["QueuePilot", "StockSense"]);
    expect(rows.map((r) => plainUrl(r.lead_url))).toEqual(["https://shop.example/a", "https://shop.example/a"]);
  });
  it("searching again for the same product updates its row instead of adding one", async () => {
    const { admin, rows } = fake();
    const a = { ...base, product: { name: "QueuePilot" } as never, leads: [lead("https://shop.example/a", "Shop A")] };
    await saveLeads(admin, a); await saveLeads(admin, a);
    expect(rows).toHaveLength(1);
  });
  it("a row saved before products were tagged is reused only by its own product", async () => {
    const { admin, rows } = fake();
    rows.push({ id: "old", user_id: "u1", project_id: null, lead_url: "https://shop.example/a", lead_name: "Shop A", payload: { brief: { name: "QueuePilot" }, draft: "keep me" } });
    await saveLeads(admin, { ...base, product: { name: "StockSense" } as never, leads: [lead("https://shop.example/a", "Shop A")] });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === "old")?.payload.draft).toBe("keep me");
    await saveLeads(admin, { ...base, product: { name: "QueuePilot" } as never, leads: [lead("https://shop.example/a", "Shop A")] });
    expect(rows).toHaveLength(2);
  });
  it("project searches still key on the plain url", async () => {
    const { admin, rows } = fake();
    await saveLeads(admin, { ...base, projectId: "p1", leads: [lead("https://shop.example/a", "Shop A")] });
    expect(rows[0].lead_url).toBe("https://shop.example/a");
  });
});
