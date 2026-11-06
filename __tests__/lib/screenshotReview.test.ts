import { describe, it, expect } from "vitest";
import { parseImage, normalizeReview, reviewPrompt, MAX_BASE64_CHARS } from "@/lib/work/screenshot";

const b64 = (n: number) => "A".repeat(n);

describe("screenshot review", () => {
  it("accepts png, jpeg, webp data urls only", () => {
    expect(parseImage(`data:image/png;base64,${b64(200)}`)?.mimeType).toBe("image/png");
    expect(parseImage(`data:image/jpeg;base64,${b64(200)}`)).toBeTruthy();
    expect(parseImage(`data:image/svg+xml;base64,${b64(200)}`)).toBeNull();
    expect(parseImage(`data:text/html;base64,${b64(200)}`)).toBeNull();
    expect(parseImage("https://example.com/a.png")).toBeNull();
    expect(parseImage(`data:image/png;base64,${b64(10)}`)).toBeNull();
    expect(parseImage(`data:image/png;base64,${b64(MAX_BASE64_CHARS + 1)}`)).toBeNull();
    expect(parseImage(null)).toBeNull();
  });
  it("prompt forbids guessing and scoring, and carries the founder's note", () => {
    const p = reviewPrompt("landing", "it is for barbers");
    expect(p).toContain("it is for barbers");
    expect(p).toMatch(/do not guess/i);
    expect(p).toMatch(/no score|not give a score/i);
  });
  it("normalises and caps the review, dropping problems with no fix", () => {
    const r = normalizeReview({
      summary: "  Clear enough.  ",
      clear: ["a", "b", "c", "d"],
      problems: [{ what: "x", why: "y", fix: "z" }, { what: "no fix", why: "y" }, ...Array.from({ length: 6 }, (_, i) => ({ what: `p${i}`, why: "w", fix: "f" }))],
    })!;
    expect(r.summary).toBe("Clear enough.");
    expect(r.clear).toHaveLength(3);
    expect(r.problems).toHaveLength(4);
    expect(r.problems.every((p) => p.fix)).toBe(true);
  });
  it("rejects an empty or malformed answer", () => {
    expect(normalizeReview(null)).toBeNull();
    expect(normalizeReview({ summary: "ok", clear: [], problems: [] })).toBeNull();
    expect(normalizeReview({ clear: ["a"] })).toBeNull();
  });
});
