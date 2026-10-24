import { describe, it, expect } from "vitest";
import { canTakeQuietDay, addQuietDay, gapIsBridged, isQuietDay, normalizeQuietDays } from "@/lib/quietDays";
import { streakStatus, effectiveStreak } from "@/lib/streak";
import { shouldSendNudge } from "@/lib/nudgeBackoff";

describe("quiet days: rules", () => {
  it("allows today and tomorrow, not past days or days further out", () => {
    expect(canTakeQuietDay([], "2026-10-24", "2026-10-24")).toEqual({ ok: true });
    expect(canTakeQuietDay([], "2026-10-25", "2026-10-24")).toEqual({ ok: true });
    expect(canTakeQuietDay([], "2026-10-23", "2026-10-24")).toMatchObject({ ok: false, reason: "past_day" });
    expect(canTakeQuietDay([], "2026-10-26", "2026-10-24")).toMatchObject({ ok: false, reason: "too_far" });
    expect(canTakeQuietDay([], "nope", "2026-10-24")).toMatchObject({ ok: false, reason: "invalid_day" });
  });
  it("allows one in any 7 days, and says when the next is allowed", () => {
    const r = canTakeQuietDay(["2026-10-20"], "2026-10-24", "2026-10-24");
    expect(r).toMatchObject({ ok: false, reason: "too_soon", nextAllowed: "2026-10-27" });
    expect(canTakeQuietDay(["2026-10-17"], "2026-10-24", "2026-10-24")).toEqual({ ok: true });
    expect(canTakeQuietDay(["2026-10-24"], "2026-10-24", "2026-10-24")).toMatchObject({ reason: "already_quiet" });
  });
  it("keeps only valid, recent, unique days", () => {
    expect(normalizeQuietDays(["2026-10-20", "2026-10-20", "bad", "2025-01-01", 5], "2026-10-24")).toEqual(["2026-10-20"]);
    expect(addQuietDay(["2026-10-17"], "2026-10-24", "2026-10-24")).toEqual(["2026-10-17", "2026-10-24"]);
    expect(isQuietDay(["2026-10-24"], "2026-10-24")).toBe(true);
  });
  it("bridges only gaps made entirely of quiet days", () => {
    expect(gapIsBridged("2026-10-20", "2026-10-22", ["2026-10-21"])).toBe(true);
    expect(gapIsBridged("2026-10-20", "2026-10-23", ["2026-10-21"])).toBe(false);
    expect(gapIsBridged("2026-10-20", "2026-10-21", [])).toBe(true); // next day: no missed day at all
    expect(gapIsBridged("2026-10-20", "2026-10-20", [])).toBe(false); // same day is not a gap
  });
});

describe("quiet days: streak", () => {
  it("keeps the old behaviour with no quiet days", () => {
    expect(streakStatus(5, "2026-10-23", "2026-10-24")).toMatchObject({ count: 5, atRisk: true, lapsed: false });
    expect(streakStatus(5, "2026-10-22", "2026-10-24")).toMatchObject({ count: 0, lapsed: true });
    expect(streakStatus(5, "2026-10-24", "2026-10-24")).toMatchObject({ count: 5, doneToday: true });
  });
  it("survives one quiet day and is not at risk while resting", () => {
    expect(streakStatus(5, "2026-10-22", "2026-10-24", ["2026-10-23"])).toMatchObject({ count: 5, lapsed: false, atRisk: true });
    expect(streakStatus(5, "2026-10-23", "2026-10-24", ["2026-10-24"])).toMatchObject({ count: 5, lapsed: false, atRisk: false });
  });
  it("still breaks when a day was missed without resting", () => {
    expect(streakStatus(5, "2026-10-20", "2026-10-24", ["2026-10-22"])).toMatchObject({ count: 0, lapsed: true });
    expect(effectiveStreak(5, "2026-10-20", "2026-10-24", ["2026-10-21", "2026-10-22", "2026-10-23"])).toBe(5);
  });
});

describe("nudge back-off", () => {
  it("gets rarer the longer someone is quiet, then stops", () => {
    const sent = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i).filter(shouldSendNudge);
    expect(sent(1, 3)).toEqual([1, 2, 3]);
    expect(sent(4, 7)).toEqual([4, 6]);
    expect(sent(8, 14)).toEqual([8, 11, 14]);
    expect(sent(15, 40)).toEqual([]);
  });
  it("never withholds when the day count is unknown", () => { expect(shouldSendNudge(0)).toBe(true); expect(shouldSendNudge(NaN)).toBe(true); });
});
