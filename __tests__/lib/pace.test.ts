import { describe, it, expect } from "vitest";
import { paceForecast } from "@/lib/pace";

describe("paceForecast", () => {
  it("projects the current pace to the deadline", () => {
    expect(paceForecast({ current: 10, target: 30, daysIn: 10, daysLeft: 80 })).toEqual({ projected: 90, onTrack: true, perWeek: 7 });
  });
  it("says behind when the pace falls short", () => {
    expect(paceForecast({ current: 2, target: 30, daysIn: 20, daysLeft: 70 })?.onTrack).toBe(false);
  });
  it("stays quiet with too little to go on", () => {
    expect(paceForecast({ current: 5, target: 30, daysIn: 2, daysLeft: 88 })).toBeNull();
    expect(paceForecast({ current: 0, target: 30, daysIn: 10, daysLeft: 80 })).toBeNull();
  });
});
