import { describe, it, expect } from "vitest";
import { parseCoachWrite } from "@/lib/coachWrites/parse";
import { dueAtClock } from "@/lib/today/loops";

const at = (m: string) => { const r = parseCoachWrite(m); return r && r.kind === "remind" ? r : null; };

describe("coach reminders with a clock time", () => {
  it("reads a time of day", () => {
    expect(at("remind me at 5pm to email Sam")?.at).toEqual({ h: 17, m: 0, tomorrow: false });
    expect(at("remind me to email Sam at 5:30 pm")?.at).toEqual({ h: 17, m: 30, tomorrow: false });
    expect(at("remind me at 17:30 to email Sam")?.at).toEqual({ h: 17, m: 30, tomorrow: false });
    expect(at("remind me tomorrow at 9am to post the thread")?.at).toEqual({ h: 9, m: 0, tomorrow: true });
    expect(at("remind me tonight to send the invoice")?.at).toEqual({ h: 20, m: 0, tomorrow: false });
    expect(at("remind me at 12am to sleep")?.at?.h).toBe(0);
  });
  it("keeps the task text clean", () => {
    expect(at("remind me at 5pm to email Sam")?.text).toBe("email Sam");
    expect(at("remind me tomorrow at 9am to post the thread")?.text).toBe("post the thread");
  });
  it("leaves durations alone", () => {
    expect(at("remind me in 3 days to follow up")?.at).toBeUndefined();
    expect(at("remind me in 3 days to follow up")?.choice).toBe("3d");
    expect(at("remind me in 4 hours to follow up")?.at).toBeUndefined();
    expect(at("remind me tomorrow to email Sam")?.at).toBeUndefined();
    expect(at("remind me to email 5 founders")?.at).toBeUndefined();
  });
  it("sets today when the time is still ahead, tomorrow when it has passed", () => {
    const now = Date.parse("2026-11-01T13:30:00Z"); // Accra, UTC+0
    expect(dueAtClock({ h: 17, m: 0, tomorrow: false }, 0, now)).toBe("2026-11-01T17:00:00.000Z");
    expect(dueAtClock({ h: 9, m: 0, tomorrow: false }, 0, now)).toBe("2026-11-02T09:00:00.000Z");
    expect(dueAtClock({ h: 9, m: 0, tomorrow: true }, 0, now)).toBe("2026-11-02T09:00:00.000Z");
  });
  it("uses the founder's timezone, not the server's", () => {
    const now = Date.parse("2026-11-01T13:30:00Z"); // 14:30 in UTC+1 (offset -60)
    expect(dueAtClock({ h: 17, m: 0, tomorrow: false }, -60, now)).toBe("2026-11-01T16:00:00.000Z");
    // 23:30 in UTC-5 local; 5pm local has passed, so it is tomorrow's 5pm
    expect(dueAtClock({ h: 17, m: 0, tomorrow: false }, 300, Date.parse("2026-11-01T04:30:00Z"))).toBe("2026-11-01T22:00:00.000Z");
  });
});
