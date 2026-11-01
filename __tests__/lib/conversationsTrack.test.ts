import { describe, it, expect } from "vitest";
import { followUpDue, summarize, nextAction, verifyInsights, isStatus, sanitizeLine, type Person } from "@/lib/conversations/track";

const now = new Date("2026-11-10T12:00:00Z");
const p = (status: Person["status"], contacted?: string): Person => ({ id: Math.random().toString(), name: "x", status, contacted_at: contacted ?? null });

describe("followUpDue", () => {
  it("only when sent and 3+ days old", () => {
    expect(followUpDue(p("sent", "2026-11-07T00:00:00Z"), now)).toBe(true);
    expect(followUpDue(p("sent", "2026-11-09T00:00:00Z"), now)).toBe(false);
    expect(followUpDue(p("replied", "2026-11-01T00:00:00Z"), now)).toBe(false);
    expect(followUpDue(p("sent"), now)).toBe(false);
  });
});

describe("summarize", () => {
  it("counts and hides reply rate until 3 contacted", () => {
    expect(summarize([p("sent", "2026-11-10T00:00:00Z"), p("replied")], now).replyRate).toBeNull();
    const s = summarize([p("sent", "2026-11-10T00:00:00Z"), p("replied"), p("done"), p("to_contact")], now);
    expect(s).toMatchObject({ total: 4, contacted: 3, replied: 2, talked: 1, toContact: 1, replyRate: 67, remaining: 4 });
  });
  it("remaining never goes below zero", () => {
    expect(summarize(Array.from({ length: 6 }, () => p("done")), now).remaining).toBe(0);
  });
});

describe("nextAction", () => {
  it("is empty-state first, then booked, follow-ups, replies, to contact", () => {
    expect(nextAction(summarize([], now))).toMatch(/first 3 people/);
    expect(nextAction(summarize([p("booked"), p("sent", "2026-11-01T00:00:00Z")], now))).toMatch(/booked/);
    expect(nextAction(summarize([p("sent", "2026-11-01T00:00:00Z")], now))).toMatch(/follow-up/);
    expect(nextAction(summarize([p("replied")], now))).toMatch(/replied/);
    expect(nextAction(summarize([p("to_contact")], now))).toMatch(/first message/);
    expect(nextAction(summarize(Array.from({ length: 5 }, () => p("done")), now))).toMatch(/reached 5/);
  });
});

describe("verifyInsights", () => {
  const notes = "He said: \"I track everything in WhatsApp groups\" and that payment is a pain.";
  it("keeps only insights whose quote is in the notes", () => {
    const r = verifyInsights({ insights: [
      { point: "Uses WhatsApp", quote: "I track everything in WhatsApp groups" },
      { point: "Wants a discount", quote: "I would pay half price" },
      { point: "no quote", quote: "" },
    ] }, notes);
    expect(r).toEqual([{ point: "Uses WhatsApp", quote: "I track everything in WhatsApp groups" }]);
  });
  it("tolerates case and spacing, and junk input", () => {
    expect(verifyInsights({ insights: [{ point: "p", quote: "PAYMENT  is a pain" }] }, notes).length).toBe(1);
    expect(verifyInsights(null, notes)).toEqual([]);
  });
});

describe("helpers", () => {
  it("isStatus and sanitizeLine", () => {
    expect(isStatus("sent")).toBe(true); expect(isStatus("x")).toBe(false);
    expect(sanitizeLine("  a\u0000b ", 5)).toBe("ab"); expect(sanitizeLine(3, 5)).toBe("");
  });
});
