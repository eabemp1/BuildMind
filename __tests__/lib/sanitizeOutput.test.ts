import { describe, expect, it } from "vitest";
import { sanitizeOutput } from "@/lib/sanitizeOutput";

describe("sanitizeOutput", () => {
  it("returns an empty string for empty, null, and undefined input", () => {
    expect(sanitizeOutput("")).toBe("");
    expect(sanitizeOutput(null)).toBe("");
    expect(sanitizeOutput(undefined)).toBe("");
  });

  it("strips non-printable ASCII controls while preserving tab, newline, and carriage return", () => {
    expect(sanitizeOutput("a\x00b\x08c\t\n\rd\x0Ee")).toBe("abc\t\n\rde");
  });

  it("strips Unicode invisible characters", () => {
    expect(sanitizeOutput("a\u200Bb\u200Fc\u202Ed\u2060e\uFFFDF")).toBe("abcdeF");
  });

  it("strips BOM characters", () => {
    expect(sanitizeOutput("\uFEFFhello\uFEFF")).toBe("hello");
  });

  it("strips code fence wrappers", () => {
    expect(sanitizeOutput("```tsx\nhello\n```")).toBe("hello");
    expect(sanitizeOutput("~~~md\nhello\n~~~")).toBe("hello");
  });

  it("strips bold and italic markdown markers at line boundaries", () => {
    expect(sanitizeOutput("**bold**\n__strong__\n*italic*\n_plain_")).toBe("bold\nstrong\nitalic\nplain");
  });

  it("strips heading tokens at line start", () => {
    expect(sanitizeOutput("## Heading\n### Smaller")).toBe("Heading\nSmaller");
  });

  it("preserves emoji, accented characters, CJK, Arabic, and Cyrillic", () => {
    expect(sanitizeOutput("Café 🚀 中文 العربية Кириллица")).toBe("Café 🚀 中文 العربية Кириллица");
  });

  it("collapses consecutive blank lines to max two", () => {
    expect(sanitizeOutput("A\n\n\n\nB")).toBe("A\n\nB");
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitizeOutput(" \n hello \n ")).toBe("hello");
  });
});
