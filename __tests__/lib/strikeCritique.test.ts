import { describe, it, expect } from "vitest";
import { applyStrikeCritique } from "@/lib/reflexion";

const task = "Scrape the prices of rice from three shop websites and compare them all.";
const better = "Ask one person you know how they compare prices of everyday food before they buy.";

describe("applyStrikeCritique", () => {
  it("keeps the task when the critic passes it", () => {
    expect(applyStrikeCritique(task, { ok: true })).toBe(task);
  });
  it("uses the rewrite when the critic fails it", () => {
    expect(applyStrikeCritique(task, { ok: false, better })).toBe(better);
  });
  it("keeps the task when the rewrite is missing, too short or too long", () => {
    expect(applyStrikeCritique(task, { ok: false })).toBe(task);
    expect(applyStrikeCritique(task, { ok: false, better: "Do it." })).toBe(task);
    expect(applyStrikeCritique(task, { ok: false, better: "x".repeat(300) })).toBe(task);
  });
  it("keeps the task on junk", () => {
    expect(applyStrikeCritique(task, null)).toBe(task);
    expect(applyStrikeCritique(task, "nope")).toBe(task);
  });
});
