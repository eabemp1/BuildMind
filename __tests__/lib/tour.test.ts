import { describe, it, expect } from "vitest";
import { TOUR_STEPS, parseTourState, mergeTourState, nextState, shouldAutoStart, placePopover, padBox, type TourState } from "@/lib/tour/tour";

const vp = { width: 1200, height: 800 };
const size = { width: 360, height: 220 };
const st = (status: TourState["status"], step = 0, at = "2026-10-21T00:00:00.000Z"): TourState => ({ status, step, at, v: 1 });

describe("tour steps", () => {
  it("have unique ids, real routes, and only the first and last are untargeted", () => {
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(TOUR_STEPS.length);
    for (const s of TOUR_STEPS) expect(s.route.startsWith("/")).toBe(true);
    const untargeted = TOUR_STEPS.filter((s) => !s.target).map((s) => s.id);
    expect(untargeted).toEqual(["welcome", "finish"]);
  });
  it("keeps copy short enough to read in a glance", () => {
    for (const s of TOUR_STEPS) { expect(s.title.length).toBeLessThanOrEqual(48); expect(s.body.length).toBeLessThanOrEqual(260); }
  });
});

describe("tour state", () => {
  it("parses stored JSON and rejects junk", () => {
    expect(parseTourState(JSON.stringify(st("active", 3)))?.step).toBe(3);
    expect(parseTourState("nope")).toBeNull();
    expect(parseTourState({ status: "weird" })).toBeNull();
    expect(parseTourState({ status: "active", step: 999 })?.step).toBe(TOUR_STEPS.length - 1);
    expect(parseTourState({ status: "active", step: -4 })?.step).toBe(0);
  });
  it("a finished or skipped tour on either device wins; otherwise the newest", () => {
    expect(mergeTourState(st("active", 2), st("done"))?.status).toBe("done");
    expect(mergeTourState(st("skipped"), st("active", 5, "2027-01-01T00:00:00.000Z"))?.status).toBe("skipped");
    expect(mergeTourState(st("active", 1, "2026-10-01T00:00:00.000Z"), st("active", 4, "2026-10-02T00:00:00.000Z"))?.step).toBe(4);
    expect(mergeTourState(null, null)).toBeNull();
  });
  it("walks forward, back, and ends in done", () => {
    let s = nextState(null, "start");
    expect(s).toMatchObject({ status: "active", step: 0 });
    s = nextState(s, "back"); expect(s.step).toBe(0);
    for (let i = 0; i < TOUR_STEPS.length - 1; i++) s = nextState(s, "next");
    expect(s).toMatchObject({ status: "active", step: TOUR_STEPS.length - 1 });
    expect(nextState(s, "next").status).toBe("done");
    expect(nextState(s, "skip").status).toBe("skipped");
  });
  it("auto-starts only for first-timers on Today", () => {
    expect(shouldAutoStart(null, { firstTaskDone: false, pathname: "/today" })).toBe(true);
    expect(shouldAutoStart(null, { firstTaskDone: true, pathname: "/today" })).toBe(false);
    expect(shouldAutoStart(null, { firstTaskDone: false, pathname: "/progress" })).toBe(false);
    expect(shouldAutoStart(st("skipped"), { firstTaskDone: false, pathname: "/today" })).toBe(false);
    expect(shouldAutoStart(null, { firstTaskDone: false, pathname: "/today", disabled: true })).toBe(false);
  });
});

describe("popover placement", () => {
  it("puts the card under the target when there is room, centred on it", () => {
    const p = placePopover({ top: 100, left: 400, width: 200, height: 60 }, size, vp, "bottom")!;
    expect(p.side).toBe("bottom");
    expect(p.top).toBe(100 + 60 + 14);
    expect(p.left).toBe(500 - 180);
  });
  it("flips to the top when the bottom would run off screen", () => {
    const p = placePopover({ top: 650, left: 400, width: 200, height: 60 }, size, vp, "bottom")!;
    expect(p.side).toBe("top");
    expect(p.top).toBe(650 - 14 - 220);
  });
  it("sits to the right of a sidebar item and stays on screen", () => {
    const p = placePopover({ top: 10, left: 8, width: 56, height: 40 }, size, vp, "right")!;
    expect(p.side).toBe("right");
    expect(p.top).toBeGreaterThanOrEqual(12);
    expect(p.left).toBe(8 + 56 + 14);
  });
  it("clamps horizontally inside the viewport", () => {
    const p = placePopover({ top: 100, left: 1150, width: 40, height: 40 }, size, vp, "bottom")!;
    expect(p.left + size.width).toBeLessThanOrEqual(vp.width - 12);
  });
  it("returns null when nothing fits so the caller can centre the card", () => {
    expect(placePopover({ top: 0, left: 0, width: 400, height: 300 }, { width: 380, height: 300 }, { width: 400, height: 300 }, "bottom")).toBeNull();
  });
  it("pads the spotlight and keeps it on screen", () => {
    const b = padBox({ top: 2, left: 2, width: 50, height: 50 }, 8, vp);
    expect(b.top).toBe(0); expect(b.left).toBe(0); expect(b.width).toBe(60);
  });
});
