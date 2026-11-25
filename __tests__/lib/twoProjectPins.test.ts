import { describe, it, expect } from "vitest";
import { activePin, selectBreakTest, type BreakPredictionRow } from "@/lib/agentToToday";

const now = new Date("2026-11-25T12:00:00Z");
const test = (id: string, assumption: string, extra: object = {}) => ({ id, assumption, test: "Ask five owners to pay a deposit this week", provenWrongIf: "Fewer than two agree", predictedHold: 0.3, status: "open", ...extra });
const A: BreakPredictionRow = { id: "a0000000-0000-4000-8000-000000000001", project_id: "pa", created_at: "2026-11-24T10:00:00Z", tests: [test("t1", "Bike shops will pay monthly", { chosenAt: "2026-11-25T09:00:00Z" })] };
const B: BreakPredictionRow = { id: "b0000000-0000-4000-8000-000000000002", project_id: "pb", created_at: "2026-11-24T11:00:00Z", tests: [test("t9", "Cafes want loyalty cards")] };

describe("two QA projects", () => {
  it("a test pinned in project A does not steer project B", () => {
    expect(activePin([A, B], "pa", now)?.testId).toBe("t1");
    expect(activePin([A, B], "pb", now)).toBeNull();
  });
  it("Today's break test for B is B's own, and for A is the pinned one", () => {
    expect(selectBreakTest([A, B], "pb", now)?.title).toBe("Cafes want loyalty cards");
    expect((selectBreakTest([A, B], "pa", now) as { chosen?: boolean }).chosen).toBe(true);
  });
  it("once A's test is recorded, it stops steering Today and is not offered again", () => {
    const done: BreakPredictionRow = { ...A, tests: [{ ...A.tests![0], status: "refuted" }] };
    expect(activePin([done, B], "pa", now)).toBeNull();
    expect(selectBreakTest([done, B], "pa", now)).toBeNull();
  });
});
