import { describe, it, expect } from "vitest";
import { pickAutoRunUsers, sinceLabel, MIN_GAP_DAYS } from "@/lib/radar/autoRun";

const now = new Date("2026-10-27T06:00:00Z"); // a Tuesday
const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

describe("pickAutoRunUsers", () => {
  it("skips opted-out founders and those searched in the last 2 days, dedupes", () => {
    const ids = pickAutoRunUsers([
      { user_id: "a", last_auto_run_at: ago(0.5) },
      { user_id: "b", last_auto_run_at: ago(3) },
      { user_id: "c", auto_discover: false },
      { user_id: "d" },
      { user_id: "d" },
      { user_id: "" },
    ], now);
    expect(ids).toEqual(["d", "b"]);
  });
  it("goes oldest first and respects the limit", () => {
    const rows = [{ user_id: "x", last_auto_run_at: ago(4) }, { user_id: "y", last_auto_run_at: ago(9) }, { user_id: "z", last_auto_run_at: ago(6) }];
    expect(pickAutoRunUsers(rows, now, 2)).toEqual(["y", "z"]);
    expect(pickAutoRunUsers(rows, now, 0)).toEqual([]);
  });
  it("gives about two searches a week across the Tue/Wed/Fri/Sat schedule", () => {
    // Searched Tuesday: not due Wednesday, due Friday. Missed Tuesday: caught Wednesday.
    const tue = new Date("2026-10-27T06:00:00Z"), wed = new Date("2026-10-28T06:00:00Z"), fri = new Date("2026-10-30T06:00:00Z");
    const last = tue.toISOString();
    expect(pickAutoRunUsers([{ user_id: "u", last_auto_run_at: last }], wed)).toEqual([]);
    expect(pickAutoRunUsers([{ user_id: "u", last_auto_run_at: last }], fri)).toEqual(["u"]);
    expect(MIN_GAP_DAYS).toBe(2);
  });
  it("treats a bad date as never searched", () => {
    expect(pickAutoRunUsers([{ user_id: "q", last_auto_run_at: "garbage" }], now)).toEqual(["q"]);
  });
});

describe("sinceLabel", () => {
  it("reads naturally", () => {
    expect(sinceLabel(ago(0.2), now)).toBe("today");
    expect(sinceLabel(ago(1.2), now)).toBe("yesterday");
    expect(sinceLabel(ago(3.5), now)).toBe("3 days ago");
    expect(sinceLabel(null, now)).toBeNull();
    expect(sinceLabel("nope", now)).toBeNull();
  });
});

import { isPaidSubscription } from "@/lib/radar/autoRun";
describe("isPaidSubscription", () => {
  const future = new Date(now.getTime() + 5 * 86_400_000).toISOString();
  const past = new Date(now.getTime() - 86_400_000).toISOString();
  it("only an active builder subscription (or one in grace) counts", () => {
    expect(isPaidSubscription({ plan: "builder", status: "active", current_period_end: future }, now)).toBe(true);
    expect(isPaidSubscription({ plan: "builder", status: "active" }, now)).toBe(true); // legacy row without a period end
    expect(isPaidSubscription({ plan: "builder", status: "active", current_period_end: past }, now)).toBe(false);
    expect(isPaidSubscription({ plan: "builder", status: "grace", grace_period_ends_at: future }, now)).toBe(true);
    expect(isPaidSubscription({ plan: "builder", status: "grace", grace_period_ends_at: past }, now)).toBe(false);
    expect(isPaidSubscription({ plan: "builder", status: "trialing" }, now)).toBe(false);
    expect(isPaidSubscription({ plan: "builder", status: "canceled" }, now)).toBe(false);
    expect(isPaidSubscription({ plan: "free", status: "active" }, now)).toBe(false);
    expect(isPaidSubscription(null, now)).toBe(false);
  });
});
