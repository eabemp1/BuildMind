import { describe, expect, it } from "vitest";
import { sanitizeOutput, sanitizeMarkdown } from "@/lib/sanitizeOutput";

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

describe("sanitizeMarkdown", () => {
  it("returns an empty string for empty, null, and undefined input", () => {
    expect(sanitizeMarkdown("")).toBe("");
    expect(sanitizeMarkdown(null)).toBe("");
    expect(sanitizeMarkdown(undefined)).toBe("");
  });

  it("preserves bold, italic, and heading markdown syntax", () => {
    expect(sanitizeMarkdown("**bold** and *italic*")).toBe("**bold** and *italic*");
    expect(sanitizeMarkdown("## Heading")).toBe("## Heading");
  });

  it("preserves table syntax", () => {
    const table = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    expect(sanitizeMarkdown(table)).toBe(table);
  });

  it("strips invisible/control characters without touching markdown", () => {
    expect(sanitizeMarkdown("**bold\u200B**")).toBe("**bold**");
  });

  it("strips a code fence that wraps the entire response", () => {
    expect(sanitizeMarkdown("```\nhello **world**\n```")).toBe("hello **world**");
  });

  it("does not strip a code fence that only wraps part of the response", () => {
    const input = "Some text\n```js\nconst x = 1;\n```\nMore text";
    expect(sanitizeMarkdown(input)).toBe(input);
  });

  it("collapses consecutive blank lines to max two", () => {
    expect(sanitizeMarkdown("A\n\n\n\nB")).toBe("A\n\nB");
  });
});
