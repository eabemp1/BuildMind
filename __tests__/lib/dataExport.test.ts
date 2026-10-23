import { describe, it, expect } from "vitest";
import { redactSecrets, buildDataExport, EXPORT_TABLES } from "@/lib/dataExport";

describe("redactSecrets", () => {
  it("removes secret-looking keys at any depth", () => {
    const r = redactSecrets({ id: 1, access_token: "x", nested: { api_key: "y", note: "ok" }, list: [{ refresh_token: "z", v: 2 }] });
    expect(r).toEqual({ id: 1, nested: { note: "ok" }, list: [{ v: 2 }] });
  });
  it("leaves plain values alone", () => {
    expect(redactSecrets("hi")).toBe("hi");
    expect(redactSecrets(null)).toBeNull();
  });
});

describe("buildDataExport", () => {
  const chain = (result: { data?: unknown[]; error?: unknown } | "throw") => ({
    select: () => ({ eq: () => ({ limit: async () => { if (result === "throw") throw new Error("x"); return result; } }) }),
  });
  it("collects tables, lists skipped ones and never includes integrations", async () => {
    const admin: any = { from: (t: string) => chain(t === "tasks" ? { data: [{ id: 1, access_token: "s" }] } : t === "milestones" ? { error: { code: "42P01" } } : t === "reflections" ? "throw" : { data: [] }) };
    const out = await buildDataExport(admin, { id: "u1", email: "a@b.c" }, new Date("2026-10-22T00:00:00Z"));
    expect(out.tables.tasks).toEqual([{ id: 1 }]);
    expect(out.skipped).toEqual(["milestones", "reflections"]);
    expect(out.tables.integrations).toBeUndefined();
    expect(EXPORT_TABLES.map((t) => t[0])).not.toContain("integrations");
    expect(out.email).toBe("a@b.c");
  });
  it("flags truncated tables", async () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({ i }));
    const admin: any = { from: (t: string) => chain({ data: t === "tasks" ? rows : [] }) };
    expect((await buildDataExport(admin, { id: "u" })).truncated).toEqual(["tasks"]);
  });
});
