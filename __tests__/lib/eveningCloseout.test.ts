import { describe, it, expect } from "vitest";
import { canSubmit, carryIsFresh, closingLine, eveningToReflection } from "@/lib/today/evening";
import { looksLikeOpenLoop } from "@/lib/today/loops";

describe("evening close-out", () => {
  it("requires a reason when the task did not finish", () => {
    expect(canSubmit({ outcome: "didnt", blocker: null, note: "slept in" })).toBe(false);
    expect(canSubmit({ outcome: "didnt", blocker: "avoided", note: "slept in" })).toBe(true);
    expect(canSubmit({ outcome: "done", blocker: null, note: "sent 12 DMs" })).toBe(true);
    expect(canSubmit({ outcome: "done", blocker: null, note: "ok" })).toBe(false);
    expect(canSubmit({ outcome: null, blocker: null, note: "something" })).toBe(false);
  });

  it("becomes a reflection the pipeline already understands", () => {
    const r = eveningToReflection({ outcome: "didnt", blocker: "avoided", note: "Kept rewriting the DM", tomorrow: "Send the DM unedited", task: "DM 10 founders" });
    expect(r.outcome).toBe("blocked");
    expect(r.blocker).toContain("avoided it");
    expect(r.what_learned).toBe("Tomorrow's first move: Send the DM unedited");
    expect(r.today_action).toBe("DM 10 founders");
    const done = eveningToReflection({ outcome: "done", blocker: "avoided", note: "Sent them" });
    expect(done.outcome).toBe("completed");
    expect(done.blocker).toBeNull();
    expect(done.what_learned).toBeNull();
  });

  it("only carries last night's move into the next day", () => {
    const c = { text: "Send the DM", date: "2026-10-17" };
    expect(carryIsFresh(c, "2026-10-18")).toBe(true);
    expect(carryIsFresh(c, "2026-10-17")).toBe(false);
    expect(carryIsFresh(c, "2026-10-19")).toBe(false);
    expect(carryIsFresh({ ...c, dismissed: true }, "2026-10-18")).toBe(false);
    expect(carryIsFresh(null, "2026-10-18")).toBe(false);
  });

  it("does not praise work that did not happen", () => {
    expect(closingLine("didnt", null)).not.toMatch(/great|well done/i);
  });

  it("detects a pending result in the note", () => {
    expect(looksLikeOpenLoop("Posted it, still waiting on replies")).toBe(true);
  });
});
