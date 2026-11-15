import { describe, it, expect } from "vitest";
import { withinUndoWindow } from "@/lib/reflectionUndo";
describe("withinUndoWindow", () => {
  const now = Date.parse("2026-11-15T12:00:00Z");
  it("allows 10 minutes", () => expect(withinUndoWindow("2026-11-15T11:50:00Z", now)).toBe(true));
  it("refuses 31 minutes", () => expect(withinUndoWindow("2026-11-15T11:29:00Z", now)).toBe(false));
  it("refuses junk and future dates", () => { expect(withinUndoWindow("x", now)).toBe(false); expect(withinUndoWindow("2026-11-15T12:30:00Z", now)).toBe(false); });
});
