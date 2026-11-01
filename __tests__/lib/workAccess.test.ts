import { describe, it, expect } from "vitest";
import { docAccess, insightAccess, remainingFree, FREE_DOCS_PER_MONTH, FREE_INSIGHTS_TOTAL } from "@/lib/work/access";

describe("work access", () => {
  it("free gets a real taste of long documents, then a plain message", () => {
    expect(docAccess("free", 0).allowed).toBe(true);
    expect(docAccess("free", FREE_DOCS_PER_MONTH - 1).allowed).toBe(true);
    const blocked = docAccess("free", FREE_DOCS_PER_MONTH);
    expect(blocked.allowed).toBe(false);
    expect(blocked.message).toMatch(/stay free/);
  });
  it("builder is never limited", () => {
    expect(docAccess("builder", 999).allowed).toBe(true);
    expect(insightAccess("builder", 999).allowed).toBe(true);
  });
  it("free keeps three note readings and is told notes stay saved", () => {
    expect(insightAccess("free", FREE_INSIGHTS_TOTAL - 1).allowed).toBe(true);
    const b = insightAccess("free", FREE_INSIGHTS_TOTAL);
    expect(b.allowed).toBe(false);
    expect(b.message).toMatch(/still saved/);
  });
  it("shows what is left on free, nothing on builder", () => {
    expect(remainingFree("free", 1, 2)).toBe(1);
    expect(remainingFree("free", 5, 2)).toBe(0);
    expect(remainingFree("builder", 5, 2)).toBeNull();
  });
});
