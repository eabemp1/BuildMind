import { describe, it, expect } from "vitest";
import { recordInteractionServer } from "@/lib/conversationContinuity";

type Row = { user_id: string; recent_interactions: unknown[] };

function fakeDb(rows: Row[], opts: { failWrite?: boolean } = {}) {
  const calls: string[] = [];
  const db = {
    from: (_t: string) => ({
      select: (_c: string) => ({ eq: (_k: string, v: string) => ({ maybeSingle: async () => ({ data: rows.find((r) => r.user_id === v) ?? null, error: null }) }) }),
      update: (patch: Record<string, unknown>) => ({ eq: async (_k: string, v: string) => { calls.push("update"); if (opts.failWrite) return { error: { message: "boom" } }; const r = rows.find((x) => x.user_id === v); if (r) Object.assign(r, patch); return { error: null }; } }),
      insert: async (row: Row) => { calls.push("insert"); if (opts.failWrite) return { error: { message: "boom" } }; rows.push(row); return { error: null }; },
    }),
  };
  return { db, calls };
}

describe("recordInteractionServer", () => {
  it("inserts the first interaction for a founder with no row", async () => {
    const rows: Row[] = [];
    const { db, calls } = fakeDb(rows);
    await recordInteractionServer(db, "u1", "ai_coach", "hello");
    expect(calls).toEqual(["insert"]);
    expect(rows[0].recent_interactions).toHaveLength(1);
  });
  it("updates the existing row and keeps older entries, newest first", async () => {
    const rows: Row[] = [{ user_id: "u1", recent_interactions: [{ feature: "morning_briefing", summary: "old", timestamp: "2026-10-01T00:00:00Z" }] }, { user_id: "u2", recent_interactions: [] }];
    const { db, calls } = fakeDb(rows);
    await recordInteractionServer(db, "u1", "ai_coach", "new answer");
    expect(calls).toEqual(["update"]);
    const list = rows[0].recent_interactions as Array<{ summary: string }>;
    expect(list.map((x) => x.summary)).toEqual(["new answer", "old"]);
    expect(rows[1].recent_interactions).toHaveLength(0); // another founder's row is untouched
  });
  it("keeps only the last 10", async () => {
    const rows: Row[] = [{ user_id: "u1", recent_interactions: Array.from({ length: 10 }, (_, i) => ({ feature: "ai_coach", summary: `s${i}`, timestamp: "2026-10-01T00:00:00Z" })) }];
    const { db } = fakeDb(rows);
    await recordInteractionServer(db, "u1", "ai_coach", "latest");
    expect(rows[0].recent_interactions).toHaveLength(10);
  });
  it("never throws when the write fails", async () => {
    const { db } = fakeDb([], { failWrite: true });
    await expect(recordInteractionServer(db, "u1", "ai_coach", "x")).resolves.toBeUndefined();
  });
});
