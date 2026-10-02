import { describe, it, expect } from "vitest";
import {
  freshFocusState, startFocus, pauseFocus, resumeFocus, finishBlock, normalizeFocusState, secondsLeft, formatClock,
  parseSuggestedMinutes, nearestPreset, dayArc, nudgeLine, resetFocus,
} from "@/lib/todayFocus";

const T0 = new Date(2026, 9, 2, 9, 0, 0);

describe("focus state machine", () => {
  it("runs from an absolute end time, so a throttled tab cannot drift", () => {
    const s = startFocus(freshFocusState(T0), 25, T0);
    expect(secondsLeft(s, new Date(T0.getTime() + 10 * 60 * 1000))).toBe(15 * 60);
  });
  it("pauses and resumes without losing time", () => {
    let s = startFocus(freshFocusState(T0), 25, T0);
    s = pauseFocus(s, new Date(T0.getTime() + 5 * 60 * 1000));
    expect(s.mode).toBe("paused");
    expect(s.remainingSec).toBe(20 * 60);
    const later = new Date(T0.getTime() + 60 * 60 * 1000);
    s = resumeFocus(s, later);
    expect(secondsLeft(s, new Date(later.getTime() + 60 * 1000))).toBe(19 * 60);
  });
  it("counts a finished block once", () => {
    const s = finishBlock(startFocus(freshFocusState(T0), 25, T0));
    expect(s).toMatchObject({ mode: "finished", blocksToday: 1, minutesToday: 25 });
  });
  it("a block that ended while the tab was closed is finished, not lost", () => {
    const running = startFocus(freshFocusState(T0), 25, T0);
    const back = normalizeFocusState(running, new Date(T0.getTime() + 40 * 60 * 1000));
    expect(back.mode).toBe("finished");
    expect(back.blocksToday).toBe(1);
  });
  it("rolls over at midnight and keeps nothing from yesterday", () => {
    const yesterday = finishBlock(startFocus(freshFocusState(T0), 25, T0));
    const next = normalizeFocusState(yesterday, new Date(2026, 9, 3, 8, 0, 0));
    expect(next).toMatchObject({ mode: "idle", blocksToday: 0, minutesToday: 0 });
  });
  it("reset returns to idle at the chosen length", () => {
    expect(resetFocus(startFocus(freshFocusState(T0), 25, T0), 10)).toMatchObject({ mode: "idle", durationSec: 600, remainingSec: 600 });
  });
  it("formats the clock", () => {
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(-3)).toBe("00:00");
  });
});

describe("suggested length", () => {
  it("reads the action's own estimate", () => {
    expect(parseSuggestedMinutes("25 minutes")).toBe(25);
    expect(parseSuggestedMinutes("10 min")).toBe(10);
    expect(parseSuggestedMinutes("1 hour")).toBe(60);
    expect(parseSuggestedMinutes("20-30 minutes")).toBe(30);
    expect(parseSuggestedMinutes("About 2 hours")).toBe(90);
  });
  it("returns null for unreadable text and snaps to presets", () => {
    expect(parseSuggestedMinutes("soon")).toBeNull();
    expect(parseSuggestedMinutes(null)).toBeNull();
    expect(nearestPreset(30)).toBe(25);
    expect(nearestPreset(8)).toBe(10);
    expect(nearestPreset(60)).toBe(45);
  });
});

describe("day arc and nudge", () => {
  it("tracks the working day", () => {
    expect(dayArc(new Date(2026, 9, 2, 14, 0)).phase).toBe("afternoon");
    expect(dayArc(new Date(2026, 9, 2, 22, 30)).phase).toBe("late");
    expect(dayArc(new Date(2026, 9, 2, 6, 0)).progress).toBe(0);
  });
  it("only states numbers the app has", () => {
    expect(nudgeLine({ now: new Date(2026, 9, 2, 19, 0), done: false, streak: 3, focusMinutesToday: 0, suggestedMinutes: 25 })).toMatch(/3-day streak.*25 minutes/);
    expect(nudgeLine({ now: T0, done: false, streak: 0, focusMinutesToday: 0, activeDaysThisWeek: 1, activeDaysLastWeekSamePoint: 3 })).toMatch(/2 active days behind/);
    expect(nudgeLine({ now: T0, done: true, streak: 4, focusMinutesToday: 50 })).toMatch(/streak at 4.*50 focused minutes/);
  });
});
