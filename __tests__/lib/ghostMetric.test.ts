import { describe, it, expect } from "vitest";
import { goalMetric, countConversations } from "@/lib/ghostMetric";

describe("goalMetric", () => {
  it("measures talking goals by conversations, with the number from the text", () => {
    expect(goalMetric("This week, talk to 3 people who match your target user.")).toMatchObject({ kind: "conversations", target: 3 });
    expect(goalMetric("Interview five founders about pricing")).toMatchObject({ kind: "conversations", target: 5 });
  });
  it("measures commitment goals by replies", () => {
    expect(goalMetric("Get 2 genuine commitment signals: a booked call or a pre-payment.")).toMatchObject({ kind: "replies", target: 2 });
  });
  it("falls back to Today actions with no number", () => {
    expect(goalMetric("Ship the new landing page")).toEqual({ kind: "actions", label: "Today actions done", target: null });
    expect(goalMetric("")).toMatchObject({ kind: "actions" });
  });
  it("ignores numbers that are not counts", () => {
    expect(goalMetric("Message people and reach 500 sign-ups").target).toBeNull();
  });
});

describe("countConversations", () => {
  const people = [
    { status: "sent", contacted_at: "2026-11-09T10:00:00Z" },
    { status: "replied", contacted_at: "2026-11-10T10:00:00Z" },
    { status: "booked", contacted_at: "2026-11-11T10:00:00Z" },
    { status: "to_contact", contacted_at: null },
    { status: "replied", contacted_at: "2026-11-01T10:00:00Z" },
  ];
  it("counts only this week, and replies as a subset", () => {
    expect(countConversations(people, "2026-11-09")).toEqual({ started: 3, replies: 2 });
  });
});
