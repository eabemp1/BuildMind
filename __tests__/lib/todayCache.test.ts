import { describe, it, expect } from "vitest";
import { dropTodayActionCache } from "@/lib/todayCache";

function store(init: Record<string, string>) {
  const m = new Map(Object.entries(init));
  return { get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null, removeItem: (k: string) => void m.delete(k), has: (k: string) => m.has(k) };
}
describe("choosing a different action", () => {
  it("drops the saved Today action (and its timestamp) but nothing else", () => {
    const s = store({ "bm_today_action_cache_u1": "A", "bm_today_action_cache_ts_u1": "1", "bm_streak": "4", "bm_today_action": "snapshot" });
    expect(dropTodayActionCache(s)).toBe(2);
    expect(s.has("bm_today_action_cache_u1")).toBe(false);
    expect(s.has("bm_streak")).toBe(true);
    expect(s.has("bm_today_action")).toBe(true);
  });
});
